import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitToServer, type SubmitState } from './remote-submit';

const m = vi.hoisted(() => ({ api: vi.fn(), fresh: vi.fn(), upload: vi.fn(), guard: vi.fn() }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '123e4567-e89b-42d3-a456-426614174000' }));
vi.mock('./server', () => ({ api: m.api, freshSession: m.fresh, uploadResumable: m.upload, sessionBoundary: () => m.guard, serverEnabled: () => true }));
vi.mock('./survey/questions', () => ({ PROVINCES: [], pruneHidden: (answers: unknown, photos: unknown) => ({ answers, photos }) }));
vi.mock('./energy/estimate', () => ({ estimate: () => null }));
vi.mock('./pricing', () => ({ quote: () => null }));

const answers = { dataNotice: true, privacy: true, street: 'Via di test', municipality: 'Bologna' };
const owner = { subject: 'subject-a', organizationId: 'org-a' };
const progress = () => undefined;
const video = { uri: 'file:///video.mp4', name: 'video.mp4', mimeType: 'video/mp4', takenAt: '2026-01-01' };

beforeEach(() => {
 vi.resetAllMocks();
 m.fresh.mockResolvedValue(owner);
 m.api.mockImplementation(async (path: string) => {
  if (path === '/v1/properties') return { id: 'property-a' };
  if (path === '/v1/cases') return { id: 'case-a' };
  if (path === '/v1/cases/case-a') return { status: 'DRAFT' };
  if (path === '/v1/notices') return { evidence_processing: '2026-11-23-draft' };
  return {};
 });
});

