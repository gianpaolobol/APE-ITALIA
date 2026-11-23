import { describe, expect, it, beforeAll } from 'vitest';
import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { seal, unseal } from './seal';
import { loadWebConfig, type WebConfig } from './config';
import { completeLogin, createLogin, discover, safeReturnTo, type Discovery, type FetchLike } from './oidc';

const ISSUER = 'https://id.example.test';
const cfg: WebConfig = { issuer: ISSUER, clientId: 'ape-web', audience: 'ape-italia-api', baseUrl: 'https://portal.example.test', apiBaseUrl: 'https://api.example.test', sessionKey: randomBytes(32) };
const d: Discovery = { issuer: ISSUER, authorization_endpoint: ISSUER + '/authorize', token_endpoint: ISSUER + '/token', jwks_uri: ISSUER + '/jwks' };
let key: CryptoKey, other: CryptoKey, jwk: JWK;
beforeAll(async () => {
 const p = await generateKeyPair('RS256'); key = p.privateKey;
 jwk = { ...(await exportJWK(p.publicKey)), kid: 'k1', alg: 'RS256' };
 other = (await generateKeyPair('RS256')).privateKey;
});
const idToken = (claims: Record<string, unknown>, k: CryptoKey = key) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' })
 .setIssuer((claims.iss as string) ?? ISSUER).setAudience((claims.aud as string) ?? 'ape-web').setSubject('synthetic-cert').setIssuedAt().setExpirationTime('5m').sign(k);

describe('sealed cookies', () => {
 it('round-trips and expires', () => {
  const v = seal(cfg.sessionKey, 'session', { a: 1 }, 60, 1000);
  expect(unseal(cfg.sessionKey, 'session', v, 1030)).toEqual({ a: 1 });
  expect(unseal(cfg.sessionKey, 'session', v, 1061)).toBeNull();
 });
 it('cannot be replayed across purposes or keys, nor tampered', () => {
  const v = seal(cfg.sessionKey, 'login', { a: 1 }, 60);
  expect(unseal(cfg.sessionKey, 'session', v)).toBeNull();
  expect(unseal(randomBytes(32), 'login', v)).toBeNull();
  const t = Buffer.from(v, 'base64url'); t[t.length - 1] ^= 1;
  expect(unseal(cfg.sessionKey, 'login', t.toString('base64url'))).toBeNull();
  expect(unseal(cfg.sessionKey, 'login', 'garbage')).toBeNull();
 });
 it('does not expose plaintext', () => {
  const v = seal(cfg.sessionKey, 'session', { accessToken: 'SYNTHETIC-SECRET-TOKEN' }, 60);
  expect(Buffer.from(v, 'base64url').toString('latin1')).not.toContain('SYNTHETIC-SECRET-TOKEN');
 });
});

describe('web configuration', () => {
 const env = { OIDC_ISSUER: ISSUER, WEB_OIDC_CLIENT_ID: 'ape-web', WEB_BASE_URL: 'https://portal.example.test', API_BASE_URL: 'https://api.example.test', WEB_SESSION_KEY: randomBytes(32).toString('base64') };
 it('is complete only with safe values', () => {
  expect(loadWebConfig(env)?.clientId).toBe('ape-web');
  expect(loadWebConfig({})).toBeNull();
  expect(loadWebConfig({ ...env, API_BASE_URL: 'http://api.example.test' })).toBeNull();
  expect(loadWebConfig({ ...env, WEB_SESSION_KEY: randomBytes(16).toString('base64') })).toBeNull();
  expect(loadWebConfig({ ...env, WEB_BASE_URL: 'http://localhost:3000' })?.baseUrl).toBe('http://localhost:3000');
  expect(loadWebConfig({ ...env, WEB_BASE_URL: 'http://evil.test' })).toBeNull();
 });
});

describe('redirect safety', () => {
 it('allows only relative same-site paths', () => {
  expect(safeReturnTo('/certifier/abc')).toBe('/certifier/abc');
  for (const bad of ['https://evil.test', '//evil.test', '/\\evil.test', 'javascript:alert(1)', '/x\r\nSet-Cookie: a', null]) expect(safeReturnTo(bad)).toBe('/certifier');
 });
});

describe('discovery', () => {
 const doc = { issuer: ISSUER, authorization_endpoint: ISSUER + '/authorize', token_endpoint: ISSUER + '/token', jwks_uri: ISSUER + '/jwks', code_challenge_methods_supported: ['S256'] };
 const f = (body: object): FetchLike => async () => new Response(JSON.stringify(body), { status: 200 });
 it('accepts a valid document', async () => expect((await discover(ISSUER, f(doc))).jwks_uri).toBe(ISSUER + '/jwks'));
 it('rejects issuer mismatch, missing S256 and insecure JWKS', async () => {
  await expect(discover(ISSUER, f({ ...doc, issuer: 'https://evil.test' }))).rejects.toThrow();
  await expect(discover(ISSUER, f({ ...doc, code_challenge_methods_supported: ['plain'] }))).rejects.toThrow();
  await expect(discover(ISSUER, f({ ...doc, jwks_uri: 'http://id.example.test/jwks' }))).rejects.toThrow();
 });
});

