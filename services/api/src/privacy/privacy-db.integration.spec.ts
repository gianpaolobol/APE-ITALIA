import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { CasesController } from '../cases.controller';
import { EvidenceController } from '../evidence/evidence.controller';
import { EncryptedFileStorage } from '../evidence/storage';
import { notConfiguredScanner } from '../evidence/file-policy';
import { CURRENT_NOTICES } from '../evidence/consent-policy';
import { jpegWithExif } from '../evidence/fixtures';
import { LifecycleController } from '../lifecycle/lifecycle.controller';
import { createOrganizationWithOwner } from '../admin/provisioning';
import { exportSubjectData, purgeExpiredEvidence } from './privacy';
import type { PrismaService } from '../prisma.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: subject data export and evidence retention', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const ISSUER = 'https://id.example.test/';
 const subject = 'synthetic-subject-' + randomUUID();
 let key: CryptoKey, storage: EncryptedFileStorage, org = '', cancelledCase = '', activeCase = '', storageKey = '';
 const bearer = () => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(subject).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  storage = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-priv-')), randomBytes(32));
  const pdb = db as unknown as PrismaService;
  const cases = new CasesController(pdb, auth), ev = new EvidenceController(pdb, auth, storage, notConfiguredScanner), life = new LifecycleController(pdb, auth);
  org = (await createOrganizationWithOwner(db, { name: 'Synthetic Privacy', ownerSubject: subject, operator: 'ci-test' })).organizationId;
  const p = await cases.createProperty({ address: 'Via Sintetica 7', city: 'Comune Test', region: 'Regione-Priv' }, await bearer(), org);
  for (const which of ['cancelled', 'active'] as const) {
   const c = await cases.createCase({ propertyId: p.id }, await bearer(), org);
   await ev.consent(c.id, { kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing }, await bearer(), org);
   const img = Buffer.concat([jpegWithExif(), Buffer.from(which)]);
   await ev.upload(c.id, { buffer: img, size: img.length }, { kind: 'boiler' }, await bearer(), org);
   if (which === 'cancelled') { cancelledCase = c.id; await life.cancel(c.id, { reason: 'Test retention' }, await bearer(), org); }
   else activeCase = c.id;
  }
  storageKey = (await db.evidence.findFirstOrThrow({ where: { caseId: cancelledCase } })).storageKey;
  await db.$executeRaw`UPDATE "ApeCase" SET "updatedAt" = NOW() - INTERVAL '200 days' WHERE "id" IN (${cancelledCase}, ${activeCase})`;
 });
 afterAll(async () => {
  for (const t of ['auditEvent', 'evidence', 'consent', 'apeCase', 'property', 'membership'] as const) {
   await (db[t] as unknown as { deleteMany(a: unknown): Promise<unknown> }).deleteMany({ where: { organizationId: org } });
  }
  await db.organization.deleteMany({ where: { id: org } });
  await db.$disconnect();
 });

 it('exports what is linked to the subject', async () => {
  const d = await exportSubjectData(db, subject);
  expect(d.memberships).toEqual([expect.objectContaining({ organizationId: org, role: 'owner' })]);
  expect(d.consents).toHaveLength(2);
  expect(d.uploadedEvidence).toHaveLength(2);
  expect(d.auditTrail.map(a => a.action)).toEqual(expect.arrayContaining(['property.create', 'case.cancel']));
  await expect(exportSubjectData(db, 'has space')).rejects.toThrow();
 });
 it('dry run reports but deletes nothing', async () => {
  const r = await purgeExpiredEvidence(db, storage, { cancelledCaseEvidenceDays: 90, closedCaseEvidenceDays: 730 });
  expect(r.applied).toBe(false);
  expect(r.cases.filter(c => c.caseId === cancelledCase || c.caseId === activeCase)).toEqual([{ caseId: cancelledCase, status: 'CANCELLED', files: 1 }]);
  expect(await db.evidence.count({ where: { caseId: cancelledCase } })).toBe(1);
 });
 it('apply deletes files and rows of expired cancelled cases only, with audit', async () => {
  await purgeExpiredEvidence(db, storage, { cancelledCaseEvidenceDays: 90, closedCaseEvidenceDays: 730 }, { apply: true });
  expect(await db.evidence.count({ where: { caseId: cancelledCase } })).toBe(0);
  await expect(storage.get(storageKey)).rejects.toThrow();
  expect(await db.evidence.count({ where: { caseId: activeCase } })).toBe(1);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'evidence.purge', resourceId: cancelledCase } })).toBe(1);
 });
});
