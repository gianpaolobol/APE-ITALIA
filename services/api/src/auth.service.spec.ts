import { describe, expect, it, vi, beforeAll } from 'vitest';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { AuthService, authConfigFromEnv } from './auth.service';
import { MeController } from './me.controller';
import type { PrismaService } from './prisma.service';

const ISSUER = 'https://id.example.test/';
const AUDIENCE = 'ape-italia-api';
const ORG = '123e4567-e89b-42d3-a456-426614174000';
let signingKey: CryptoKey, otherKey: CryptoKey, jwk: JWK;

beforeAll(async () => {
 const pair = await generateKeyPair('RS256');
 signingKey = pair.privateKey;
 jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
 otherKey = (await generateKeyPair('RS256')).privateKey;
});

function token(claims: Record<string, unknown> = {}, opts: { key?: CryptoKey; exp?: string | number; kid?: string } = {}) {
 const jwt = new SignJWT({ ...claims }).setProtectedHeader({ alg: 'RS256', kid: opts.kid ?? 'k1' })
  .setIssuer((claims.iss as string) ?? ISSUER).setAudience((claims.aud as string) ?? AUDIENCE).setIssuedAt().setExpirationTime(opts.exp ?? '5m');
 if (claims.sub !== null) jwt.setSubject((claims.sub as string) ?? 'synthetic-user-1');
 return jwt.sign(opts.key ?? signingKey).then(t => 'Bearer ' + t);
}

function service(membership: unknown = { organizationId: ORG, userSubject: 'synthetic-user-1', active: true, role: 'member' }) {
 const findUnique = vi.fn().mockResolvedValue(membership);
 const findMany = vi.fn().mockResolvedValue([{ role: 'owner', organization: { id: ORG, name: 'Studio sintetico' } }]);
 const db = { membership: { findUnique, findMany } } as unknown as PrismaService;
 const auth = new AuthService(db, { issuer: ISSUER, audience: AUDIENCE, keys: createLocalJWKSet({ keys: [jwk] }) });
 return { auth, db, findUnique, findMany };
}

describe('JWT verification with signed synthetic tokens and JWKS fixture', () => {
 it('accepts a correctly signed token', async () => {
  expect(await service().auth.verify(await token())).toEqual({ subject: 'synthetic-user-1' });
 });
 it('rejects missing bearer token', async () => {
  await expect(service().auth.verify(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  await expect(service().auth.verify('Basic abc')).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects a token signed by an unknown key', async () => {
  await expect(service().auth.verify(await token({}, { key: otherKey }))).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects a wrong issuer', async () => {
  await expect(service().auth.verify(await token({ iss: 'https://evil.test/' }))).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects a wrong audience', async () => {
  await expect(service().auth.verify(await token({ aud: 'other-api' }))).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects an expired token', async () => {
  await expect(service().auth.verify(await token({}, { exp: Math.floor(Date.now() / 1000) - 3600 }))).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects a token without subject', async () => {
  await expect(service().auth.verify(await token({ sub: null }))).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects alg=none tokens', async () => {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'none' })}.${enc({ iss: ISSUER, aud: AUDIENCE, sub: 'x', exp: Math.floor(Date.now() / 1000) + 300 })}.`;
  await expect(service().auth.verify('Bearer ' + unsigned)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('rejects tampered payloads', async () => {
  const [h, , s] = (await token()).slice(7).split('.');
  const forged = Buffer.from(JSON.stringify({ iss: ISSUER, aud: AUDIENCE, sub: 'admin', exp: Math.floor(Date.now() / 1000) + 300 })).toString('base64url');
  await expect(service().auth.verify(`Bearer ${h}.${forged}.${s}`)).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('fails closed when the provider is not configured', async () => {
  const auth = new AuthService({} as PrismaService, null);
  await expect(auth.verify(await token())).rejects.toBeInstanceOf(UnauthorizedException);
 });
 it('refuses non-HTTPS JWKS configuration', () => {
  expect(authConfigFromEnv({ OIDC_ISSUER: ISSUER, OIDC_AUDIENCE: AUDIENCE, OIDC_JWKS_URL: 'http://id.example.test/jwks' })).toBeNull();
  expect(authConfigFromEnv({})).toBeNull();
 });
});

describe('tenant authorization after verified token', () => {
 it('derives the actor from the token and role from the membership', async () => {
  const { auth, findUnique } = service();
  expect(await auth.authorize(await token(), ORG)).toEqual({ organizationId: ORG, actorId: 'synthetic-user-1', role: 'member' });
  expect(findUnique).toHaveBeenCalledWith({ where: { organizationId_userSubject: { organizationId: ORG, userSubject: 'synthetic-user-1' } } });
 });
 it('rejects revoked membership', async () => {
  const { auth } = service({ organizationId: ORG, userSubject: 'synthetic-user-1', active: false, role: 'member' });
  await expect(auth.authorize(await token(), ORG)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('rejects absent membership (cross-tenant)', async () => {
  const { auth } = service(null);
  await expect(auth.authorize(await token(), ORG)).rejects.toBeInstanceOf(ForbiddenException);
 });
 it('rejects malformed organization IDs without querying the database', async () => {
  const { auth, findUnique } = service();
  await expect(auth.authorize(await token(), 'not-a-uuid')).rejects.toBeInstanceOf(ForbiddenException);
  expect(findUnique).not.toHaveBeenCalled();
 });
 it('checks the token before the organization header', async () => {
  const { auth, findUnique } = service();
  await expect(auth.authorize(await token({}, { key: otherKey }), ORG)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(findUnique).not.toHaveBeenCalled();
 });
});

describe('GET /v1/me', () => {
 it('returns active memberships for the verified subject only', async () => {
  const { auth, db, findMany } = service();
  const res = await new MeController(db, auth).me(await token());
  expect(res).toEqual({ subject: 'synthetic-user-1', memberships: [{ organizationId: ORG, organizationName: 'Studio sintetico', role: 'owner' }] });
  expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userSubject: 'synthetic-user-1', active: true } }));
 });
 it('rejects unauthenticated callers before touching the database', async () => {
  const { auth, db, findMany } = service();
  await expect(new MeController(db, auth).me(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
  expect(findMany).not.toHaveBeenCalled();
 });
});
