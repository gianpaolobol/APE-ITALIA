import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { EvidenceController } from './evidence.controller';
import { EncryptedFileStorage } from './storage';
import { notConfiguredScanner } from './file-policy';
import { CURRENT_NOTICES } from './consent-policy';
import { createOrganizationWithOwner } from '../admin/provisioning';
import { jpegWithExif } from './fixtures';
import type { PrismaService } from '../prisma.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: consent-gated encrypted evidence upload', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const ISSUER = 'https://id.example.test/';
 const userA = 'synthetic-a-' + randomUUID(), userB = 'synthetic-b-' + randomUUID();
 let key: CryptoKey, ctrl: EvidenceController, orgA = '', orgB = '', caseA = '';
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);
 const blob = (b: Buffer) => ({ buffer: b, size: b.length });

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  const storage = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-db-ev-')), randomBytes(32));
  ctrl = new EvidenceController(db as unknown as PrismaService, auth, storage, notConfiguredScanner);
  orgA = (await createOrganizationWithOwner(db, { name: 'Synthetic A', ownerSubject: userA, operator: 'ci-test' })).organizationId;
  orgB = (await createOrganizationWithOwner(db, { name: 'Synthetic B', ownerSubject: userB, operator: 'ci-test' })).organizationId;
  const property = await db.property.create({ data: { organizationId: orgA, address: 'Via Sintetica 2', city: 'Bologna', region: 'Emilia-Romagna' } });
  caseA = (await db.apeCase.create({ data: { organizationId: orgA, propertyId: property.id } })).id;
 });
 afterAll(async () => {
  const ids = [orgA, orgB].filter(Boolean);
  await db.auditEvent.deleteMany({ where: { organizationId: { in: ids } } });
  await db.evidence.deleteMany({ where: { organizationId: { in: ids } } });
  await db.consent.deleteMany({ where: { organizationId: { in: ids } } });
  await db.apeCase.deleteMany({ where: { organizationId: { in: ids } } });
  await db.property.deleteMany({ where: { organizationId: { in: ids } } });
  await db.membership.deleteMany({ where: { organizationId: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
 });

 it('refuses upload without consent', async () => {
  await expect(ctrl.upload(caseA, blob(jpegWithExif()), { kind: 'boiler' }, await bearer(userA), orgA)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('records consent idempotently with audit', async () => {
  const body = { kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing };
  const a = await ctrl.consent(caseA, body, await bearer(userA), orgA);
  const b = await ctrl.consent(caseA, body, await bearer(userA), orgA);
  expect(a.id).toBe(b.id);
  expect(await db.auditEvent.count({ where: { organizationId: orgA, action: 'consent.accept' } })).toBe(1);
 });
 it('uploads, lists and reads back the stripped content', async () => {
  const ev = await ctrl.upload(caseA, blob(jpegWithExif()), { kind: 'boiler' }, await bearer(userA), orgA);
  const row = await db.evidence.findUniqueOrThrow({ where: { id: ev.id } });
  expect(row.storageKey).toBe(`org/${orgA}/case/${caseA}/${ev.id}`);
  expect((await ctrl.list(caseA, await bearer(userA), orgA)).map(e => e.id)).toEqual([ev.id]);
  process.env.EVIDENCE_ALLOW_UNSCANNED = '1';
  try {
   const file = await ctrl.content(ev.id, await bearer(userA), orgA);
   const chunks: Buffer[] = [];
   for await (const c of file.getStream()) chunks.push(Buffer.from(c));
   expect(Buffer.concat(chunks).includes(Buffer.from('GPS 44.4949N'))).toBe(false);
  } finally {
   delete process.env.EVIDENCE_ALLOW_UNSCANNED;
  }
  expect(await db.auditEvent.count({ where: { organizationId: orgA, action: 'evidence.read', resourceId: ev.id } })).toBe(1);
 });
 it('another tenant cannot list or download', async () => {
  const [ev] = await db.evidence.findMany({ where: { organizationId: orgA } });
  await expect(ctrl.list(caseA, await bearer(userB), orgB)).rejects.toBeInstanceOf(NotFoundException);
  process.env.EVIDENCE_ALLOW_UNSCANNED = '1';
  try {
   await expect(ctrl.content(ev.id, await bearer(userB), orgB)).rejects.toBeInstanceOf(NotFoundException);
  } finally {
   delete process.env.EVIDENCE_ALLOW_UNSCANNED;
  }
  await expect(ctrl.list(caseA, await bearer(userB), orgA)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('rejects a duplicate file in the same case', async () => {
  await expect(ctrl.upload(caseA, blob(jpegWithExif()), { kind: 'boiler' }, await bearer(userA), orgA)).rejects.toThrow('Duplicate');
 });
});
