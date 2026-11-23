import { describe, expect, it, vi } from 'vitest';
import { downloadCertificate } from './certificate-download';

const session = { apiBaseUrl: 'https://api.example.test/', accessToken: 'synthetic', organizationId: 'org-1' };
const CASE = '123e4567-e89b-42d3-a456-426614174000';

describe('certificate download', () => {
 it('downloads with tenant headers into the app cache and opens the share sheet', async () => {
  const download = vi.fn().mockResolvedValue({ uri: 'file:///cache/APE.pdf' });
  const share = { available: vi.fn().mockResolvedValue(true), share: vi.fn() };
  expect(await downloadCertificate(session, CASE, { download, share })).toBe('file:///cache/APE.pdf');
  expect(download).toHaveBeenCalledWith(`https://api.example.test/v1/cases/${CASE}/certificate/content`, `APE-${CASE}.pdf`, { Authorization: 'Bearer synthetic', 'x-organization-id': 'org-1' });
  expect(share.share).toHaveBeenCalledWith('file:///cache/APE.pdf');
 });
 it('refuses HTTP and malformed case ids before any network call', async () => {
  const download = vi.fn();
  const share = { available: vi.fn(), share: vi.fn() };
  await expect(downloadCertificate({ ...session, apiBaseUrl: 'http://api.test' }, CASE, { download, share })).rejects.toThrow('HTTPS');
  await expect(downloadCertificate(session, '../evil', { download, share })).rejects.toThrow('Invalid case');
  expect(download).not.toHaveBeenCalled();
 });
 it('still returns the file when sharing is unavailable', async () => {
  const share = { available: vi.fn().mockResolvedValue(false), share: vi.fn() };
  expect(await downloadCertificate(session, CASE, { download: vi.fn().mockResolvedValue({ uri: 'file:///x' }), share })).toBe('file:///x');
  expect(share.share).not.toHaveBeenCalled();
 });
});
