import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getItemAsync: vi.fn(),
 setItemAsync: vi.fn(),
 deleteItemAsync: vi.fn(),
 download: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({ getItemAsync: mocks.getItemAsync, setItemAsync: mocks.setItemAsync, deleteItemAsync: mocks.deleteItemAsync }));
vi.mock('expo-file-system', () => ({
 Paths: { cache: 'cache' },
 Directory: class { uri = 'cache/remote'; exists = true; create() {} delete() {} },
 File: class { static downloadFileAsync = mocks.download; constructor(_dir: unknown, _name: string) {} },
}));

function deferred<T>() {
 let resolve!: (value: T) => void;
 const promise = new Promise<T>(r => { resolve = r; });
 return { promise, resolve };
}
const session = (subject = 'user-a', expiresAt = 0) => ({
 accessToken: 'access-' + subject, refreshToken: 'old-' + subject, expiresAt, email: subject + '@example.invalid', subject, organizationId: 'org-' + subject, isCertifier: false,
});
const auth = (subject = 'user-a') => ({
 accessToken: 'new-access-' + subject, refreshToken: 'new-refresh-' + subject, expiresIn: 3600, user: { subject, email: subject + '@example.invalid' }, organizationId: 'org-' + subject, isCertifier: false,
});
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const noContent = { ok: true, status: 204 };
let stored: string | null;
beforeEach(() => {
 vi.resetModules();
 vi.resetAllMocks();
 stored = JSON.stringify(session());
 mocks.getItemAsync.mockImplementation(async () => stored);
 mocks.setItemAsync.mockImplementation(async (_key: string, value: string) => { stored = value; });
 mocks.deleteItemAsync.mockImplementation(async () => { stored = null; });
});
afterEach(() => vi.unstubAllGlobals());

describe('mobile session concurrency', () => {
 it('does not resurrect a logged-out session when a refresh completes late; revokes the rotated token', async () => {
  const response = deferred<unknown>(), started = deferred<void>();
  const fetcher = vi.fn(async (url: string) => {
   if (url.endsWith('/refresh')) { started.resolve(); return response.promise; }
   return noContent;
  });
  vi.stubGlobal('fetch', fetcher);
  const s = await import('./server');
  const refresh = s.freshSession();
  await started.promise;
  await s.logout();
  response.resolve(ok(auth()));
  expect(await refresh).toBeNull();
  expect(await s.getSession()).toBeNull();
  expect(stored).toBeNull();
  expect(fetcher).toHaveBeenCalledWith(expect.stringContaining('/logout'), expect.objectContaining({ body: JSON.stringify({ refreshToken: 'new-refresh-user-a' }) }));
 });
 it('serializes secure storage writes and logout even if a refresh is already being persisted', async () => {
  const writing = deferred<void>(), finish = deferred<void>();
  mocks.setItemAsync.mockImplementation(async (_key: string, value: string) => { writing.resolve(); await finish.promise; stored = value; });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/refresh') ? ok(auth()) : noContent));
  const s = await import('./server');
  const refresh = s.freshSession();
  await writing.promise;
  const logout = s.logout();
  expect(await s.getSession()).toBeNull();
  finish.resolve();
  await logout;
  expect(await refresh).toBeNull();
  expect(stored).toBeNull();
 });
 it('a failed old refresh cannot erase a newly verified account', async () => {
  const response = deferred<unknown>(), started = deferred<void>();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
   if (url.endsWith('/refresh')) { started.resolve(); return response.promise; }
   if (url.endsWith('/email/verify')) return ok(auth('user-b'));
   return noContent;
  }));
  const s = await import('./server');
  const refresh = s.freshSession();
  await started.promise;
  expect((await s.verifyLogin('user-b@example.invalid', '123456')).subject).toBe('user-b');
  response.resolve({ ok: false, status: 401, json: async () => ({}) });
  expect(await refresh).toBeNull();
  expect((await s.getSession())?.subject).toBe('user-b');
  expect(JSON.parse(stored!).subject).toBe('user-b');
 });
 it('discards a pending login response after logout', async () => {
  const response = deferred<unknown>(), started = deferred<void>();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
   if (url.endsWith('/email/verify')) { started.resolve(); return response.promise; }
   return noContent;
  }));
  const s = await import('./server');
  const login = s.verifyLogin('user-a@example.invalid', '123456');
  await started.promise;
  await s.logout();
  response.resolve(ok(auth()));
  await expect(login).rejects.toThrow('Sessione cambiata');
  expect(stored).toBeNull();
 });
 it('rejects a late download even after a new login to the same account', async () => {
  stored = JSON.stringify(session('user-a', Date.now() + 60_000));
  const response = deferred<{ uri: string }>(), started = deferred<void>();
  mocks.download.mockImplementation(() => { started.resolve(); return response.promise; });
  vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('/email/verify') ? ok(auth()) : noContent));
  const s = await import('./server');
  const download = s.download('/v1/test', 'test.pdf');
  await started.promise;
  await s.logout();
  await s.verifyLogin('user-a@example.invalid', '123456');
  response.resolve({ uri: 'old-file' });
  await expect(download).rejects.toThrow('Sessione cambiata');
 });
 it('rejects late API data after logout', async () => {
  stored = JSON.stringify(session('user-a', Date.now() + 60_000));
  const response = deferred<unknown>(), started = deferred<void>();
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
   if (url.endsWith('/test')) { started.resolve(); return response.promise; }
   return noContent;
  }));
  const s = await import('./server');
  const data = s.api('/v1/test', { org: true });
  await started.promise;
  await s.logout();
  response.resolve(ok({ privateData: true }));
  await expect(data).rejects.toThrow('Sessione cambiata');
 });
});
