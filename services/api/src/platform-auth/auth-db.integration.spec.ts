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