describe('remote submission retry', () => {
 it('requires explicit acceptance before making any request', async () => {
  await expect(submitToServer({ answers: { ...answers, privacy: false }, photos: {} }, progress, vi.fn())).rejects.toThrow('Accetta');
  expect(m.api).not.toHaveBeenCalled();
  expect(m.fresh).not.toHaveBeenCalled();
 });
 it('does not accept a newer server notice on behalf of the user', async () => {
  m.api.mockResolvedValueOnce({ status: 'DRAFT' }).mockResolvedValueOnce({ evidence_processing: 'future-version' });
  await expect(submitToServer({ answers, photos: {}, remoteCaseId: 'case-a', remoteOwner: owner }, progress, vi.fn())).rejects.toThrow('Informativa aggiornata');
  expect(m.api.mock.calls.map(c => c[0])).toEqual(['/v1/cases/case-a', '/v1/notices']);
 });
 it('does not create a property or case when the displayed notice is outdated', async () => {
  m.api.mockResolvedValueOnce({ evidence_processing: 'future-version' });
  await expect(submitToServer({ answers, photos: {} }, progress, vi.fn())).rejects.toThrow('Informativa aggiornata');
  expect(m.api.mock.calls.map(c => c[0])).toEqual(['/v1/notices']);
 });
 it('refuses a checkpoint belonging to a different account', async () => {
  await expect(submitToServer({ answers, photos: {}, remoteOwner: { ...owner, subject: 'subject-b' } }, progress, vi.fn())).rejects.toThrow('altro account');
  expect(m.api).not.toHaveBeenCalled();
 });
 it('saves acknowledged property and case before consent; retry reuses them', async () => {
  let cp: SubmitState = {};
  const checkpoint = async (s: SubmitState) => { cp = s; };
  m.api.mockResolvedValueOnce({ evidence_processing: '2026-11-23-draft' })
   .mockImplementationOnce(async () => ({ id: 'property-a' }))
   .mockImplementationOnce(async () => ({ id: 'case-a' }))
   .mockImplementationOnce(async () => { throw new Error('offline'); });
  await expect(submitToServer({ answers, photos: {} }, progress, checkpoint)).rejects.toThrow('offline');
  expect(cp).toMatchObject({ remoteCaseId: 'case-a', remotePropertyId: 'property-a', remoteOwner: owner });
  m.api.mockClear();
  await expect(submitToServer({ answers, photos: {}, ...cp }, progress, checkpoint)).resolves.toEqual({ caseId: 'case-a' });
  expect(m.api.mock.calls.map(c => c[0])).toEqual(['/v1/cases/case-a', '/v1/notices', '/v1/cases/case-a/consents', '/v1/cases/case-a/survey', '/v1/cases/case-a/submit']);
 });
 it('persists the creation key before the first request and reuses it after a lost response', async () => {
  let cp: SubmitState = {};
  const checkpoint = (s: SubmitState) => { cp = s; };
  m.api.mockResolvedValueOnce({ evidence_processing: '2026-11-23-draft' }).mockImplementationOnce(async (_path, init) => {
   expect(cp.remoteCreationKey).toBeTruthy();
   expect(init.body.idempotencyKey).toBe(cp.remoteCreationKey);
   throw new Error('lost creation response');
  });
  await expect(submitToServer({ answers, photos: {} }, progress, checkpoint)).rejects.toThrow('lost creation response');
  const key = cp.remoteCreationKey;
  m.api.mockClear();
  await submitToServer({ answers, photos: {}, ...cp }, progress, checkpoint);
  expect(m.api.mock.calls[1][1].body.idempotencyKey).toBe(key);
  expect(m.api.mock.calls[2][1].body.idempotencyKey).toBe(key);
 });
 it('stops before uploads and submission if the survey write fails', async () => {
  m.api.mockResolvedValueOnce({ status: 'DRAFT' }).mockResolvedValueOnce({ evidence_processing: '2026-11-23-draft' }).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('survey failed'));
  await expect(submitToServer({ answers, photos: { walkthrough: [video] }, remoteCaseId: 'case-a', remoteOwner: owner }, progress, vi.fn())).rejects.toThrow('survey failed');
  expect(m.api.mock.calls.map(c => c[0])).toEqual(['/v1/cases/case-a', '/v1/notices', '/v1/cases/case-a/consents', '/v1/cases/case-a/survey']);
  expect(m.upload).not.toHaveBeenCalled();
 });
 it('does not repeat writes after a submit response was lost', async () => {
  m.api.mockResolvedValueOnce({ status: 'ASSIGNED' });
  await expect(submitToServer({ answers, photos: {}, remoteCaseId: 'case-a', remoteOwner: owner }, progress, vi.fn())).resolves.toEqual({ caseId: 'case-a' });
  expect(m.api).toHaveBeenCalledTimes(1);
 });
 it('retains upload ID when video transfer fails and reuses it on retry', async () => {
  let cp: SubmitState = {};
  const checkpoint = (s: SubmitState) => { cp = s; };
  m.upload.mockImplementationOnce(async (_case, _kind, _uri, _progress, existing, started) => {
   expect(existing).toBeUndefined(); await started('upload-a'); throw new Error('offline');
  });
  await expect(submitToServer({ answers, photos: { walkthrough: [video] } }, progress, checkpoint)).rejects.toThrow('offline');
  expect(cp.videoUploads).toEqual({ [video.uri]: 'upload-a' });
  m.upload.mockImplementationOnce(async (_case, _kind, _uri, _progress, existing) => {
   expect(existing).toBe('upload-a'); return { id: 'evidence-a', uploadId: existing };
  });
  await submitToServer({ answers, photos: { walkthrough: [video] }, ...cp }, progress, checkpoint);
  expect(cp.videoUploads).toEqual({});
  expect(cp.uploaded).toEqual([video.uri]);
 });
 it('stops the flow at a session boundary before subsequent requests', async () => {
  const checkpoint = () => { m.guard.mockImplementation(() => { throw new Error('Sessione cambiata'); }); };
  await expect(submitToServer({ answers, photos: {} }, progress, checkpoint)).rejects.toThrow('Sessione cambiata');
  expect(m.api).not.toHaveBeenCalled();
 });
});

