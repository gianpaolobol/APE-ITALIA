import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { AuthService } from './auth.service';
import { CasesController } from './cases.controller';
import { MeController } from './me.controller';
import type { PrismaService } from './prisma.service';

/** End-to-end authorization on PostgreSQL: real signature verification (local JWKS fixture) + real memberships. */
const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: signed JWT + membership authorization', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const orgA = randomUUID(), orgB = randomUUID(), orgC = randomUUID();
 const subject = 'synthetic-subject-' + randomUUID();
 const ISSUER = 'https://id.example.test/';
 let key: CryptoKey, jwk: JWK, auth: AuthService;
 const bearer = (sub = subject) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  await db.organization.createMany({ data: [{ id: orgA, name: 'Synthetic A' }, { id: orgB, name: 'Synthetic B' }, { id: orgC, name: 'Synthetic C' }] });
  await db.membership.createMany({ data: [
   { organizationId: orgA, userSubject: subject, role: 'owner' },
   { organizationId: orgB, userSubject: subject, role: 'member', active: false },
  ] });
  await db.property.create({ data: { organizationId: orgC, address: 'Synthetic C', city: 'Bologna', region: 'Emilia-Romagna' } });
 });
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await db.property.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await db.membership.deleteMany({ where: { organizationId: { in: [orgA, orgB, orgC] } } });
  await db.organization.deleteMany({ where: { id: { in: [orgA, orgB, orgC] } } });
  await db.$disconnect();
 });

 it('/v1/me lists only active memberships', async () => {
  const me = await new MeController(db as unknown as PrismaService, auth).me(await bearer());
  expect(me.memberships).toEqual([{ organizationId: orgA, organizationName: 'Synthetic A', role: 'owner' }]);
 });
 it('authorizes the active membership', async () => {
  expect(await auth.authorize(await bearer(), orgA)).toMatchObject({ organizationId: orgA, role: 'owner' });
 });
 it('rejects the revoked membership', async () => {
  await expect(auth.authorize(await bearer(), orgB)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('rejects an organization without membership and leaks nothing', async () => {
  const controller = new CasesController(db as unknown as PrismaService, auth);
  await expect(controller.listProperties(await bearer(), orgC)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('creates and audits a property with the verified subject as actor', async () => {
  const controller = new CasesController(db as unknown as PrismaService, auth);
  const p = await controller.createProperty({ address: 'Via Sintetica 1', city: 'Bologna', region: 'Emilia-Romagna' }, await bearer(), orgA);
  const audit = await db.auditEvent.findFirst({ where: { organizationId: orgA, resourceId: p.id, action: 'property.create' } });
  expect(audit?.actorId).toBe(subject);
 });
});
