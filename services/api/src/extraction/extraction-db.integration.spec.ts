import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, HttpException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { CasesController } from '../cases.controller';
import { CertifierController } from '../certifiers/certifier.controller';
import { EvidenceController } from '../evidence/evidence.controller';
import { EncryptedFileStorage } from '../evidence/storage';
import { notConfiguredScanner } from '../evidence/file-policy';
import { CURRENT_NOTICES } from '../evidence/consent-policy';
import { jpegWithExif } from '../evidence/fixtures';
import { createOrganizationWithOwner, registerVerifiedCertifier } from '../admin/provisioning';
import { ExtractionController } from './extraction.controller';
import { extractionMetrics } from './metrics';
import type { ExtractionProvider } from './provider';
import type { PrismaService } from '../prisma.service';

/** Deterministic test double: returns fixed candidates (two valid, two invalid). Not an AI model. */
const fakeProvider: ExtractionProvider = {
 modelId: 'test-double/fixed@1',
 extract: async () => [
  { field: 'heating.generator.type', value: 'caldaia_condensazione', confidence: 0.91 },
  { field: 'heating.generator.nominal_power_kw', value: 24, confidence: 1.7 },
  { field: 'energy.class', value: 'A4', confidence: 0.99 },
  { field: 'windows.glazing', value: 'quadruplo' },
 ],
};

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: AI extraction under certifier review', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const REGION = 'Regione-AI-' + randomUUID().slice(0, 8);
 const ISSUER = 'https://id.example.test/';
 const customer = 'synthetic-customer-' + randomUUID(), certSub = 'synthetic-cert-' + randomUUID();
 let key: CryptoKey, cert: CertifierController, ext: ExtractionController, noProvider: ExtractionController, org = '', assignmentId = '', evidenceId = '', certifierId = '';
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  const storage = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-ai-')), randomBytes(32));
  const pdb = db as unknown as PrismaService;
  const cases = new CasesController(pdb, auth);
  const ev = new EvidenceController(pdb, auth, storage, notConfiguredScanner);
  cert = new CertifierController(pdb, auth, storage);
  ext = new ExtractionController(pdb, auth, storage, fakeProvider);
  noProvider = new ExtractionController(pdb, auth, storage, null);
  org = (await createOrganizationWithOwner(db, { name: 'Synthetic AI', ownerSubject: customer, operator: 'ci-test' })).organizationId;
  certifierId = (await registerVerifiedCertifier(db, { subject: certSub, displayName: 'Cert AI', registrationId: 'TEST-AI', regions: [REGION], operator: 'ci-test' })).id;
  const p = await cases.createProperty({ address: 'Via Sintetica 5', city: 'Comune Test', region: REGION }, await bearer(customer), org);
  const caseId = (await cases.createCase({ propertyId: p.id }, await bearer(customer), org)).id;
  await ev.consent(caseId, { kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing }, await bearer(customer), org);
  evidenceId = (await ev.upload(caseId, { buffer: jpegWithExif(), size: 100 }, { kind: 'boiler' }, await bearer(customer), org)).id;
  await cases.submitCase(caseId, await bearer(customer), org);
  assignmentId = (await cert.list(await bearer(certSub)))[0].id;
 });
 afterAll(async () => {
  const fields = await db.extractedField.findMany({ where: { organizationId: org }, select: { id: true } });
  await db.extractedFieldRevision.deleteMany({ where: { extractedFieldId: { in: fields.map(f => f.id) } } });
  await db.extractedField.deleteMany({ where: { organizationId: org } });
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.assignment.deleteMany({ where: { organizationId: org } });
  await db.evidence.deleteMany({ where: { organizationId: org } });
  await db.consent.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: org } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.membership.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.certifier.deleteMany({ where: { id: certifierId } });
  await db.$disconnect();
 });

 it('requires an accepted assignment', async () => {
  await expect(ext.extract(assignmentId, evidenceId, await bearer(certSub))).rejects.toBeInstanceOf(NotFoundException);
  await cert.accept(assignmentId, await bearer(certSub));
 });
 it('answers 503 when no provider is configured', async () => {
  await expect(noProvider.extract(assignmentId, evidenceId, await bearer(certSub))).rejects.toBeInstanceOf(ServiceUnavailableException);
 });
 it('never sends unscanned files to the provider', async () => {
  await expect(ext.extract(assignmentId, evidenceId, await bearer(certSub))).rejects.toBeInstanceOf(HttpException);
  expect(await db.extractedField.count({ where: { evidenceId } })).toBe(0);
 });
 it('stores only valid vocabulary candidates as needs_review with provenance', async () => {
  await db.evidence.update({ where: { id: evidenceId }, data: { scanStatus: 'clean' } }); // simulated clean scan result
  expect(await ext.extract(assignmentId, evidenceId, await bearer(certSub))).toEqual({ modelId: 'test-double/fixed@1', candidates: 2, discarded: 2 });
  const rows = await ext.list(assignmentId, await bearer(certSub));
  expect(rows.map(r => [r.field, r.status, r.confidence, r.unit])).toEqual([
   ['heating.generator.nominal_power_kw', 'needs_review', 1, 'kW'],
   ['heating.generator.type', 'needs_review', 0.91, null],
  ]);
  expect(rows.every(r => r.evidenceId === evidenceId && r.modelId === 'test-double/fixed@1' && r.revisions[0].action === 'extracted')).toBe(true);
  await expect(ext.extract(assignmentId, evidenceId, await bearer(certSub))).rejects.toBeInstanceOf(ConflictException);
 });
 it('records accept and correction with full history; reviews are final', async () => {
  const rows = await ext.list(assignmentId, await bearer(certSub));
  const type = rows.find(r => r.field === 'heating.generator.type')!;
  const power = rows.find(r => r.field === 'heating.generator.nominal_power_kw')!;
  await expect(ext.review(assignmentId, power.id, { action: 'correct', value: 9999 }, await bearer(certSub))).rejects.toBeInstanceOf(BadRequestException);
  expect(await ext.review(assignmentId, type.id, { action: 'accept' }, await bearer(certSub))).toMatchObject({ status: 'accepted' });
  expect(await ext.review(assignmentId, power.id, { action: 'correct', value: 28, note: 'Targhetta letta sul posto' }, await bearer(certSub))).toMatchObject({ status: 'corrected', value: 28 });
  await expect(ext.review(assignmentId, power.id, { action: 'accept' }, await bearer(certSub))).rejects.toBeInstanceOf(ConflictException);
  const after = (await ext.list(assignmentId, await bearer(certSub))).find(r => r.id === power.id)!;
  expect(after.revisions.map(r => [r.action, r.previousValue, r.newValue])).toEqual([['extracted', null, 24], ['corrected', 24, 28]]);
  expect(after.reviewedBy).toBe(`certifier:${certSub}`);
 });
 it('exposes aggregate correction rates without values', async () => {
  const m = (await extractionMetrics(db)).filter(x => x.modelId === 'test-double/fixed@1');
  const power = m.find(x => x.field === 'heating.generator.nominal_power_kw');
  expect(power).toMatchObject({ corrected: 1, accepted: 0 });
  expect(JSON.stringify(m)).not.toContain('28');
 });
});