describe('authenticated survey upload reader', () => {
 const encrypted = { ...video, uri: 'file:///archive/draft/unique.apem' };
 it('never uploads encrypted bytes without a reader', async () => {
  await expect(submitToServer({ answers, photos: { walkthrough: [encrypted] } }, progress, vi.fn())).rejects.toThrow('Lettura allegato cifrato');
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.api.mock.calls.some(c => c[0].endsWith('/submit'))).toBe(false);
 });
 it('uses only the opened path and keeps the immutable encrypted reference for retry', async () => {
  let cp: SubmitState = {};
  const checkpoint = (s: SubmitState) => { cp = s; };
  const read = vi.fn(async (_q, _photo, use) => { await use('file:///private-cache/one.mp4'); });
  m.upload.mockImplementationOnce(async (_case, _kind, uri, _progress, _existing, started) => {
   expect(uri).toBe('file:///private-cache/one.mp4'); await started('upload-a'); throw new Error('offline');
  });
  await expect(submitToServer({ answers, photos: { walkthrough: [encrypted] } }, progress, checkpoint, read)).rejects.toThrow('offline');
  expect(cp.videoUploads).toEqual({ [encrypted.uri]: 'upload-a' });
  const retry = vi.fn(async (_q, _photo, use) => { await use('file:///private-cache/two.mp4'); });
  m.upload.mockImplementationOnce(async (_case, _kind, uri, _progress, existing) => {
   expect(uri).toBe('file:///private-cache/two.mp4'); expect(existing).toBe('upload-a');
  });
  await submitToServer({ answers, photos: { walkthrough: [encrypted] }, ...cp }, progress, checkpoint, retry);
  expect(cp.uploaded).toEqual([encrypted.uri]);
  expect(cp.videoUploads).toEqual({});
 });
 it('keeps a confirmed receipt when the reader fails during cleanup and avoids a second direct upload', async () => {
  let cp: SubmitState = {};
  const checkpoint = (s: SubmitState) => { cp = s; };
  const photo = { ...encrypted, mimeType: 'image/jpeg', name: 'photo.jpg' };
  const reader = async (_q: string, _p: unknown, use: (uri: string) => Promise<void>) => {
   await use('file:///private-cache/photo.jpg');
   throw new Error('cleanup failed');
  };
  await expect(submitToServer({ answers, photos: { wallPhotos: [photo] } }, progress, checkpoint, reader)).rejects.toThrow('cleanup failed');
  expect(cp.uploaded).toEqual([photo.uri]);
  expect(m.api.mock.calls.filter(c => c[0].endsWith('/evidence'))).toHaveLength(1);
  expect(m.api.mock.calls.some(c => c[0].endsWith('/submit'))).toBe(false);
  const retryReader = vi.fn();
  await submitToServer({ answers, photos: { wallPhotos: [photo] }, ...cp }, progress, checkpoint, retryReader);
  expect(retryReader).not.toHaveBeenCalled();
  expect(m.api.mock.calls.filter(c => c[0].endsWith('/evidence'))).toHaveLength(1);
 });
 it('rejects a reader that returns without uploading', async () => {
  await expect(submitToServer({ answers, photos: { walkthrough: [encrypted] } }, progress, vi.fn(), async () => {})).rejects.toThrow('Invio allegato non confermato');
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.api.mock.calls.some(c => c[0].endsWith('/submit'))).toBe(false);
 });
 it('does not submit when authentication or cache cleanup fails', async () => {
  const reader = async () => { throw new Error('Authentication failed'); };
  await expect(submitToServer({ answers, photos: { walkthrough: [encrypted] } }, progress, vi.fn(), reader)).rejects.toThrow('Authentication failed');
  expect(m.upload).not.toHaveBeenCalled();
  expect(m.api.mock.calls.some(c => c[0].endsWith('/submit'))).toBe(false);
 });
});
