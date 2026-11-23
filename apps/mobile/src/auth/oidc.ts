/**
 * OIDC Authorization Code + PKCE (S256) protocol core.
 * Platform services are injected so the protocol can be unit-tested without a device.
 * No client secret is used: the mobile app is a public client (RFC 8252).
 */
import { base64UrlDecode, base64UrlEncode, utf8Decode, utf8Encode } from './encoding';
import { appendQuery, isHttpsUrl, parseQuery } from './url';

export interface CryptoPort {
  /** Must be backed by a CSPRNG (expo-crypto on device, WebCrypto in tests). */
  getRandomBytes(length: number): Uint8Array;
  sha256(data: Uint8Array): Promise<Uint8Array>;
}
export type FetchPort = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export class AuthError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export type ProviderMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
};

function requireHttps(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new AuthError('discovery_invalid', `${field} missing`);
  if (!isHttpsUrl(value)) throw new AuthError('discovery_invalid', `${field} must be an HTTPS URL`);
  return value;
}

/** OpenID Connect Discovery 1.0 with strict issuer match and mandatory S256 support. */
export async function discover(issuer: string, fetchFn: FetchPort): Promise<ProviderMetadata> {
  requireHttps(issuer, 'issuer');
  const res = await fetchFn(issuer.replace(/\/$/, '') + '/.well-known/openid-configuration', { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new AuthError('discovery_failed', `Discovery failed (${res.status})`);
  const doc = (await res.json()) as Record<string, unknown>;
  if (doc.issuer !== issuer) throw new AuthError('discovery_invalid', 'Issuer mismatch in discovery document');
  const methods = doc.code_challenge_methods_supported;
  if (!Array.isArray(methods) || !methods.includes('S256')) throw new AuthError('discovery_invalid', 'Provider does not advertise PKCE S256');
  return {
    issuer,
    authorization_endpoint: requireHttps(doc.authorization_endpoint, 'authorization_endpoint'),
    token_endpoint: requireHttps(doc.token_endpoint, 'token_endpoint'),
    ...(doc.revocation_endpoint ? { revocation_endpoint: requireHttps(doc.revocation_endpoint, 'revocation_endpoint') } : {}),
    ...(doc.end_session_endpoint ? { end_session_endpoint: requireHttps(doc.end_session_endpoint, 'end_session_endpoint') } : {}),
  };
}

export function randomToken(crypto: CryptoPort, bytes = 32): string {
  const random = crypto.getRandomBytes(bytes);
  if (!(random instanceof Uint8Array) || random.length !== bytes) throw new AuthError('rng_failure', 'Secure random generator unavailable');
  return base64UrlEncode(random);
}

/** RFC 7636: 32 random bytes -> 43-char verifier; challenge = BASE64URL(SHA256(ASCII(verifier))). */
export async function createPkcePair(crypto: CryptoPort): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomToken(crypto, 32);
  return { verifier, challenge: await challengeFor(verifier, crypto) };
}

export async function challengeFor(verifier: string, crypto: CryptoPort): Promise<string> {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) throw new AuthError('pkce_invalid', 'Invalid PKCE verifier');
  const digest = await crypto.sha256(utf8Encode(verifier));
  if (digest.length !== 32) throw new AuthError('pkce_invalid', 'SHA-256 digest must be 32 bytes');
  return base64UrlEncode(digest);
}

export type AuthRequest = { url: string; state: string; nonce: string; verifier: string };

export async function createAuthRequest(
  meta: ProviderMetadata,
  client: { clientId: string; redirectUri: string; audience: string; scope: string },
  crypto: CryptoPort,
): Promise<AuthRequest> {
  const { verifier, challenge } = await createPkcePair(crypto);
  const state = randomToken(crypto);
  const nonce = randomToken(crypto);
  const url = appendQuery(meta.authorization_endpoint, {
    response_type: 'code',
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: client.scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state,
    nonce,
    audience: client.audience,
  });
  return { url, state, nonce, verifier };
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Validate the redirect: exact redirect URI prefix, state match, RFC 9207 iss if present, error handling. */
export function parseCallback(callbackUrl: string, expected: { redirectUri: string; state: string; issuer: string }): { code: string } {
  const q = callbackUrl.indexOf('?');
  const base = q === -1 ? callbackUrl : callbackUrl.slice(0, q);
  if (base !== expected.redirectUri) throw new AuthError('callback_invalid', 'Unexpected redirect URI');
  const query = q === -1 ? '' : callbackUrl.slice(q + 1).split('#')[0];
  let params: Map<string, string>;
  try { params = parseQuery(query); } catch { throw new AuthError('callback_invalid', 'Malformed callback query'); }
  const state = params.get('state');
  if (!state || !constantTimeEqual(state, expected.state)) throw new AuthError('state_mismatch', 'State mismatch: possible CSRF');
  const iss = params.get('iss');
  if (iss !== undefined && iss !== expected.issuer) throw new AuthError('issuer_mismatch', 'Authorization response issuer mismatch');
  const error = params.get('error');
  if (error) throw new AuthError(error === 'access_denied' ? 'access_denied' : 'provider_error', `Authorization error: ${error}`);
  const code = params.get('code');
  if (!code) throw new AuthError('callback_invalid', 'Authorization code missing');
  return { code };
}

export type TokenSet = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  /** epoch seconds */
  expiresAt: number;
};

