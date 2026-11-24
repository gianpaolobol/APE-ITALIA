import { BadRequestException, Body, Controller, Delete, Get, Headers, HttpCode, Inject, Optional, Post, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../prisma.service';
import { AuthService, PLATFORM_AUTH } from '../auth.service';
import { MAILER, type Mailer } from './mailer';
import {
 ACCESS_TTL_SECONDS, CODE_MAX_ATTEMPTS, CODE_TTL_MINUTES, EMAIL_RE, REFRESH_TTL_DAYS, hashCode, hashToken, newCode, newRefreshToken, normalizeEmail,
 platformAuthFromEnv, sameHash, signAccessToken, subjectFor, type PlatformAuthConfig,
} from './tokens';

/**
 * Passwordless login: a 6-digit code by email, then short-lived access tokens and rotating refresh
 * tokens. First login creates the account and a personal organization (owner) for the customer's requests.
 */
@Controller('v1/auth')
export class PlatformAuthController {
 private readonly cfg: PlatformAuthConfig | null;
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(AuthService) private readonly auth: AuthService,
  @Optional() @Inject(MAILER) private readonly mailer: Mailer | null = null, @Optional() @Inject(PLATFORM_AUTH) cfg?: PlatformAuthConfig | null) {
  this.cfg = cfg === undefined ? platformAuthFromEnv() : cfg;
 }

 private ready() {
  if (!this.cfg || !this.mailer) throw new ServiceUnavailableException('Email login not configured');
  return { cfg: this.cfg, mailer: this.mailer };
 }

 @Post('email/start')
 @HttpCode(202)
 @Throttle({ default: { limit: 3, ttl: 60_000 } })
 async start(@Body() body: { email?: unknown } | undefined) {
  const { cfg, mailer } = this.ready();
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  if (!EMAIL_RE.test(email)) throw new BadRequestException('Valid email required');
  const recent = await this.db.loginCode.count({ where: { email, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 6) return { sent: true }; // silent cap: no enumeration, no mail bombing
  const code = newCode();
  await this.db.loginCode.create({ data: { email, codeHash: hashCode(cfg, email, code), expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60_000) } });
  await mailer.send({ to: email, subject: `${code} è il tuo codice APE Italia`, text: `Il tuo codice di accesso ad APE Italia è ${code}.\nScade tra ${CODE_TTL_MINUTES} minuti. Se non l'hai richiesto, ignora questa email.` });
  return { sent: true };
 }

 @Post('email/verify')
 @Throttle({ default: { limit: 10, ttl: 60_000 } })
 async verify(@Body() body: { email?: unknown; code?: unknown } | undefined) {
  const { cfg } = this.ready();
  const email = typeof body?.email === 'string' ? normalizeEmail(body.email) : '';
  const code = typeof body?.code === 'string' ? body.code.trim() : '';
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) throw new BadRequestException('email and 6-digit code required');
  const row = await this.db.loginCode.findFirst({ where: { email, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: 'desc' } });
  if (!row || row.attempts >= CODE_MAX_ATTEMPTS) throw new UnauthorizedException('Code expired or invalid');
  if (!sameHash(row.codeHash, hashCode(cfg, email, code))) {
   await this.db.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
   throw new UnauthorizedException('Code expired or invalid');
  }
  const consumed = await this.db.loginCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: new Date() } });
  if (consumed.count !== 1) throw new UnauthorizedException('Code already used');
  const user = await this.db.$transaction(async tx => {
   let u = await tx.platformUser.findUnique({ where: { email } });
   if (u?.deletedAt) u = await tx.platformUser.update({ where: { id: u.id }, data: { deletedAt: null } });
   if (!u) u = await tx.platformUser.create({ data: { email, pushTokens: [] } });
   const subject = subjectFor(u.id);
   const has = await tx.membership.findFirst({ where: { userSubject: subject, active: true } });
   if (!has) {
    const org = await tx.organization.create({ data: { name: `Richieste di ${email}` } });
    await tx.membership.create({ data: { organizationId: org.id, userSubject: subject, role: 'owner' } });
    await tx.auditEvent.create({ data: { organizationId: org.id, actorId: subject, action: 'account.create', resourceId: u.id } });
   }
   return tx.platformUser.update({ where: { id: u.id }, data: { lastLoginAt: new Date() } });
  });
  return this.issue(cfg, user.id, email);
 }

 private async issue(cfg: PlatformAuthConfig, userId: string, email: string) {
  const refresh = newRefreshToken();
  await this.db.refreshToken.create({ data: { userId, tokenHash: hashToken(refresh), expiresAt: new Date(Date.now() + REFRESH_TTL_DAYS * 86400_000) } });
  const subject = subjectFor(userId);
  const memberships = await this.db.membership.findMany({ where: { userSubject: subject, active: true }, select: { organizationId: true, role: true } });
  const certifier = await this.db.certifier.findUnique({ where: { userSubject: subject }, select: { id: true, active: true, verifiedAt: true } });
  return {
   accessToken: await signAccessToken(cfg, subject, email), expiresIn: ACCESS_TTL_SECONDS, refreshToken: refresh,
   user: { id: userId, subject, email }, organizationId: memberships.find(m => m.role === 'owner')?.organizationId ?? memberships[0]?.organizationId ?? null,
   isCertifier: !!certifier?.active && !!certifier.verifiedAt,
  };
 }

 @Post('refresh')
 @Throttle({ default: { limit: 30, ttl: 60_000 } })
 async refresh(@Body() body: { refreshToken?: unknown } | undefined) {
  const { cfg } = this.ready();
  const t = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  if (!t) throw new BadRequestException('refreshToken required');
  const row = await this.db.refreshToken.findUnique({ where: { tokenHash: hashToken(t) }, include: { user: true } });
  if (row?.revokedAt) {
   // A rotated (already used) refresh token is presented again: possible theft, revoke every session.
   await this.db.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
   throw new UnauthorizedException('Session expired');
  }
  if (!row || row.expiresAt < new Date() || row.user.deletedAt || !row.user.email) throw new UnauthorizedException('Session expired');
  const rotated = await this.db.refreshToken.updateMany({ where: { id: row.id, revokedAt: null }, data: { revokedAt: new Date() } });
  if (rotated.count !== 1) {
   // Reuse of a rotated token: revoke every session of the user.
   await this.db.refreshToken.updateMany({ where: { userId: row.userId, revokedAt: null }, data: { revokedAt: new Date() } });
   throw new UnauthorizedException('Session expired');
  }
  return this.issue(cfg, row.userId, row.user.email);
 }

 @Post('logout')
 @HttpCode(204)
 async logout(@Body() body: { refreshToken?: unknown } | undefined) {
  const t = typeof body?.refreshToken === 'string' ? body.refreshToken : '';
  if (t) await this.db.refreshToken.updateMany({ where: { tokenHash: hashToken(t), revokedAt: null }, data: { revokedAt: new Date() } });
 }

 /** Registers an Expo push token for notifications (max 5 devices). */
 @Post('push-token')
 @HttpCode(204)
 async pushToken(@Body() body: { token?: unknown } | undefined, @Headers('authorization') token?: string) {
  const { subject } = await this.auth.verify(token);
  const t = typeof body?.token === 'string' ? body.token.trim() : '';
  if (!/^ExponentPushToken\[[A-Za-z0-9_-]{10,100}\]$/.test(t)) throw new BadRequestException('Expo push token required');
  if (!subject.startsWith('usr_')) throw new BadRequestException('Platform account required');
  const u = await this.db.platformUser.findUniqueOrThrow({ where: { id: subject.slice(4) } });
  await this.db.platformUser.update({ where: { id: u.id }, data: { pushTokens: [t, ...u.pushTokens.filter(x => x !== t)].slice(0, 5) } });
 }

 @Get('session')
 async session(@Headers('authorization') token?: string) {
  const { subject } = await this.auth.verify(token);
  const memberships = await this.db.membership.findMany({ where: { userSubject: subject, active: true }, select: { organizationId: true, role: true } });
  const certifier = await this.db.certifier.findUnique({ where: { userSubject: subject }, select: { active: true, verifiedAt: true, displayName: true, registrationId: true } });
  return { subject, memberships, certifier: certifier?.active && certifier.verifiedAt ? { name: certifier.displayName, registrationId: certifier.registrationId } : null };
 }

 /**
  * Revoke account access and remove login data. Cases belong to organizations, not individual accounts.
  * Do not erase organization records based on membership alone; per-case erasure requires verified
  * ownership and a retention decision. Full record erasure is a separate, outstanding workflow.
  */
 @Delete('account')
 @HttpCode(204)
 async deleteAccount(@Headers('authorization') token?: string) {
  const { subject } = await this.auth.verify(token);
  if (!subject.startsWith('usr_')) throw new BadRequestException('Platform account required');
  const userId = subject.slice(4);
  const u = await this.db.platformUser.findUniqueOrThrow({ where: { id: userId } });
  await this.db.$transaction(async tx => {
   const orgs = await tx.membership.findMany({ where: { userSubject: subject, active: true }, select: { organizationId: true } });
   for (const { organizationId } of orgs) {
    await tx.auditEvent.create({ data: { organizationId, actorId: subject, action: 'account.delete', resourceId: userId } });
   }
   await tx.membership.updateMany({ where: { userSubject: subject }, data: { active: false } });
   await tx.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
   await tx.loginCode.deleteMany({ where: { email: u.email ?? '' } });
   await tx.certifier.updateMany({ where: { userSubject: subject }, data: { active: false } });
   await tx.platformUser.update({ where: { id: userId }, data: { email: null, deletedAt: new Date(), pushTokens: [] } });
  });
 }
}
