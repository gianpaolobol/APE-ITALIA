import { describe, expect, it } from 'vitest';
import { base64UrlDecode, base64UrlEncode, utf8Decode, utf8Encode } from './encoding';
import { appendQuery, isHttpsUrl, parseQuery } from './url';
import {
  AuthError, challengeFor, createAuthRequest, createPkcePair, discover, parseCallback, randomToken, validateIdToken,
  type CryptoPort, type FetchPort, type ProviderMetadata,
} from './oidc';
import { CLIENT_ID, FakeProvider, ISSUER, REDIRECT_URI, fakeJwt, nodeCrypto } from './test-provider';

const code = async (p: Promise<unknown> | (() => unknown)) => {
  try { typeof p === 'function' ? p() : await p; } catch (e) { return (e as AuthError).code ?? (e as Error).message; }
  return 'no-error';
};

describe('encoding', () => {
  it('round-trips base64url of arbitrary bytes', () => {
    for (let n = 0; n < 40; n++) {
      const bytes = nodeCrypto.getRandomBytes(n);
      expect(base64UrlDecode(base64UrlEncode(bytes))).toEqual(bytes);
    }
  });
  it('matches Node base64url output', () => {
    const bytes = nodeCrypto.getRandomBytes(64);
    expect(base64UrlEncode(bytes)).toBe(Buffer.from(bytes).toString('base64url'));
  });
  it('rejects invalid base64url', () => expect(() => base64UrlDecode('ab$c')).toThrow());
  it('round-trips UTF-8 including non-ASCII', () => {
    const s = 'Città € 🏠';
    expect(utf8Decode(utf8Encode(s))).toBe(s);
    expect(utf8Encode(s)).toEqual(new Uint8Array(Buffer.from(s, 'utf8')));
  });
  it('rejects malformed UTF-8', () => expect(() => utf8Decode(new Uint8Array([0xc3]))).toThrow());
});

