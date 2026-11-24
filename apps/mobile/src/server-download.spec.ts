import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
 getItemAsync: vi.fn(),
 deleteItemAsync: vi.fn(async () => undefined),
 download: vi.fn(),
 removeDir: vi.fn(),
}));
vi.mock('expo-secure-store', () => ({ getItemAsync: mocks.getItemAsync, deleteItemAsync: mocks.deleteItemAsync }));
vi.mock('expo-file-system', () => ({
 Paths: { cache: 'cache' },
 Directory: class {
  uri: string;
  exists = true;
  constructor(...parts: string[]) { this.uri = parts.join('/'); }
  create() {}
  delete() { mocks.removeDir(this.uri); }
 },
 File: class {
  uri: string;
  // Pretend an old cached file exists: that must never bypass the server.
  exists = true;
  constructor(dir: { uri: string }, name: string) { this.uri = dir.uri + '/' + name; }
  static downloadFileAsync = mocks.download;
 },
}));
import { download, logout } from './server';
import { downloadCertificate } from './remote-status';

describe('authenticated mobile downloads', () => {
 it('sends tenant header, reauthorizes repeated downloads, rejects denied access and clears cache on logout', async () => {
  mocks.getItemAsync.mockResolvedValue(JSON.stringify({
   accessToken: 'test-access', expiresAt: Date.now() + 60_000, refreshToken: 'test-refresh',
   email: 'test@example.invalid', subject: 'user-a', organizationId: 'org-a', isCertifier: true,
  }));
  mocks.download.mockImplementation(async (_url: string, dest: { uri: string }) => dest);
  const first = await downloadCertificate('case-a');
  expect(mocks.download).toHaveBeenLastCalledWith(expect.stringContaining('/v1/cases/case-a/certificate/content'), expect.anything(), {
   headers: { Authorization: 'Bearer test-access', 'x-organization-id': 'org-a' },
  });
  const second = await downloadCertificate('case-a');
  expect(second).not.toBe(first);
  expect(mocks.download).toHaveBeenCalledTimes(2);
  mocks.download.mockRejectedValueOnce(new Error('403'));
  await expect(downloadCertificate('case-a')).rejects.toThrow('403');
  await download('/v1/certifier/assignments/a/evidence/b/content', 'b.pdf');
  expect(mocks.download).toHaveBeenLastCalledWith(expect.any(String), expect.anything(), {
   headers: { Authorization: 'Bearer test-access' },
  });
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 204 })));
  try {
   await logout();
   expect(mocks.removeDir).toHaveBeenCalledWith('cache/remote');
   expect(mocks.deleteItemAsync).toHaveBeenCalled();
   await expect(downloadCertificate('case-a')).rejects.toThrow('Accedi');
   expect(mocks.download).toHaveBeenCalledTimes(4);
  } finally { vi.unstubAllGlobals(); }
 });
});
