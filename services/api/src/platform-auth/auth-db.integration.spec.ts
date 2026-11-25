import { afterAll, describe, expect, it } from 'vitest';
import { UnauthorizedException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../auth.service';
import { PlatformAuthController } from './auth.controller';
import { LogMailer } from './mailer';
import { platformAuthFromEnv } from './tokens';
import type { PrismaService } from '../prisma.service';

const enabled = process.env.RUN_DB_INTEGRATION === '1';

describe.skipIf(!enabled)('PostgreSQL: email-code login', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const cfg = platformAuthFromEnv({ PLATFORM_JWT_SECRET: 'integration-secret-'.padEnd(40, 'x') })!;
 const mailer = new LogMailer();
 const auth = new AuthService(db as unknown as PrismaService, null, cfg);
 const ctrl = new PlatformAuthController(db as unknown as PrismaService, auth, mailer, cfg);
 const email = `user-${Date.now()}@example.test`;
 const codeOf = () => /(\d{6})/.exec(mailer.sent.at(-1)!.text)![1];
 afterAll(async () => { await db.$disconnect(); });

 it('parallel wrong guesses cannot exceed the attempt limit, and the code then stops working', async () => {
  const target = `race-${Date.now()}@example.test`;
  await ctrl.start({ email: target });
  const right = codeOf();
  const wrong = right === '000000' ? '111111' : '000000';
  const results = await Promise.allSettled(Array.from({ length: 20 }, () => ctrl.verify({ email: target, code: wrong })));
  expect(results.every(r => r.status === 'rejected')).toBe(true);
  const row = await db.loginCode.findFirstOrThrow({ where: { email: target }, orderBy: { createdAt: 'desc' } });
  expect(row.attempts).toBe(5);
  await expect(ctrl.verify({ email: target, code: right })).rejects.toBeInstanceOf(UnauthorizedException);
 });

 it('concurrent issuances respect the hourly per-email cap and keep only one live code', async () => {
  const target = `issue-race-${Date.now()}@example.test`;
  const sentBefore = mailer.sent.length;
  const results = await Promise.all(Array.from({ length: 12 }, () => ctrl.start({ email: target })));
  expect(results.every(r => r.sent)).toBe(true);
  expect(await db.loginCode.count({ where: { email: target } })).toBe(6);
  expect(await db.loginCode.count({ where: { email: target, consumedAt: null } })).toBe(1);
  expect(mailer.sent.length - sentBefore).toBe(6);
 });

 it('consuming a new code never reactivates an older code', async () => {
  const target = `supersede-${Date.now()}@example.test`;
  await ctrl.start({ email: target });
  const older = codeOf();
  const first = await db.loginCode.findFirstOrThrow({ where: { email: target } });
  await ctrl.start({ email: target });
  const latest = codeOf();
  expect((await db.loginCode.findUniqueOrThrow({ where: { id: first.id } })).consumedAt).not.toBeNull();
  await ctrl.verify({ email: target, code: latest });
  await expect(ctrl.verify({ email: target, code: older })).rejects.toBeInstanceOf(UnauthorizedException);
  expect(await db.loginCode.count({ where: { email: target, consumedAt: null } })).toBe(0);
 });

 it('expired codes do not consume an attempt or create an account', async () => {
  const target = `expired-${Date.now()}@example.test`;
  await ctrl.start({ email: target });
  await db.loginCode.updateMany({ where: { email: target }, data: { expiresAt: new Date(Date.now() - 1000) } });
  await expect(ctrl.verify({ email: target, code: codeOf() })).rejects.toBeInstanceOf(UnauthorizedException);
  const row = await db.loginCode.findFirstOrThrow({ where: { email: target } });
  expect(row.attempts).toBe(0);
  expect(row.consumedAt).toBeNull();
  expect(await db.platformUser.count({ where: { email: target } })).toBe(0);
 });

 it('first login creates the account and a personal organization; the token authorizes it', async () => {
  await ctrl.start({ email });
  await expect(ctrl.verify({ email, code: codeOf() === '000000' ? '111111' : '000000' })).rejects.toBeInstanceOf(UnauthorizedException);
  const s = await ctrl.verify({ email, code: codeOf() });
  expect(s.organizationId).toBeTruthy();
  const a = await auth.authorize(`Bearer ${s.accessToken}`, s.organizationId!);
  expect(a.role).toBe('owner');
  await expect(ctrl.verify({ email, code: codeOf() })).rejects.toBeInstanceOf(UnauthorizedException); // single use
  const r = await ctrl.refresh({ refreshToken: s.refreshToken });
  expect(r.organizationId).toBe(s.organizationId);
  await expect(ctrl.refresh({ refreshToken: s.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException); // rotated
  await expect(ctrl.refresh({ refreshToken: r.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException); // reuse revoked all
 });

 it('account deletion revokes access', async () => {
  await ctrl.start({ email });
  const s = await ctrl.verify({ email, code: codeOf() });
  await ctrl.deleteAccount(`Bearer ${s.accessToken}`);
  await expect(auth.verify(`Bearer ${s.accessToken}`)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('account deletion preserves organization surveys and other members, and revokes the deleted account', async () => {
  const ownerEmail = `delete-owner-${Date.now()}@example.test`;
  const memberEmail = `delete-member-${Date.now()}@example.test`;
  await ctrl.start({ email: ownerEmail });
  const owner = await ctrl.verify({ email: ownerEmail, code: codeOf() });
  await ctrl.start({ email: memberEmail });
  const member = await ctrl.verify({ email: memberEmail, code: codeOf() });
  const organizationId = owner.organizationId!;
  await db.membership.create({ data: { organizationId, userSubject: member.user.subject, role: 'owner' } });
  const property = await db.property.create({ data: { organizationId, address: 'Synthetic 1', city: 'Test', region: 'Test' } });
  const draft = await db.apeCase.create({ data: { organizationId, propertyId: property.id, survey: { answer: 'shared draft' } } });
  const submitted = await db.apeCase.create({ data: { organizationId, propertyId: property.id, status: 'SUBMITTED', survey: { answer: 'submitted' } } });
  // Lack of another membership is not proof that every record belongs to the departing account.
  const separate = await db.organization.create({ data: { name: 'Synthetic separate organization' } });
  await db.membership.create({ data: { organizationId: separate.id, userSubject: owner.user.subject, role: 'owner' } });
  const separateProperty = await db.property.create({ data: { organizationId: separate.id, address: 'Synthetic 2', city: 'Test', region: 'Test' } });
  const unknown = await db.apeCase.create({ data: { organizationId: separate.id, propertyId: separateProperty.id, survey: { answer: 'unattributed' } } });
  await ctrl.deleteAccount(`Bearer ${owner.accessToken}`);
  await expect(auth.verify(`Bearer ${owner.accessToken}`)).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(ctrl.refresh({ refreshToken: owner.refreshToken })).rejects.toBeInstanceOf(UnauthorizedException);
  expect((await auth.authorize(`Bearer ${member.accessToken}`, organizationId)).role).toBe('owner');
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: draft.id } })).survey).toEqual({ answer: 'shared draft' });
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: submitted.id } })).survey).toEqual({ answer: 'submitted' });
  expect((await db.apeCase.findUniqueOrThrow({ where: { id: unknown.id } })).survey).toEqual({ answer: 'unattributed' });
  expect(await db.membership.count({ where: { userSubject: owner.user.subject, active: true } })).toBe(0);
  expect(await db.auditEvent.count({ where: { actorId: owner.user.subject, action: 'account.delete', organizationId } })).toBe(1);
 });

});
