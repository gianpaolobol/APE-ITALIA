/**
 * Test-only in-memory OIDC provider. Implements the PKCE S256 check server-side so tests
 * prove the verifier/challenge binding instead of trusting the client. Synthetic data only.
 */
import { base64UrlEncode, utf8Encode } from './encoding';
import { parseQuery } from './url';
import type { CryptoPort, FetchPort } from './oidc';
import type { BrowserPort, SecureStoragePort } from './client';

export const ISSUER = 'https://id.example.test';
export const CLIENT_ID = 'ape-mobile-test';
export const REDIRECT_URI = 'apeitalia://auth/callback';
export const AUDIENCE = 'ape-italia-api';

export const nodeCrypto: CryptoPort = {
  getRandomBytes: n => globalThis.crypto.getRandomValues(new Uint8Array(n)),
  sha256: async data => new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>)),
};

export function fakeJwt(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: 'RS256', typ: 'JWT', kid: 'test' }): string {
  const enc = (o: unknown) => base64UrlEncode(utf8Encode(JSON.stringify(o)));
  return `${enc(header)}.${enc(claims)}.c2lnbmF0dXJlLW5vdC1jaGVja2VkLWluLXRlc3Q`;
}

export class MemoryStorage implements SecureStoragePort {
  data = new Map<string, string>();
  async getItem(k: string) { return this.data.get(k) ?? null; }
  async setItem(k: string, v: string) { this.data.set(k, v); }
  async deleteItem(k: string) { this.data.delete(k); }
}

type PendingCode = { challenge: string; nonce: string; redirectUri: string; clientId: string };

export class FakeProvider {
  nowSec = 1_800_000_000;
  codes = new Map<string, PendingCode>();
  refreshTokens = new Set<string>();
  revoked: string[] = [];
  tokenRequests: Record<string, string>[] = [];
  discoveryOverrides: Record<string, unknown> = {};
  /** Hooks to simulate attacks or misbehaving providers. */
  callbackOverride?: (params: Map<string, string>, code: string) => string;
  idTokenOverride?: (claims: Record<string, unknown>) => Record<string, unknown>;
  issueRefreshToken = true;
  private counter = 0;

  fetch: FetchPort = async (url, init) => {
    const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });
    if (url === ISSUER + '/.well-known/openid-configuration') {
      return json(200, {
        issuer: ISSUER,
        authorization_endpoint: ISSUER + '/authorize?ui=mobile',
        token_endpoint: ISSUER + '/token',
        revocation_endpoint: ISSUER + '/revoke',
        code_challenge_methods_supported: ['S256'],
        ...this.discoveryOverrides,
      });
    }
    const form = parseQuery(init?.body ?? '');
    if (url === ISSUER + '/token') {
      this.tokenRequests.push(Object.fromEntries(form));
      if (form.get('grant_type') === 'authorization_code') {
        const pending = this.codes.get(form.get('code') ?? '');
        if (!pending) return json(400, { error: 'invalid_grant' });
        this.codes.delete(form.get('code')!); // single use
        const expected = base64UrlEncode(await nodeCrypto.sha256(utf8Encode(form.get('code_verifier') ?? '')));
        if (expected !== pending.challenge) return json(400, { error: 'invalid_grant' });
        if (form.get('redirect_uri') !== pending.redirectUri || form.get('client_id') !== pending.clientId) return json(400, { error: 'invalid_grant' });
        return json(200, this.tokens(pending.nonce));
      }
      if (form.get('grant_type') === 'refresh_token') {
        const rt = form.get('refresh_token') ?? '';
        if (!this.refreshTokens.has(rt)) return json(400, { error: 'invalid_grant' });
        this.refreshTokens.delete(rt); // rotation
        return json(200, this.tokens(undefined));
      }
      return json(400, { error: 'unsupported_grant_type' });
    }
    if (url === ISSUER + '/revoke') {
      const t = form.get('token') ?? '';
      this.revoked.push(t);
      this.refreshTokens.delete(t);
      return json(200, {});
    }
    return json(404, {});
  };

  private tokens(nonce: string | undefined) {
    const n = ++this.counter;
    const refresh = `rt-${n}`;
    if (this.issueRefreshToken) this.refreshTokens.add(refresh);
    let claims: Record<string, unknown> = { iss: ISSUER, sub: 'synthetic-user-1', aud: CLIENT_ID, exp: this.nowSec + 600, iat: this.nowSec, ...(nonce ? { nonce } : {}) };
    if (this.idTokenOverride) claims = this.idTokenOverride(claims);
    return {
      access_token: `at-${n}`,
      token_type: 'Bearer',
      expires_in: 300,
      id_token: fakeJwt(claims),
      ...(this.issueRefreshToken ? { refresh_token: refresh } : {}),
    };
  }

  /** Simulates the user authenticating in the system browser. */
  browser: BrowserPort = {
    openAuthSession: async (url, redirectUri) => {
      const q = url.indexOf('?');
      if (!url.startsWith(ISSUER + '/authorize')) throw new Error('unexpected authorize URL');
      const params = parseQuery(url.slice(q + 1));
      if (params.get('code_challenge_method') !== 'S256' || params.get('response_type') !== 'code') throw new Error('bad request');
      const code = `code-${++this.counter}`;
      this.codes.set(code, { challenge: params.get('code_challenge')!, nonce: params.get('nonce')!, redirectUri: params.get('redirect_uri')!, clientId: params.get('client_id')! });
      const callback = this.callbackOverride
        ? this.callbackOverride(params, code)
        : `${redirectUri}?code=${code}&state=${encodeURIComponent(params.get('state')!)}&iss=${encodeURIComponent(ISSUER)}`;
      this.lastAuthorizeParams = params;
      return { type: 'success', url: callback };
    },
  };
  lastAuthorizeParams?: Map<string, string>;
}
