import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { CasesController } from '../cases.controller';
import { EvidenceController } from '../evidence/evidence.controller';
import { EncryptedFileStorage } from '../evidence/storage';
import { notConfiguredScanner } from '../evidence/file-policy';
import { CURRENT_NOTICES } from '../evidence/consent-policy';
import { jpegWithExif } from '../evidence/fixtures';
import { createOrganizationWithOwner, registerVerifiedCertifier } from '../admin/provisioning';
import { CertifierController } from './certifier.controller';
import { expireStaleOffers } from './assignment.service';
import type { PrismaService } from '../prisma.service';

/** Uses a synthetic, test-only region name so that certifiers from other test files never match. */
const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: certifier matching, fallback and scoped access', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const REGION = 'Regione-Test-' + randomUUID().slice(0, 8);
 const ISSUER = 'https://id.example.test/';
 const customer = 'synthetic-customer-' + randomUUID();
 const certA = 'synthetic-cert-a-' + randomUUID(), certB = 'synthetic-cert-b-' + randomUUID(), certC = 'synthetic-cert-c-' + randomUUID();
 const conflicted = 'synthetic-cert-member-' + randomUUID();
 let key: CryptoKey, cases: CasesController, ev: EvidenceController, cert: CertifierController, org = '', caseId = '';
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);
 const certIds: string[] = [];

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  const storage = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-cert-')), randomBytes(32));
  cases = new CasesController(db as unknown as PrismaService, auth);
  ev = new EvidenceController(db as unknown as PrismaService, auth, storage, notConfiguredScanner);
  cert = new CertifierController(db as unknown as PrismaService, auth, storage);
  org = (await createOrganizationWithOwner(db, { name: 'Synthetic Requester', ownerSubject: customer, operator: 'ci-test' })).organizationId;
  await db.membership.create({ data: { organizationId: org, userSubject: conflicted, role: 'member' } });
  // Seniority order: conflicted (oldest) < A < B < C. The conflicted one must never be chosen.
  for (const [sub, name] of [[conflicted, 'Conflicted'], [certA, 'Cert A'], [certB, 'Cert B'], [certC, 'Cert C']] as const) {
   const c = await registerVerifiedCertifier(db, { subject: sub, displayName: name, registrationId: 'TEST-' + name.replace(' ', ''), regions: [REGION], operator: 'ci-test' });
   certIds.push(c.id);
   await new Promise(r => setTimeout(r, 5));
  }
  await db.certifier.create({ data: { userSubject: 'synthetic-unverified-' + randomUUID(), displayName: 'Unverified', registrationId: 'TEST-U', regions: [REGION] } }).then(c => certIds.push(c.id));
  const p = await cases.createProperty({ address: 'Via Sintetica 3', city: 'Comune Test', region: REGION, floorAreaM2: 80 }, await bearer(customer), org);
  caseId = (await cases.createCase({ propertyId: p.id }, await bearer(customer), org)).id;
  await ev.consent(caseId, { kind: 'evidence_processing', version: CURRENT_NOTICES.evidence_processing }, await bearer(customer), org);
  await ev.upload(caseId, { buffer: jpegWithExif(), size: jpegWithExif().length }, { kind: 'boiler' }, await bearer(customer), org);
 });
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.assignment.deleteMany({ where: { organizationId: org } });
  await db.evidence.deleteMany({ where: { organizationId: org } });
  await db.consent.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: org } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.membership.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.certifier.deleteMany({ where: { id: { in: certIds } } });
  await db.$disconnect();
 });

 it('submission offers the case to the most senior eligible certifier, skipping the conflicted member', async () => {
  await cases.submitCase(caseId, await bearer(customer), org);
  const offers = await db.assignment.findMany({ where: { caseId }, include: { certifier: true } });
  expect(offers.map(o => o.certifier.userSubject)).toEqual([certA]);
 });
 it('before acceptance the certifier sees only municipality and region, and no evidence', async () => {
  const [a] = await cert.list(await bearer(certA));
  expect(a.property).toEqual({ city: 'Comune Test', region: REGION });
  await expect(cert.evidence(a.id, await bearer(certA))).rejects.toBeInstanceOf(NotFoundException);
 });
 it('another certifier cannot act on the offer', async () => {
  const [a] = await cert.list(await bearer(certA));
  await expect(cert.accept(a.id, await bearer(certB))).rejects.toBeInstanceOf(NotFoundException);
 });
 it('non-certifiers and unverified profiles are rejected', async () => {
  await expect(cert.list(await bearer(customer))).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('decline falls back to the next eligible certifier', async () => {
  const [a] = await cert.list(await bearer(certA));
  expect(await cert.decline(a.id, { reason: 'Agenda piena' }, await bearer(certA))).toMatchObject({ status: 'DECLINED', reoffered: true });
  const [b] = await cert.list(await bearer(certB));
  expect(b.status).toBe('OFFERED');
 });
 it('expired offers are swept and re-offered', async () => {
  await db.assignment.updateMany({ where: { caseId, status: 'OFFERED' }, data: { expiresAt: new Date(Date.now() - 1000) } });
  expect(await cert.list(await bearer(certB))).toEqual([]);
  await db.$transaction(tx => expireStaleOffers(tx));
  const [c] = await cert.list(await bearer(certC));
  expect(c.status).toBe('OFFERED');
 });
 it('acceptance assigns the case and unlocks address and evidence for that certifier only', async () => {
  const [c] = await cert.list(await bearer(certC));
  await cert.accept(c.id, await bearer(certC));
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: caseId } })).status).toBe('ASSIGNED');
  const [accepted] = await cert.list(await bearer(certC));
  expect(accepted.property).toMatchObject({ address: 'Via Sintetica 3', floorAreaM2: 80 });
  const files = await cert.evidence(c.id, await bearer(certC));
  expect(files).toHaveLength(1);
  process.env.EVIDENCE_ALLOW_UNSCANNED = '1';
  try {
   await cert.content(c.id, files[0].id, await bearer(certC));
  } finally { delete process.env.EVIDENCE_ALLOW_UNSCANNED; }
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'evidence.read', actorId: `certifier:${certC}` } })).toBe(1);
  await expect(cert.evidence(c.id, await bearer(certA))).rejects.toBeInstanceOf(NotFoundException);
 });
 it('the full assignment history is audited for the requesting organization', async () => {
  // Events in one transaction may share a timestamp: compare counts, not order.
  const actions = (await db.auditEvent.findMany({ where: { organizationId: org, action: { startsWith: 'assignment.' } } })).map(a => a.action);
  const count = (x: string) => actions.filter(a => a === x).length;
  expect([count('assignment.offer'), count('assignment.decline'), count('assignment.expire'), count('assignment.accept')]).toEqual([3, 1, 1, 1]);
 });
});
