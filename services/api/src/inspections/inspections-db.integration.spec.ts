import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { CasesController } from '../cases.controller';
import { CertifierController } from '../certifiers/certifier.controller';
import { createOrganizationWithOwner, registerVerifiedCertifier } from '../admin/provisioning';
import type { PrismaService } from '../prisma.service';
import { CURRENT_NOTICES } from '../evidence/consent-policy';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: inspection scheduling and immutable report', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const REGION = 'Regione-Insp-' + randomUUID().slice(0, 8);
 const ISSUER = 'https://id.example.test/';
 const customer = 'synthetic-customer-' + randomUUID(), certSub = 'synthetic-cert-' + randomUUID();
 let key: CryptoKey, cases: CasesController, cert: CertifierController, org = '', caseId = '', assignmentId = '', certifierId = '';
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  cases = new CasesController(db as unknown as PrismaService, auth);
  cert = new CertifierController(db as unknown as PrismaService, auth, null);
  org = (await createOrganizationWithOwner(db, { name: 'Synthetic Insp', ownerSubject: customer, operator: 'ci-test' })).organizationId;
  certifierId = (await registerVerifiedCertifier(db, { subject: certSub, displayName: 'Cert Insp', registrationId: 'TEST-INSP', regions: [REGION], operator: 'ci-test' })).id;
  const p = await cases.createProperty({ address: 'Via Sintetica 4', city: 'Comune Test', region: REGION }, await bearer(customer), org);
  caseId = (await cases.createCase({ propertyId: p.id }, await bearer(customer), org)).id;
  await db.consent.create({ data: { organizationId: org, caseId, subject: customer, kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing } });
  await cases.submitCase(caseId, await bearer(customer), org);
  assignmentId = (await cert.list(await bearer(certSub)))[0].id;
 });
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.inspection.deleteMany({ where: { organizationId: org } });
  await db.assignment.deleteMany({ where: { organizationId: org } });
  await db.consent.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: org } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.membership.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.certifier.deleteMany({ where: { id: certifierId } });
  await db.$disconnect();
 });

 const soon = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();
 const report = (performedAt: string) => ({ performedAt, attendees: 'Proprietario (sintetico)', declaration: true, findings: [
  { field: 'heating.generator.type', status: 'verified', value: 'caldaia_condensazione', source: 'inspection' },
  { field: 'envelope.wall.insulation', status: 'undeterminable', source: 'inspection', note: 'Nessun saggio' },
 ] });

 it('cannot schedule before accepting the offer', async () => {
  await expect(cert.schedule(assignmentId, { scheduledAt: soon(24) }, await bearer(certSub))).rejects.toBeInstanceOf(NotFoundException);
 });
 it('schedules after acceptance and moves the case to INSPECTION_SCHEDULED', async () => {
  await cert.accept(assignmentId, await bearer(certSub));
  await cert.schedule(assignmentId, { scheduledAt: soon(24) }, await bearer(certSub));
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('INSPECTION_SCHEDULED');
 });
 it('customer sees date and certifier name, not the technical report', async () => {
  const view = await cases.caseInspection(caseId, await bearer(customer), org);
  expect(view.inspection).toMatchObject({ status: 'SCHEDULED', certifierName: 'Cert Insp' });
  expect(JSON.stringify(view)).not.toContain('findings');
 });
 it('can reschedule while not yet performed', async () => {
  const when = soon(1);
  const i = await cert.schedule(assignmentId, { scheduledAt: when }, await bearer(certSub));
  expect(i.scheduledAt.toISOString()).toBe(when);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'inspection.reschedule' } })).toBe(1);
 });
 it('export is refused before the report exists', async () => {
  await expect(cert.export(assignmentId, undefined, await bearer(certSub))).rejects.toBeInstanceOf(ConflictException);
 });
 it('rejects invalid reports without changing state', async () => {
  await expect(cert.report(assignmentId, { ...report(new Date().toISOString()), declaration: false }, await bearer(certSub))).rejects.toBeInstanceOf(BadRequestException);
  expect((await db.inspection.findUniqueOrThrow({ where: { assignmentId } })).status).toBe('SCHEDULED');
 });
 it('rejects findings referencing evidence of another case', async () => {
  const r = report(new Date().toISOString());
  (r.findings[0] as Record<string, unknown>).evidenceId = randomUUID();
  await expect(cert.report(assignmentId, r, await bearer(certSub))).rejects.toThrow('outside this case');
 });
 it('stores the report once, moves the case to INSPECTION_DONE and is immutable afterwards', async () => {
  const res = await cert.report(assignmentId, report(new Date().toISOString()), await bearer(certSub));
  expect(res.summary).toEqual({ verified: 1, to_verify: 0, undeterminable: 1 });
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('INSPECTION_DONE');
  await expect(cert.report(assignmentId, report(new Date().toISOString()), await bearer(certSub))).rejects.toBeInstanceOf(ConflictException);
  await expect(cert.schedule(assignmentId, { scheduledAt: soon(48) }, await bearer(certSub))).rejects.toBeInstanceOf(ConflictException);
  expect((await cert.inspection(assignmentId, await bearer(certSub))).inspection?.status).toBe('DONE');
  const stored = await db.inspection.findUniqueOrThrow({ where: { assignmentId } });
  expect((stored.report as { findings: unknown[] }).findings).toHaveLength(2);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'inspection.report' } })).toBe(1);
 });
 it('exports JSON and CSV after the report, audited', async () => {
  const doc = await cert.export(assignmentId, undefined, await bearer(certSub)) as { schema: string; inspection: { findings: unknown[] }; property: { address: string } };
  expect(doc.schema).toBe('ape-italia/case-export');
  expect(doc.inspection.findings).toHaveLength(2);
  expect(doc.property.address).toBe('Via Sintetica 4');
  const csv = await cert.export(assignmentId, 'csv', await bearer(certSub));
  expect(csv).toBeInstanceOf(StreamableFile);
  await expect(cert.export(assignmentId, 'xml', await bearer(certSub))).rejects.toBeInstanceOf(BadRequestException);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'case.export' } })).toBe(2);
 });
 it('cannot export another certifier\'s completed assignment in either format', async () => {
  const otherSub = 'synthetic-other-cert-' + randomUUID();
  const other = await registerVerifiedCertifier(db, {
   subject: otherSub, displayName: 'Other Synthetic Certifier', registrationId: 'TEST-' + randomUUID(),
   regions: [REGION], operator: 'ci-test',
  });
  try {
   const otherToken = await bearer(otherSub);
   const customerToken = await bearer(customer);
   expect((await cert.me(otherToken)).id).toBe(other.id);
   const before = await db.auditEvent.count({ where: { organizationId: org, action: 'case.export' } });
   for (const format of ['json', 'csv']) {
    await expect(cert.export(assignmentId, format, otherToken)).rejects.toBeInstanceOf(NotFoundException);
    await expect(cert.export(assignmentId, format, customerToken)).rejects.toBeInstanceOf(ForbiddenException);
   }
   expect(await db.auditEvent.count({ where: { organizationId: org, action: 'case.export' } })).toBe(before);
  } finally {
   await db.certifier.delete({ where: { id: other.id } });
  }
 });
});
