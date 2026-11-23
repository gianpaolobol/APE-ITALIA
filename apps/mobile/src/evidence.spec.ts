import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApeApi } from './api';
import { CLIENT_MAX_BYTES, STEP_EVIDENCE, countByKind, precheckFile } from './evidence';

afterEach(() => vi.unstubAllGlobals());
const session = { apiBaseUrl: 'https://api.example.test', accessToken: 'synthetic-token', organizationId: 'tenant-test' };
const photo = { uri: 'file:///synthetic/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', size: 1000 };

describe('client pre-checks (server stays authoritative)', () => {
 it('accepts photos for photo kinds', () => expect(precheckFile('boiler', photo)).toBeNull());
 it('rejects PDF for photo kinds but accepts it for plans', () => {
  const pdf = { ...photo, mimeType: 'application/pdf', name: 'p.pdf' };
  expect(precheckFile('boiler', pdf)).toMatch(/fotografie/);
  expect(precheckFile('floorplan', pdf)).toBeNull();
 });
 it('rejects oversize and unsupported files', () => {
  expect(precheckFile('boiler', { ...photo, size: CLIENT_MAX_BYTES + 1 })).toMatch(/15 MB/);
  expect(precheckFile('document', { ...photo, mimeType: 'application/zip' })).toMatch(/Formato/);
 });
 it('maps wizard steps to evidence kinds', () => {
  expect(STEP_EVIDENCE.heating).toEqual(['boiler', 'heating']);
  expect(STEP_EVIDENCE.property).toBeUndefined();
 });
 it('counts uploads per kind', () => {
  expect(countByKind([{ kind: 'boiler' }, { kind: 'boiler' }, { kind: 'window' }] as never)).toEqual({ boiler: 2, window: 1 });
 });
});

describe('evidence API client', () => {
 it('uploads multipart without overriding Content-Type and with tenant headers', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'e1' }) });
  vi.stubGlobal('fetch', f);
  await new ApeApi(session).uploadEvidence('case-1', 'boiler', photo);
  const [url, init] = f.mock.calls[0];
  expect(url).toBe('https://api.example.test/v1/cases/case-1/evidence');
  expect(init.method).toBe('POST');
  expect(init.headers).toEqual({ Authorization: 'Bearer synthetic-token', 'x-organization-id': 'tenant-test' });
  expect(init.body).toBeInstanceOf(FormData);
  expect((init.body as FormData).get('kind')).toBe('boiler');
 });
 it('refuses HTTP before sending the file', async () => {
  const f = vi.fn(); vi.stubGlobal('fetch', f);
  await expect(new ApeApi({ ...session, apiBaseUrl: 'http://api.test' }).uploadEvidence('c', 'boiler', photo)).rejects.toThrow('HTTPS');
  expect(f).not.toHaveBeenCalled();
 });
 it('maps server rejections to user messages', async () => {
  for (const [status, msg] of [[413, 'troppo grande'], [415, 'Formato'], [403, 'consenso'], [409, 'già caricato']] as const) {
   vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status }));
   await expect(new ApeApi(session).uploadEvidence('c', 'boiler', photo)).rejects.toMatchObject({ status, message: expect.stringContaining(msg) });
  }
 });
 it('sends consent with the server-provided notice version and submits the case', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
  vi.stubGlobal('fetch', f);
  const api = new ApeApi(session);
  await api.giveConsent('case-1', '2026-11-23-draft');
  await api.submitCase('case-1');
  expect(f.mock.calls[0][0]).toBe('https://api.example.test/v1/cases/case-1/consents');
  expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ kind: 'evidence_processing', version: '2026-11-23-draft' });
  expect(f.mock.calls[1][0]).toBe('https://api.example.test/v1/cases/case-1/submit');
 });
 it('encodes path segments', async () => {
  const f = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal('fetch', f);
  await new ApeApi(session).listEvidence('../properties');
  expect(f.mock.calls[0][0]).toBe('https://api.example.test/v1/cases/..%2Fproperties/evidence');
 });
});
