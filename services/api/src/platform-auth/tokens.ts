import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

/** Platform-issued access tokens (HS256) for email-code logins. OIDC tokens remain accepted as before. */
export const PLATFORM_ISSUER = 'https://apeitalia.it/platform';
export const PLATFORM_AUDIENCE = 'ape-italia-api';
export const ACCESS_TTL_SECONDS = 3600;
export const REFRESH_TTL_DAYS = 60;
export const CODE_TTL_MINUTES = 10;
export const CODE_MAX_ATTEMPTS = 5;

export type PlatformAuthConfig = { secret: Uint8Array; pepper: string };

export function platformAuthFromEnv(env = process.env): PlatformAuthConfig | null {
 const s = env.PLATFORM_JWT_SECRET;
 if (!s || s.length < 32) return null;
 return { secret: new TextEncoder().encode(s), pepper: env.LOGIN_CODE_PEPPER ?? s };
}

export const subjectFor = (userId: string) => `usr_${userId}`;
export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export const newCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
export const hashCode = (cfg: PlatformAuthConfig, email: string, code: string) => createHmac('sha256', cfg.pepper).update(`${email}|${code}`).digest('hex');
export function sameHash(a: string, b: string) { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && timingSafeEqual(x, y); }
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export async function signAccessToken(cfg: PlatformAuthConfig, subject: string, email: string) {
 return new SignJWT({ email }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' }).setIssuer(PLATFORM_ISSUER).setAudience(PLATFORM_AUDIENCE)
  .setSubject(subject).setIssuedAt().setExpirationTime(`${ACCESS_TTL_SECONDS}s`).sign(cfg.secret);
}

export async function verifyPlatformToken(cfg: PlatformAuthConfig, token: string): Promise<string | null> {
 try {
  const { payload } = await jwtVerify(token, cfg.secret, { issuer: PLATFORM_ISSUER, audience: PLATFORM_AUDIENCE, algorithms: ['HS256'], requiredClaims: ['sub', 'exp'], clockTolerance: 30 });
  return typeof payload.sub === 'string' && payload.sub.startsWith('usr_') ? payload.sub : null;
 } catch { return null; }
}

/** Reads the issuer without trusting the token (routing only; verification happens afterwards). */
export function unverifiedIssuer(token: string): string | null {
 try { const p = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { iss?: unknown }; return typeof p.iss === 'string' ? p.iss : null; } catch { return null; }
}