describe('url helpers', () => {
  it('accepts only https URLs', () => {
    expect(isHttpsUrl('https://id.example.test/a?b=c')).toBe(true);
    expect(isHttpsUrl('http://id.example.test')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
  });
  it('preserves an existing query when appending', () => {
    expect(appendQuery('https://x.test/a?ui=1', { b: 'c d' })).toBe('https://x.test/a?ui=1&b=c%20d');
  });
  it('rejects duplicate parameters', () => expect(() => parseQuery('state=a&state=b')).toThrow());
});

describe('PKCE S256', () => {
  it('matches the RFC 7636 Appendix B test vector', async () => {
    expect(await challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk', nodeCrypto)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });
  it('creates a 43-char verifier whose challenge is its SHA-256', async () => {
    const { verifier, challenge } = await createPkcePair(nodeCrypto);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(challenge).toBe(await challengeFor(verifier, nodeCrypto));
  });
  it('produces distinct verifiers', async () => {
    const a = await createPkcePair(nodeCrypto);
    const b = await createPkcePair(nodeCrypto);
    expect(a.verifier).not.toBe(b.verifier);
  });
  it('fails closed if the RNG returns too few bytes', async () => {
    const broken: CryptoPort = { ...nodeCrypto, getRandomBytes: () => new Uint8Array(8) };
    expect(await code(() => randomToken(broken))).toBe('rng_failure');
  });
  it('rejects invalid verifiers', async () => expect(await code(challengeFor('short', nodeCrypto))).toBe('pkce_invalid'));
});

describe('discovery', () => {
  const p = new FakeProvider();
  it('loads metadata from the issuer', async () => {
    const meta = await discover(ISSUER, p.fetch);
    expect(meta.token_endpoint).toBe(ISSUER + '/token');
  });
  it('rejects issuer mismatch', async () => {
    const f = new FakeProvider(); f.discoveryOverrides = { issuer: 'https://evil.test' };
    expect(await code(discover(ISSUER, f.fetch))).toBe('discovery_invalid');
  });
  it('rejects providers without S256', async () => {
    const f = new FakeProvider(); f.discoveryOverrides = { code_challenge_methods_supported: ['plain'] };
    expect(await code(discover(ISSUER, f.fetch))).toBe('discovery_invalid');
  });
  it('rejects non-HTTPS endpoints', async () => {
    const f = new FakeProvider(); f.discoveryOverrides = { token_endpoint: 'http://id.example.test/token' };
    expect(await code(discover(ISSUER, f.fetch))).toBe('discovery_invalid');
  });
  it('rejects non-HTTPS issuer before any request', async () => {
    const calls: string[] = [];
    const f: FetchPort = async url => { calls.push(url); return { ok: false, status: 500, json: async () => ({}) }; };
    expect(await code(discover('http://id.example.test', f))).toBe('discovery_invalid');
    expect(calls).toEqual([]);
  });
});

describe('authorization request and callback', () => {
  const meta: ProviderMetadata = { issuer: ISSUER, authorization_endpoint: ISSUER + '/authorize', token_endpoint: ISSUER + '/token' };
  const client = { clientId: CLIENT_ID, redirectUri: REDIRECT_URI, audience: 'ape-italia-api', scope: 'openid profile' };
  it('builds an S256 request with fresh state and nonce', async () => {
    const req = await createAuthRequest(meta, client, nodeCrypto);
    const q = parseQuery(req.url.split('?')[1]);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')).toBe(await challengeFor(req.verifier, nodeCrypto));
    expect(q.get('state')).toBe(req.state);
    expect(q.get('nonce')).toBe(req.nonce);
    expect(q.get('state')).not.toBe(q.get('nonce'));
    expect(req.url).not.toContain(req.verifier);
  });
  const expected = { redirectUri: REDIRECT_URI, state: 'expected-state', issuer: ISSUER };
  it('accepts a valid callback', () => {
    expect(parseCallback(`${REDIRECT_URI}?code=abc&state=expected-state&iss=${encodeURIComponent(ISSUER)}`, expected)).toEqual({ code: 'abc' });
  });
  it('rejects state mismatch (CSRF)', async () => expect(await code(() => parseCallback(`${REDIRECT_URI}?code=abc&state=other`, expected))).toBe('state_mismatch'));
  it('rejects a missing state', async () => expect(await code(() => parseCallback(`${REDIRECT_URI}?code=abc`, expected))).toBe('state_mismatch'));
  it('rejects mix-up via iss parameter', async () => expect(await code(() => parseCallback(`${REDIRECT_URI}?code=abc&state=expected-state&iss=https%3A%2F%2Fevil.test`, expected))).toBe('issuer_mismatch'));
  it('rejects unexpected redirect URI', async () => expect(await code(() => parseCallback('apeitalia://evil?code=abc&state=expected-state', expected))).toBe('callback_invalid'));
  it('surfaces provider errors', async () => expect(await code(() => parseCallback(`${REDIRECT_URI}?error=access_denied&state=expected-state`, expected))).toBe('access_denied'));
  it('rejects duplicated parameters', async () => expect(await code(() => parseCallback(`${REDIRECT_URI}?code=a&code=b&state=expected-state`, expected))).toBe('callback_invalid'));
});

describe('ID token validation', () => {
  const now = 1_800_000_000;
  const base = { iss: ISSUER, sub: 'u1', aud: CLIENT_ID, exp: now + 300, iat: now, nonce: 'n1' };
  const exp = { issuer: ISSUER, clientId: CLIENT_ID, nonce: 'n1', nowSec: now };
  it('accepts valid claims', () => expect(validateIdToken(fakeJwt(base), exp).sub).toBe('u1'));
  it('rejects nonce mismatch (replay)', async () => expect(await code(() => validateIdToken(fakeJwt({ ...base, nonce: 'other' }), exp))).toBe('nonce_mismatch'));
  it('rejects missing nonce', async () => { const { nonce: _n, ...c } = base; expect(await code(() => validateIdToken(fakeJwt(c), exp))).toBe('nonce_mismatch'); });
  it('rejects expired token', async () => expect(await code(() => validateIdToken(fakeJwt({ ...base, exp: now - 1000 }), exp))).toBe('id_token_expired'));
  it('rejects wrong issuer', async () => expect(await code(() => validateIdToken(fakeJwt({ ...base, iss: 'https://evil.test' }), exp))).toBe('id_token_invalid'));
  it('rejects wrong audience', async () => expect(await code(() => validateIdToken(fakeJwt({ ...base, aud: 'other' }), exp))).toBe('id_token_invalid'));
  it('requires azp with multiple audiences', async () => {
    expect(await code(() => validateIdToken(fakeJwt({ ...base, aud: [CLIENT_ID, 'x'] }), exp))).toBe('id_token_invalid');
    expect(validateIdToken(fakeJwt({ ...base, aud: [CLIENT_ID, 'x'], azp: CLIENT_ID }), exp).sub).toBe('u1');
  });
  it('rejects alg none and HMAC', async () => {
    expect(await code(() => validateIdToken(fakeJwt(base, { alg: 'none' }), exp))).toBe('id_token_invalid');
    expect(await code(() => validateIdToken(fakeJwt(base, { alg: 'HS256' }), exp))).toBe('id_token_invalid');
  });
  it('rejects tokens issued in the future', async () => expect(await code(() => validateIdToken(fakeJwt({ ...base, iat: now + 3600 }), exp))).toBe('id_token_invalid'));
  it('rejects malformed tokens', async () => expect(await code(() => validateIdToken('a.b', exp))).toBe('id_token_invalid'));
});
