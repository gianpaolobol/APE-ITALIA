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
});