describe('BFF login: PKCE, state, nonce and signed ID token', () => {
 function provider(overrides: { idToken?: (nonce: string) => Promise<string>; tokenType?: string } = {}) {
  const seen: URLSearchParams[] = [];
  const fetchFn: FetchLike = async (_url, init) => {
   const body = new URLSearchParams(String(init?.body));
   seen.push(body);
   const nonce = pending.get(body.get('code') ?? '');
   if (!nonce) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
   const expected = createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url');
   if (expected !== challenges.get(body.get('code')!)) return new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 });
   const id = overrides.idToken ? await overrides.idToken(nonce) : await idToken({ nonce });
   return new Response(JSON.stringify({ access_token: 'synthetic-at', token_type: overrides.tokenType ?? 'Bearer', expires_in: 300, refresh_token: 'synthetic-rt', id_token: id }), { status: 200 });
  };
  const pending = new Map<string, string>(), challenges = new Map<string, string>();
  const authorize = (url: string) => {
   const p = new URL(url).searchParams;
   const code = 'code-' + randomBytes(4).toString('hex');
   pending.set(code, p.get('nonce')!); challenges.set(code, p.get('code_challenge')!);
   return new URLSearchParams({ code, state: p.get('state')!, iss: ISSUER });
  };
  return { fetchFn, authorize, seen };
 }
 const keys = () => createLocalJWKSet({ keys: [jwk] });

 it('completes a full login with server-side PKCE verification', async () => {
  const p = provider();
  const { url, login } = createLogin(cfg, d, '/certifier/x');
  const q = new URL(url).searchParams;
  expect(q.get('code_challenge_method')).toBe('S256');
  expect(q.get('redirect_uri')).toBe('https://portal.example.test/auth/callback');
  expect(url).not.toContain(login.verifier);
  const s = await completeLogin(cfg, d, login, p.authorize(url), { fetch: p.fetchFn, keys: keys() });
  expect(s).toMatchObject({ sub: 'synthetic-cert', accessToken: 'synthetic-at', refreshToken: 'synthetic-rt' });
  expect(login.returnTo).toBe('/certifier/x');
 });
 it('sends client credentials only via Basic auth when configured', async () => {
  const p = provider();
  const { url, login } = createLogin({ ...cfg, clientSecret: 'synthetic-secret' }, d);
  let auth = '';
  const spy: FetchLike = async (u, init) => { auth = (init?.headers as Record<string, string>).Authorization; return p.fetchFn(u, init); };
  await completeLogin({ ...cfg, clientSecret: 'synthetic-secret' }, d, login, p.authorize(url), { fetch: spy, keys: keys() });
  expect(auth).toMatch(/^Basic /);
  expect(p.seen[0].get('client_secret')).toBeNull();
 });
 it('rejects a missing or expired login cookie', async () => {
  const p = provider();
  const { url } = createLogin(cfg, d);
  await expect(completeLogin(cfg, d, null, p.authorize(url), { fetch: p.fetchFn, keys: keys() })).rejects.toThrow('Login session');
 });
 it('rejects state mismatch before contacting the token endpoint', async () => {
  const p = provider();
  const { url, login } = createLogin(cfg, d);
  const params = p.authorize(url); params.set('state', 'attacker');
  await expect(completeLogin(cfg, d, login, params, { fetch: p.fetchFn, keys: keys() })).rejects.toThrow('State');
  expect(p.seen).toHaveLength(0);
 });
 it('rejects issuer mix-up in the callback', async () => {
  const p = provider();
  const { url, login } = createLogin(cfg, d);
  const params = p.authorize(url); params.set('iss', 'https://evil.test');
  await expect(completeLogin(cfg, d, login, params, { fetch: p.fetchFn, keys: keys() })).rejects.toThrow('Issuer');
 });
 it('rejects ID tokens with a wrong nonce, wrong audience or unknown key', async () => {
  for (const make of [
   () => idToken({ nonce: 'replayed' }),
   (n: string) => idToken({ nonce: n, aud: 'other-client' }),
   (n: string) => idToken({ nonce: n }, other),
  ]) {
   const p = provider({ idToken: make });
   const { url, login } = createLogin(cfg, d);
   await expect(completeLogin(cfg, d, login, p.authorize(url), { fetch: p.fetchFn, keys: keys() })).rejects.toThrow();
  }
 });
 it('rejects non-bearer token types', async () => {
  const p = provider({ tokenType: 'mac' });
  const { url, login } = createLogin(cfg, d);
  await expect(completeLogin(cfg, d, login, p.authorize(url), { fetch: p.fetchFn, keys: keys() })).rejects.toThrow('token type');
 });
 it('a verifier from another login cannot redeem the code', async () => {
  const p = provider();
  const a = createLogin(cfg, d), b = createLogin(cfg, d);
  const params = p.authorize(a.url);
  await expect(completeLogin(cfg, d, { ...b.login, state: a.login.state, nonce: a.login.nonce }, params, { fetch: p.fetchFn, keys: keys() })).rejects.toThrow('Token exchange');
 });
});
