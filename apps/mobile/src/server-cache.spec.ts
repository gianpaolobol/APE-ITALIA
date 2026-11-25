import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getItemAsync: vi.fn(), deleteItemAsync: vi.fn(), download: vi.fn(), removeDir: vi.fn(), createDir: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({ getItemAsync: mocks.getItemAsync, deleteItemAsync: mocks.deleteItemAsync }));
vi.mock('expo-file-system', () => ({
 Paths: { cache: 'cache' },
 Directory: class {
  uri: string;
  exists = true;
  constructor(...parts: string[]) { this.uri = parts.join('/'); }
  create() { mocks.createDir(this.uri); }
  delete() { mocks.removeDir(this.uri); }
 },
 File: class {
  uri: string;
  size = 8;
  constructor(dir: string | { uri: string }, name?: string) { this.uri = typeof dir === 'string' ? dir : dir.uri + '/' + name; }
  static downloadFileAsync = mocks.download;
  open() { return { offset: 0, readBytes: (n: number) => new Uint8Array(n), close() {} }; }
 },
}));
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
const noContent = { ok: true, status: 204 };

beforeEach(() => {
 vi.resetModules();
 vi.resetAllMocks();
 mocks.getItemAsync.mockResolvedValue(JSON.stringify({
  accessToken: 'synthetic-access', expiresAt: Date.now() + 60_000, refreshToken: 'synthetic-refresh',
  email: 'test@example.invalid', subject: 'user-a', organizationId: 'org-a', isCertifier: false,
 }));
 mocks.deleteItemAsync.mockResolvedValue(undefined);
 mocks.download.mockImplementation(async (_url: string, dest: { uri: string }) => dest);
 vi.stubGlobal('fetch', vi.fn(async () => noContent));
});
afterEach(() => vi.unstubAllGlobals());

describe('remote cache lifetime and filename boundaries', () => {
 it('purges old plaintext downloads at first session read, not on every read or download', async () => {
  const s = await import('./server');
  await s.getSession();
  expect(mocks.removeDir).toHaveBeenCalledTimes(1);
  expect(mocks.removeDir).toHaveBeenCalledWith('cache/remote');
  await s.getSession();
  await s.download('/v1/test', 'document.pdf');
  await s.download('/v1/test', 'another.jpg');
  expect(mocks.removeDir).toHaveBeenCalledTimes(1);
  expect(mocks.download).toHaveBeenCalledTimes(2);
 });
 it('blocks downloads while stale cache cannot be removed, then permits retry', async () => {
  mocks.removeDir.mockImplementation(() => { throw new Error('protected cache'); });
  const s = await import('./server');
  await expect(s.download('/v1/test', 'document.pdf')).rejects.toThrow('Pulizia cache non riuscita');
  expect(mocks.download).not.toHaveBeenCalled();
  expect(mocks.createDir).not.toHaveBeenCalled();
  mocks.removeDir.mockImplementation(() => undefined);
  await expect(s.download('/v1/test', 'document.pdf')).resolves.toMatch(/document\.pdf$/);
 });
 it('rejects unsafe names before creating files or contacting the download endpoint', async () => {
  const s = await import('./server');
  for (const name of ['../secret.pdf', '/secret.pdf', 'nested/file.pdf', 'a..pdf', 'a%2fb.pdf', '', 'x'.repeat(201)]) {
   await expect(s.download('/v1/test', name)).rejects.toThrow('Nome file non valido');
  }
  expect(mocks.createDir).not.toHaveBeenCalled();
  expect(mocks.download).not.toHaveBeenCalled();
 });
 it('cleans the request directory if native directory creation fails after partial creation', async () => {
  mocks.createDir.mockImplementation(() => { throw new Error('create failed'); });
  const s = await import('./server');
  await expect(s.download('/v1/test', 'document.pdf')).rejects.toThrow('create failed');
  expect(mocks.removeDir).toHaveBeenLastCalledWith(expect.stringMatching(/^cache\/remote\/download-/));
  expect(mocks.download).not.toHaveBeenCalled();
 });
});

describe('resumable upload callbacks', () => {
 it('does not continue skipped parts or finish after a progress callback logs out', async () => {
  const s = await import('./server');
  const fetcher = vi.fn(async (url: string) => url.endsWith('/uploads/upload-a') ? ok({ receivedParts: [0], completed: false, evidenceId: null }) : noContent);
  vi.stubGlobal('fetch', fetcher);
  // One 8-byte file, one part marked as already received. A logout at the first callback must prevent completion.
  const progress = vi.fn(() => { void s.logout(); });
  await expect(s.uploadResumable('case-a', 'video', 'local.mp4', progress, 'upload-a')).rejects.toThrow('Sessione cambiata');
  expect(progress).toHaveBeenCalledTimes(1);
  expect(fetcher.mock.calls.some(([url]) => url.endsWith('/complete'))).toBe(false);
 });
});
