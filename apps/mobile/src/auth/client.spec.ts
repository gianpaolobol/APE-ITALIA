import { describe, expect, it } from 'vitest';
import { OidcClient, STORAGE_KEY } from './client';
import { AUDIENCE, CLIENT_ID, FakeProvider, ISSUER, MemoryStorage, REDIRECT_URI, nodeCrypto } from './test-provider';

function setup() {
  const provider = new FakeProvider();
  const storage = new MemoryStorage();
  const make = () => new OidcClient(
    { issuer: ISSUER, clientId: CLIENT_ID, redirectUri: REDIRECT_URI, audience: AUDIENCE },
    { crypto: nodeCrypto, fetch: provider.fetch, browser: provider.browser, storage, now: () => provider.nowSec * 1000 },
  );
  return { provider, storage, client: make(), make };
}
const errCode = async (p: Promise<unknown>) => p.then(() => 'no-error', e => e.code ?? e.message);

describe('OidcClient end-to-end against a PKCE-enforcing fake provider', () => {
  it('logs in: provider verifies the S256 binding and the client validates nonce', async () => {
    const { client, provider } = setup();
    const session = await client.login();
    expect(session).toEqual({ accessToken: 'at-2', subject: 'synthetic-user-1', expiresAt: provider.nowSec + 300 });
    const exchange = provider.tokenRequests[0];
    expect(exchange.grant_type).toBe('authorization_code');
    expect(exchange.code_verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(exchange.client_secret).toBeUndefined();
    expect(provider.lastAuthorizeParams?.get('ui')).toBe('mobile');
  });

  it('persists only the refresh token, never access or ID tokens', async () => {
    const { client, storage } = setup();
    await client.login();
    const raw = storage.data.get(STORAGE_KEY)!;
    expect(raw).toContain('rt-');
    expect(raw).not.toContain('at-');
    expect(raw).not.toContain('eyJ');
  });

  it('rejects a callback whose state was tampered with and creates no session', async () => {
    const { client, provider, storage } = setup();
    provider.callbackOverride = (_p, c) => `${REDIRECT_URI}?code=${c}&state=attacker`;
    expect(await errCode(client.login())).toBe('state_mismatch');
    expect(provider.tokenRequests).toHaveLength(0);
    expect(storage.data.size).toBe(0);
    expect(await client.getSession()).toBeNull();
  });

  it('rejects an ID token with a replayed nonce', async () => {
    const { client, provider, storage } = setup();
    provider.idTokenOverride = c => ({ ...c, nonce: 'replayed' });
    expect(await errCode(client.login())).toBe('nonce_mismatch');
    expect(storage.data.size).toBe(0);
  });

  it('fails if the verifier sent does not match the challenge (code injection)', async () => {
    const { client, provider } = setup();
    // Attacker injects a code bound to a different challenge.
    provider.callbackOverride = (p, c) => {
      provider.codes.get(c)!.challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
      return `${REDIRECT_URI}?code=${c}&state=${encodeURIComponent(p.get('state')!)}`;
    };
    expect(await errCode(client.login())).toBe('invalid_grant');
  });

  it('treats user cancellation as an error without session', async () => {
    const { make, provider, storage } = setup();
    provider.browser.openAuthSession = async () => ({ type: 'cancel' });
    const client = make();
    expect(await errCode(client.login())).toBe('cancelled');
    expect(await client.getSession()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('refreshes near expiry and rotates the stored refresh token', async () => {
    const { client, provider, storage } = setup();
    await client.login();
    provider.nowSec += 290; // inside the 60s refresh margin
    const s = await client.getSession();
    expect(s?.accessToken).toBe('at-3');
    expect(provider.tokenRequests[1].grant_type).toBe('refresh_token');
    expect(storage.data.get(STORAGE_KEY)).toContain('rt-3');
  });

  it('restores a session after app restart from secure storage', async () => {
    const { client, make, provider } = setup();
    await client.login();
    const restarted = make();
    const s = await restarted.getSession();
    expect(s?.subject).toBe('synthetic-user-1');
    expect(provider.tokenRequests.at(-1)?.grant_type).toBe('refresh_token');
  });

  it('ends the session when the refresh token is revoked (invalid_grant)', async () => {
    const { client, provider, storage } = setup();
    await client.login();
    provider.refreshTokens.clear();
    provider.nowSec += 1000;
    expect(await client.getSession()).toBeNull();
    expect(storage.data.size).toBe(0);
  });

  it('does not keep using an expired access token without refresh token', async () => {
    const { client, provider } = setup();
    provider.issueRefreshToken = false;
    await client.login();
    expect(await client.getSession()).not.toBeNull();
    provider.nowSec += 400;
    expect(await client.getSession()).toBeNull();
  });

  it('deduplicates concurrent refreshes', async () => {
    const { client, provider } = setup();
    await client.login();
    provider.nowSec += 1000;
    const [a, b] = await Promise.all([client.getSession(), client.getSession()]);
    expect(a?.accessToken).toBe(b?.accessToken);
    expect(provider.tokenRequests.filter(r => r.grant_type === 'refresh_token')).toHaveLength(1);
  });

  it('logout clears storage and revokes the refresh token', async () => {
    const { client, provider, storage } = setup();
    await client.login();
    expect(await client.logout()).toEqual({ revoked: true });
    expect(provider.revoked).toEqual(['rt-2']);
    expect(storage.data.size).toBe(0);
    expect(await client.getSession()).toBeNull();
  });

  it('logout succeeds locally even if the provider is unreachable', async () => {
    const { client, provider, storage } = setup();
    await client.login();
    provider.fetch = async () => { throw new Error('offline'); };
    (client as unknown as { deps: { fetch: unknown } }).deps.fetch = provider.fetch;
    expect(await client.logout()).toEqual({ revoked: false });
    expect(storage.data.size).toBe(0);
  });

  it('discards corrupted or foreign persisted data', async () => {
    const { make, storage } = setup();
    storage.data.set(STORAGE_KEY, JSON.stringify({ v: 1, issuer: 'https://other.test', clientId: CLIENT_ID, subject: 'x', refreshToken: 'y' }));
    expect(await make().getSession()).toBeNull();
    expect(storage.data.size).toBe(0);
    storage.data.set(STORAGE_KEY, '{not json');
    expect(await make().getSession()).toBeNull();
    expect(storage.data.size).toBe(0);
  });
});
