import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAppAuthConfig, resolveApiSession } from './session';

afterEach(() => vi.unstubAllGlobals());
const env = {
 EXPO_PUBLIC_API_BASE_URL: 'https://api.example.test',
 EXPO_PUBLIC_OIDC_ISSUER: 'https://id.example.test',
 EXPO_PUBLIC_OIDC_CLIENT_ID: 'ape-mobile',
};
const auth = (s: { accessToken: string; subject: string } | null) => ({ getSession: async () => s && { ...s, expiresAt: 0 } });
const me = (subject: string, orgs: string[]) => vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ subject, memberships: orgs.map(o => ({ organizationId: o, organizationName: 'Org ' + o, role: 'member' })) }) });

describe('app auth configuration', () => {
 it('is null (fail closed) when nothing is configured', () => expect(loadAppAuthConfig({})).toBeNull());
 it('is null with an insecure API URL', () => expect(loadAppAuthConfig({ ...env, EXPO_PUBLIC_API_BASE_URL: 'http://api.test' })).toBeNull());
 it('applies safe defaults for redirect and audience', () => expect(loadAppAuthConfig(env)?.oidc).toEqual({ issuer: 'https://id.example.test', clientId: 'ape-mobile', redirectUri: 'apeitalia://auth/callback', audience: 'ape-italia-api' }));
});

describe('API session resolution', () => {
 it('returns no session without OIDC login and makes no request', async () => {
  const f = vi.fn(); vi.stubGlobal('fetch', f);
  expect(await resolveApiSession(auth(null), 'https://api.example.test')).toEqual({ session: null, memberships: [] });
  expect(f).not.toHaveBeenCalled();
 });
 it('uses the single membership confirmed by the API', async () => {
  const f = me('u1', ['org-1']); vi.stubGlobal('fetch', f);
  const r = await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test');
  expect(r.session).toEqual({ apiBaseUrl: 'https://api.example.test', accessToken: 'at', organizationId: 'org-1' });
  expect(f).toHaveBeenCalledWith('https://api.example.test/v1/me', expect.objectContaining({ headers: { Authorization: 'Bearer at' } }));
 });
 it('requires an explicit choice with several memberships', async () => {
  vi.stubGlobal('fetch', me('u1', ['org-1', 'org-2']));
  const r = await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test');
  expect(r.session).toBeNull();
  expect(r.memberships).toHaveLength(2);
  vi.stubGlobal('fetch', me('u1', ['org-1', 'org-2']));
  expect((await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test', 'org-2')).session?.organizationId).toBe('org-2');
 });
 it('refuses an organization the user is not a member of', async () => {
  vi.stubGlobal('fetch', me('u1', ['org-1']));
  expect((await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test', 'org-x')).session).toBeNull();
 });
 it('returns no session when the user has no membership', async () => {
  vi.stubGlobal('fetch', me('u1', []));
  expect((await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test')).session).toBeNull();
 });
 it('rejects a subject mismatch between token and API', async () => {
  vi.stubGlobal('fetch', me('someone-else', ['org-1']));
  expect((await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test')).session).toBeNull();
 });
 it('treats API 401 as signed out', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401 }));
  expect((await resolveApiSession(auth({ accessToken: 'at', subject: 'u1' }), 'https://api.example.test')).session).toBeNull();
 });
});
