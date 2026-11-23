import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { AuthService } from './auth.service';
import { MembersController } from './members.controller';
import { MeController } from './me.controller';
import { createOrganizationWithOwner } from './admin/provisioning';
import type { PrismaService } from './prisma.service';

/** Full provisioning lifecycle on PostgreSQL with signed synthetic tokens. */
const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: organization provisioning, invitations and revocation', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const ISSUER = 'https://id.example.test/';
 const owner = 'synthetic-owner-' + randomUUID();
 const invitee = 'synthetic-invitee-' + randomUUID();
 const outsider = 'synthetic-outsider-' + randomUUID();
 let key: CryptoKey, auth: AuthService, members: MembersController, me: MeController, orgId = '', otherOrg = '';
 const bearer = (sub: string) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setIssuer(ISSUER).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(key).then(t => 'Bearer ' + t);

 beforeAll(async () => {
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256' };
  auth = new AuthService(db as unknown as PrismaService, { issuer: ISSUER, audience: 'ape-italia-api', keys: createLocalJWKSet({ keys: [jwk] }) });
  members = new MembersController(db as unknown as PrismaService, auth);
  me = new MeController(db as unknown as PrismaService, auth);
  orgId = (await createOrganizationWithOwner(db, { name: 'Synthetic Studio', ownerSubject: owner, operator: 'ci-test' })).organizationId;
  otherOrg = (await createOrganizationWithOwner(db, { name: 'Other Synthetic', ownerSubject: outsider, operator: 'ci-test' })).organizationId;
 });
 afterAll(async () => {
  const ids = [orgId, otherOrg].filter(Boolean);
  await db.auditEvent.deleteMany({ where: { organizationId: { in: ids } } });
  await db.invitation.deleteMany({ where: { organizationId: { in: ids } } });
  await db.membership.deleteMany({ where: { organizationId: { in: ids } } });
  await db.organization.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
 });

 it('operator bootstrap creates the owner membership with audit', async () => {
  const meRes = await me.me(await bearer(owner));
  expect(meRes.memberships).toEqual([{ organizationId: orgId, organizationName: 'Synthetic Studio', role: 'owner' }]);
  expect(await db.auditEvent.count({ where: { organizationId: orgId, actorId: 'operator:ci-test' } })).toBe(2);
 });

 it('invitation code is single use and creates the membership', async () => {
  const inv = await members.createInvitation({ role: 'member' }, await bearer(owner), orgId);
  const stored = await db.invitation.findUniqueOrThrow({ where: { id: inv.id } });
  expect(stored.codeHash).not.toBe(inv.code);
  expect(await members.accept({ code: inv.code }, await bearer(invitee))).toEqual({ organizationId: orgId, role: 'member' });
  await expect(members.accept({ code: inv.code }, await bearer(outsider))).rejects.toThrow('Invitation not valid');
  expect((await me.me(await bearer(invitee))).memberships.map(m => m.organizationId)).toEqual([orgId]);
 });

 it('an outsider owner cannot manage another tenant', async () => {
  await expect(members.list(await bearer(outsider), orgId)).rejects.toBeInstanceOf(ForbiddenException);
 });

 it('revoked invitations cannot be redeemed', async () => {
  const inv = await members.createInvitation({ role: 'viewer' }, await bearer(owner), orgId);
  await members.revokeInvitation(inv.id, await bearer(owner), orgId);
  await expect(members.accept({ code: inv.code }, await bearer(outsider))).rejects.toThrow('Invitation not valid');
 });

 it('revoking a membership removes access immediately', async () => {
  const list = await members.list(await bearer(owner), orgId);
  const target = list.find(m => m.userSubject === invitee)!;
  await members.update(target.id, { active: false }, await bearer(owner), orgId);
  await expect(auth.authorize(await bearer(invitee), orgId)).rejects.toBeInstanceOf(ForbiddenException);
  expect((await me.me(await bearer(invitee))).memberships).toEqual([]);
  expect(await db.auditEvent.count({ where: { organizationId: orgId, action: 'membership.revoke', resourceId: target.id } })).toBe(1);
 });

 it('the last owner cannot be removed', async () => {
  const list = await members.list(await bearer(owner), orgId);
  const self = list.find(m => m.userSubject === owner)!;
  await expect(members.update(self.id, { role: 'member' }, await bearer(owner), orgId)).rejects.toBeInstanceOf(ConflictException);
 });

 it('a new invitation reactivates a revoked member with the invited role', async () => {
  const inv = await members.createInvitation({ role: 'viewer' }, await bearer(owner), orgId);
  expect(await members.accept({ code: inv.code }, await bearer(invitee))).toEqual({ organizationId: orgId, role: 'viewer' });
  expect(await auth.authorize(await bearer(invitee), orgId)).toMatchObject({ role: 'viewer' });
 });

 it('active members cannot consume an invitation again', async () => {
  const inv = await members.createInvitation({ role: 'member' }, await bearer(owner), orgId);
  await expect(members.accept({ code: inv.code }, await bearer(invitee))).rejects.toBeInstanceOf(ConflictException);
  const stored = await db.invitation.findUniqueOrThrow({ where: { id: inv.id } });
  expect(stored.acceptedAt).toBeNull();
 });
});
