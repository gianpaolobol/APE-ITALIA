import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { WebConfig } from './config';

/**
 * Server-side (BFF) OIDC Authorization Code + PKCE S256. Tokens never reach the browser:
 * they live in an encrypted httpOnly cookie. Unlike the mobile client, the ID token signature
 * is verified here against the provider JWKS.
 */
export type Discovery = { issuer: string; authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint?: string; revocation_endpoint?: string };
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;
export type LoginState = { state: string; nonce: string; verifier: string; returnTo: string };
/** Kept small: browsers cap cookies at ~4 KB, so the ID token is not stored after validation. */
export type WebSession = { sub: string; accessToken: string; refreshToken?: string; expiresAt: number };

const isHttps = (v: unknown): v is string => typeof v === 'string' && v.startsWith('https://');

export async function discover(issuer: string, fetchFn: FetchLike): Promise<Discovery> {
 const res = await fetchFn(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration', { headers: { Accept: 'application/json' }, cache: 'no-store' });
 if (!res.ok) throw new Error('OIDC discovery failed');
 const d = (await res.json()) as Record<string, unknown>;
 if (d.issuer !== issuer) throw new Error('OIDC issuer mismatch');
 if (!Array.isArray(d.code_challenge_methods_supported) || !d.code_challenge_methods_supported.includes('S256')) throw new Error('Provider lacks PKCE S256');
 for (const f of ['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) if (!isHttps(d[f])) throw new Error(`Invalid ${f}`);
 return {
  issuer, authorization_endpoint: d.authorization_endpoint as string, token_endpoint: d.token_endpoint as string, jwks_uri: d.jwks_uri as string,
  ...(isHttps(d.end_session_endpoint) ? { end_session_endpoint: d.end_session_endpoint } : {}),
  ...(isHttps(d.revocation_endpoint) ? { revocation_endpoint: d.revocation_endpoint } : {}),
 };
}

/** Only same-site relative paths are allowed as post-login destinations (no open redirect). */
export function safeReturnTo(value: string | null | undefined): string {
 if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return '/certifier';
 return value;
}

export function createLogin(cfg: WebConfig, d: Discovery, returnTo?: string | null): { url: string; login: LoginState } {
 const verifier = randomBytes(32).toString('base64url');
 const challenge = createHash('sha256').update(verifier, 'ascii').digest('base64url');
 const login: LoginState = { state: randomBytes(32).toString('base64url'), nonce: randomBytes(32).toString('base64url'), verifier, returnTo: safeReturnTo(returnTo) };
 const url = new URL(d.authorization_endpoint);
 const p = url.searchParams;
 p.set('response_type', 'code');
 p.set('client_id', cfg.clientId);
 p.set('redirect_uri', cfg.baseUrl + '/auth/callback');
 p.set('scope', 'openid profile offline_access');
 p.set('code_challenge', challenge);
 p.set('code_challenge_method', 'S256');
 p.set('state', login.state);
 p.set('nonce', login.nonce);
 p.set('audience', cfg.audience);
 return { url: url.toString(), login };
}

function sameSecret(a: string, b: string): boolean {
 const x = Buffer.from(a), y = Buffer.from(b);
 return x.length === y.length && timingSafeEqual(x, y);
}

export async function completeLogin(
 cfg: WebConfig, d: Discovery, login: LoginState | null, params: URLSearchParams,
 deps: { fetch: FetchLike; keys?: JWTVerifyGetKey; nowSec?: number },
): Promise<WebSession> {
 if (!login) throw new Error('Login session missing or expired');
 const state = params.get('state');
 if (!state || !sameSecret(state, login.state)) throw new Error('State mismatch');
 const iss = params.get('iss');
 if (iss !== null && iss !== d.issuer) throw new Error('Issuer mismatch in callback');
 if (params.get('error')) throw new Error('Authorization denied');
 const code = params.get('code');
 if (!code) throw new Error('Authorization code missing');
 const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: cfg.baseUrl + '/auth/callback', client_id: cfg.clientId, code_verifier: login.verifier });
 const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
 if (cfg.clientSecret) headers.Authorization = 'Basic ' + Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString('base64');
 const res = await deps.fetch(d.token_endpoint, { method: 'POST', headers, body: body.toString(), cache: 'no-store' });
 const t = (await res.json().catch(() => ({}))) as Record<string, unknown>;
 if (!res.ok || typeof t.access_token !== 'string' || typeof t.id_token !== 'string') throw new Error('Token exchange failed');
 if (typeof t.token_type !== 'string' || t.token_type.toLowerCase() !== 'bearer') throw new Error('Unsupported token type');
 const keys = deps.keys ?? createRemoteJWKSet(new URL(d.jwks_uri));
 const { payload } = await jwtVerify(t.id_token, keys, {
  issuer: d.issuer, audience: cfg.clientId, algorithms: ['RS256', 'ES256'], requiredClaims: ['sub', 'exp', 'iat', 'nonce'], clockTolerance: 60,
  ...(deps.nowSec !== undefined ? { currentDate: new Date(deps.nowSec * 1000) } : {}),
 });
 if (typeof payload.nonce !== 'string' || !sameSecret(payload.nonce, login.nonce)) throw new Error('Nonce mismatch');
 const now = deps.nowSec ?? Math.floor(Date.now() / 1000);
 const expiresIn = typeof t.expires_in === 'number' && t.expires_in > 0 ? Math.min(t.expires_in, 3600) : 300;
 return {
  sub: payload.sub as string, accessToken: t.access_token, expiresAt: now + expiresIn,
  ...(typeof t.refresh_token === 'string' ? { refreshToken: t.refresh_token } : {}),
 };
}