function formBody(values: Record<string, string>): string {
  return Object.entries(values).map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

async function tokenRequest(fetchFn: FetchPort, endpoint: string, body: Record<string, string>, nowSec: number): Promise<TokenSet> {
  const res = await fetchFn(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: formBody(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === 'string' ? json.error : 'token_error';
    throw new AuthError(err === 'invalid_grant' ? 'invalid_grant' : 'token_error', `Token endpoint rejected request (${res.status})`);
  }
  if (typeof json.access_token !== 'string' || !json.access_token) throw new AuthError('token_invalid', 'access_token missing');
  if (typeof json.token_type !== 'string' || json.token_type.toLowerCase() !== 'bearer') throw new AuthError('token_invalid', 'Unsupported token_type');
  const expiresIn = typeof json.expires_in === 'number' && json.expires_in > 0 ? json.expires_in : 300;
  return {
    accessToken: json.access_token,
    ...(typeof json.id_token === 'string' ? { idToken: json.id_token } : {}),
    ...(typeof json.refresh_token === 'string' ? { refreshToken: json.refresh_token } : {}),
    expiresAt: nowSec + Math.min(expiresIn, 24 * 3600),
  };
}

export function exchangeCode(
  fetchFn: FetchPort,
  meta: ProviderMetadata,
  p: { code: string; verifier: string; clientId: string; redirectUri: string },
  nowSec: number,
): Promise<TokenSet> {
  return tokenRequest(fetchFn, meta.token_endpoint, {
    grant_type: 'authorization_code',
    code: p.code,
    redirect_uri: p.redirectUri,
    client_id: p.clientId,
    code_verifier: p.verifier,
  }, nowSec);
}

export async function refreshTokens(fetchFn: FetchPort, meta: ProviderMetadata, refreshToken: string, clientId: string, nowSec: number): Promise<TokenSet> {
  const set = await tokenRequest(fetchFn, meta.token_endpoint, { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }, nowSec);
  // Providers may omit a rotated refresh token: keep the previous one in that case.
  return set.refreshToken ? set : { ...set, refreshToken };
}

export type IdTokenClaims = { iss: string; sub: string; aud: string | string[]; exp: number; iat: number; nonce?: string; azp?: string; [k: string]: unknown };

export function decodeJwtPart(part: string): Record<string, unknown> {
  try {
    const value = JSON.parse(utf8Decode(base64UrlDecode(part)));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value as Record<string, unknown>;
  } catch {
    throw new AuthError('id_token_invalid', 'Malformed JWT');
  }
}

/**
 * OIDC Core 3.1.3.7 claim validation. The ID token is received directly from the token
 * endpoint over verified TLS (item 6 allows TLS server validation in place of signature
 * checks); the API independently verifies the access token signature against JWKS.
 */
export function validateIdToken(idToken: string, expected: { issuer: string; clientId: string; nonce: string; nowSec: number; skewSec?: number }): IdTokenClaims {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new AuthError('id_token_invalid', 'Malformed JWT');
  const header = decodeJwtPart(parts[0]);
  if (typeof header.alg !== 'string' || header.alg === 'none' || header.alg.startsWith('HS')) throw new AuthError('id_token_invalid', 'Unacceptable JWT algorithm');
  const c = decodeJwtPart(parts[1]) as Partial<IdTokenClaims>;
  const skew = expected.skewSec ?? 120;
  if (c.iss !== expected.issuer) throw new AuthError('id_token_invalid', 'Issuer mismatch');
  if (typeof c.sub !== 'string' || !c.sub) throw new AuthError('id_token_invalid', 'Subject missing');
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.includes(expected.clientId)) throw new AuthError('id_token_invalid', 'Audience mismatch');
  if (aud.length > 1 && c.azp !== expected.clientId) throw new AuthError('id_token_invalid', 'Authorized party mismatch');
  if (typeof c.exp !== 'number' || c.exp + skew < expected.nowSec) throw new AuthError('id_token_expired', 'ID token expired');
  if (typeof c.iat !== 'number' || c.iat - skew > expected.nowSec) throw new AuthError('id_token_invalid', 'ID token issued in the future');
  if (typeof c.nonce !== 'string' || !constantTimeEqual(c.nonce, expected.nonce)) throw new AuthError('nonce_mismatch', 'Nonce mismatch: possible replay');
  return c as IdTokenClaims;
}

/** RFC 7009 token revocation; best effort, never throws to the caller. */
export async function revokeToken(fetchFn: FetchPort, meta: ProviderMetadata, token: string, clientId: string, hint: 'refresh_token' | 'access_token'): Promise<boolean> {
  if (!meta.revocation_endpoint) return false;
  try {
    const res = await fetchFn(meta.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formBody({ token, token_type_hint: hint, client_id: clientId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
