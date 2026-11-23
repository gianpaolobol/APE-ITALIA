import { describe, expect, it } from 'vitest';
import { SignJWT } from 'jose';
import { PLATFORM_ISSUER, hashCode, platformAuthFromEnv, sameHash, signAccessToken, unverifiedIssuer, verifyPlatformToken } from './tokens';

const cfg = platformAuthFromEnv({ PLATFORM_JWT_SECRET: 'x'.repeat(40) })!;
describe('platform tokens', () => {
 it('needs a long secret', () => { expect(platformAuthFromEnv({ PLATFORM_JWT_SECRET: 'short' })).toBeNull(); });
 it('round-trips and rejects tampering, other secrets and non-user subjects', async () => {
  const t = await signAccessToken(cfg, 'usr_abc', 'a@b.it');
  expect(unverifiedIssuer(t)).toBe(PLATFORM_ISSUER);
  expect(await verifyPlatformToken(cfg, t)).toBe('usr_abc');
  expect(await verifyPlatformToken(platformAuthFromEnv({ PLATFORM_JWT_SECRET: 'y'.repeat(40) })!, t)).toBeNull();
  expect(await verifyPlatformToken(cfg, t.slice(0, -2) + 'aa')).toBeNull();
  const odd = await new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setIssuer(PLATFORM_ISSUER).setAudience('ape-italia-api').setSubject('admin').setExpirationTime('1h').sign(cfg.secret);
  expect(await verifyPlatformToken(cfg, odd)).toBeNull();
 });
 it('code hashes are bound to the email', () => {
  expect(sameHash(hashCode(cfg, 'a@b.it', '123456'), hashCode(cfg, 'a@b.it', '123456'))).toBe(true);
  expect(sameHash(hashCode(cfg, 'a@b.it', '123456'), hashCode(cfg, 'c@b.it', '123456'))).toBe(false);
 });
});
