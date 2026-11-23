import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from '../auth.service';
import { CasesController } from '../cases.controller';
import { CertifierController } from '../certifiers/certifier.controller';
import { MembersController } from '../members.controller';
import { createOrganizationWithOwner, registerVerifiedCertifier } from '../admin/provisioning';
import { LifecycleController } from './lifecycle.controller';
import type { PrismaService } from '../prisma.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: evidence requests, cancellation and certifier withdrawal', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const REGION = 'Regione-Life-' + randomUUID().slice(0, 8);
 const ISSUER = 'https://id.example.test/';
 const customer = 'synthetic-customer-' + randomUUID(), viewer = 'synthetic-viewer-' + randomUUID();
 const certA = 'synthetic-cert-a-' + randomUUID(), certB = 'synthetic-cert-b-' + randomUUID();
 let key: CryptoKey, cases: CasesController, cert: CertifierController, life: LifecycleController, org = '', propertyId = '';
 const certIds: string[] = [];
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);
 const newSubmittedCase = async () => {
  const c = await cases.createCase({ propertyId }, await bearer(customer), org);
  await cases.submitCase(c.id, await bearer(customer), org);
  return c.id;
 };
 const status = async (id: string) => (await db.apeCase.findUniqueOrThrow({ where: { id } })).status;

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  const auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  const pdb = db as unknown as PrismaService;
  cases = new CasesController(pdb, auth); cert = new CertifierController(pdb, auth, null); life = new LifecycleController(pdb, auth);
  org = (await createOrganizationWithOwner(db, { name: 'Synthetic Life', ownerSubject: customer, operator: 'ci-test' })).organizationId;
  const members = new MembersController(pdb, auth);
  const inv = await members.createInvitation({ role: 'viewer' }, await bearer(customer), org);
  await members.accept({ code: inv.code }, await bearer(viewer));
  for (const s of [certA, certB]) { certIds.push((await registerVerifiedCertifier(db, { subject: s, displayName: s.slice(0, 20), registrationId: 'TEST-L', regions: [REGION], operator: 'ci-test' })).id); await new Promise(r => setTimeout(r, 5)); }
  propertyId = (await cases.createProperty({ address: 'Via Sintetica 6', city: 'Comune Test', region: REGION }, await bearer(customer), org)).id;
 });
 afterAll(async () => {
  for (const t of ['evidenceRequest', 'inspection', 'auditEvent', 'assignment', 'apeCase', 'property', 'invitation', 'membership'] as const) {
   await (db[t] as unknown as { deleteMany(a: unknown): Promise<unknown> }).deleteMany({ where: { organizationId: org } });
  }
  await db.organization.deleteMany({ where: { id: org } });
  await db.certifier.deleteMany({ where: { id: { in: certIds } } });
  await db.$disconnect();
 });

 it('evidence request pauses the case and resolution restores the previous state', async () => {
  const id = await newSubmittedCase();
  const [offer] = (await cert.list(await bearer(certA))).filter(o => o.caseId === id);
  await cert.accept(offer.id, await bearer(certA));
  await cert.schedule(offer.id, { scheduledAt: new Date(Date.now() + 86400_000).toISOString() }, await bearer(certA));
  await expect(life.requestEvidence(offer.id, { message: 'troppo corto', kinds: ['selfie'] }, await bearer(certA))).rejects.toBeInstanceOf(BadRequestException);
  const r = await life.requestEvidence(offer.id, { message: 'Serve la foto della targhetta della caldaia leggibile', kinds: ['boiler'] }, await bearer(certA));
  expect(await status(id)).toBe('AWAITING_EVIDENCE');
  await expect(cert.report(offer.id, {}, await bearer(certA))).rejects.toBeInstanceOf(ConflictException);
  expect((await cases.caseSummaries(await bearer(customer), org)).find(c => c.id === id)?.openEvidenceRequests).toBe(1);
  await expect(life.resolve(id, r.id, await bearer(viewer), org)).rejects.toBeInstanceOf(ForbiddenException);
  expect((await life.resolve(id, r.id, await bearer(customer), org)).status).toBe('INSPECTION_SCHEDULED');
  await expect(life.resolve(id, r.id, await bearer(customer), org)).rejects.toBeInstanceOf(ConflictException);
 });

 it('certifier withdrawal cancels the inspection and re-offers to the next certifier', async () => {
  const id = await newSubmittedCase();
  const mine = async (sub: string) => (await cert.list(await bearer(sub))).filter(o => o.caseId === id);
  const first = (await mine(certA))[0] ?? (await mine(certB))[0];
  const firstSub = (await mine(certA)).length ? certA : certB, otherSub = firstSub === certA ? certB : certA;
  await cert.accept(first.id, await bearer(firstSub));
  await cert.schedule(first.id, { scheduledAt: new Date(Date.now() + 86400_000).toISOString() }, await bearer(firstSub));
  await expect(life.withdraw(first.id, {}, await bearer(firstSub))).rejects.toBeInstanceOf(BadRequestException);
  expect(await life.withdraw(first.id, { reason: 'Indisponibilità' }, await bearer(firstSub))).toMatchObject({ status: 'WITHDRAWN', reoffered: true });
  expect(await status(id)).toBe('SUBMITTED');
  expect((await db.inspection.findUniqueOrThrow({ where: { assignmentId: first.id } })).status).toBe('CANCELLED');
  const [next] = await mine(otherSub);
  expect(next.status).toBe('OFFERED');
  expect((await cases.caseInspection(id, await bearer(customer), org)).inspection).toBeNull();
 });

 it('customer cancellation withdraws offers and blocks further work', async () => {
  const id = await newSubmittedCase();
  await expect(life.cancel(id, {}, await bearer(customer), org)).rejects.toBeInstanceOf(BadRequestException);
  await expect(life.cancel(id, { reason: 'Vendita annullata' }, await bearer(viewer), org)).rejects.toBeInstanceOf(ForbiddenException);
  expect(await life.cancel(id, { reason: 'Vendita annullata' }, await bearer(customer), org)).toEqual({ id, status: 'CANCELLED' });
  expect(await db.assignment.count({ where: { caseId: id, status: { in: ['OFFERED', 'ACCEPTED'] } } })).toBe(0);
  expect((await cert.list(await bearer(certA))).some(o => o.caseId === id) || (await cert.list(await bearer(certB))).some(o => o.caseId === id)).toBe(false);
  await expect(life.cancel(id, { reason: 'di nuovo' }, await bearer(customer), org)).rejects.toBeInstanceOf(ConflictException);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'case.cancel', resourceId: id } })).toBe(1);
 });
});
