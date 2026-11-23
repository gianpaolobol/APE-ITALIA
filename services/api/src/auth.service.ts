import { Inject, Injectable, UnauthorizedException, ForbiddenException, Optional } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { PrismaService } from './prisma.service';
import { hasTenantAccess } from './tenant-policy';
import { PLATFORM_ISSUER, platformAuthFromEnv, unverifiedIssuer, verifyPlatformToken, type PlatformAuthConfig } from './platform-auth/tokens';

export const PLATFORM_AUTH = Symbol('PLATFORM_AUTH');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const AUTH_CONFIG = Symbol('AUTH_CONFIG');
export type AuthConfig = { issuer: string; audience: string; keys: JWTVerifyGetKey };

/** Reads OIDC settings from the environment; JWKS is created once and cached by jose. */
export function authConfigFromEnv(env = process.env): AuthConfig | null {
 const { OIDC_ISSUER: issuer, OIDC_AUDIENCE: audience, OIDC_JWKS_URL: jwksUrl } = env;
 if (!issuer || !audience || !jwksUrl) return null;
 const url = new URL(jwksUrl);
 if (url.protocol !== 'https:') return null;
 return { issuer, audience, keys: createRemoteJWKSet(url, { cooldownDuration: 30_000, cacheMaxAge: 10 * 60_000 }) };
}

@Injectable()
export class AuthService {
 private readonly config: AuthConfig | null;
 private readonly platform: PlatformAuthConfig | null;
 constructor(@Inject(PrismaService) private readonly db: PrismaService, @Optional() @Inject(AUTH_CONFIG) config?: AuthConfig | null,
  @Optional() @Inject(PLATFORM_AUTH) platform?: PlatformAuthConfig | null) {
  this.config = config === undefined ? authConfigFromEnv() : config;
  this.platform = platform === undefined ? platformAuthFromEnv() : platform;
 }

 /** Verifies signature, issuer, audience, expiry and algorithm; returns the token subject. */
 async verify(authorization?: string): Promise<{ subject: string }> {
  if (this.platform && authorization?.startsWith('Bearer ') && unverifiedIssuer(authorization.slice(7)) === PLATFORM_ISSUER) {
   const sub = await verifyPlatformToken(this.platform, authorization.slice(7));
   if (!sub) throw new UnauthorizedException('Invalid access token');
   const user = await this.db.platformUser.findUnique({ where: { id: sub.slice(4) }, select: { deletedAt: true } });
   if (!user || user.deletedAt) throw new UnauthorizedException('Account not active');
   return { subject: sub };
  }
  if (!this.config) throw new UnauthorizedException('Authentication provider not configured');
  if (!authorization?.startsWith('Bearer ')) throw new UnauthorizedException('Bearer token required');
  try {
   const { payload } = await jwtVerify(authorization.slice(7), this.config.keys, {
    issuer: this.config.issuer,
    audience: this.config.audience,
    algorithms: ['RS256', 'ES256'],
    requiredClaims: ['sub', 'exp'],
    clockTolerance: 30,
   });
   if (typeof payload.sub !== 'string' || !payload.sub) throw new UnauthorizedException('Missing subject');
   return { subject: payload.sub };
  } catch (e) {
   if (e instanceof UnauthorizedException) throw e;
   throw new UnauthorizedException('Invalid access token');
  }
 }

 /** Tenant authorization: membership is always read from PostgreSQL, never trusted from the client. */
 async authorize(authorization?: string, organizationId?: string) {
  const { subject } = await this.verify(authorization);
  if (!organizationId || !UUID.test(organizationId)) throw new ForbiddenException('Valid organization required');
  const membership = await this.db.membership.findUnique({ where: { organizationId_userSubject: { organizationId, userSubject: subject } } });
  if (!membership || !hasTenantAccess(membership, organizationId, subject)) throw new ForbiddenException('Organization access denied');
  return { organizationId, actorId: subject, role: membership.role };
 }
}
