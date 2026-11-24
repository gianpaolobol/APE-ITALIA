import { beforeEach, describe, expect, it, vi } from 'vitest';
import { submitToServer, type SubmitState } from './remote-submit';

const m = vi.hoisted(() => ({ api: vi.fn(), fresh: vi.fn(), upload: vi.fn(), guard: vi.fn() }));
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
  if (path === '/v1/notices') return { evidence_processing: 'v1' };
  return {};
 });
});

describe('remote submission retry', () => {
 it('requires explicit acceptance before making any request', async () => {
  await expect(submitToServer({ answers: { ...answers, privacy: false }, photos: {} }, progress, vi.fn())).rejects.toThrow('Accetta');
  expect(m.api).not.toHaveBeenCalled();
  expect(m.fresh).not.toHaveBeenCalled();
 });
 it('refuses a checkpoint belonging to a different account', async () => {
  await expect(submitToServer({ answers, photos: {}, remoteOwner: { ...owner, subject: 'subject-b' } }, progress, vi.fn())).rejects.toThrow('altro account');
  expect(m.api).not.toHaveBeenCalled();
 });
 it('saves acknowledged property and case before consent; retry reuses them', async () => {
  let cp: SubmitState = {};
  const checkpoint = async (s: SubmitState) => { cp = s; };
  m.api.mockImplementationOnce(async () => ({ id: 'property-a' }))
   .mockImplementationOnce(async () => ({ id: 'case-a' }))
   .mockImplementationOnce(async () => { throw new Error('offline'); });
  await expect(submitToServer({ answers, photos: {} }, progress, checkpoint)).rejects.toThrow('offline');
  expect(cp).toMatchObject({ remoteCaseId: 'case-a', remotePropertyId: 'property-a', remoteOwner: owner });
  m.api.mockClear();
  await expect(submitToServer({ answers, photos: {}, ...cp }, progress, checkpoint)).resolves.toEqual({ caseId: 'case-a' });
  expect(m.api.mock.calls.map(c => c[0])).toEqual(['/v1/cases/case-a', '/v1/notices', '/v1/cases/case-a/consents', '/v1/cases/case-a/survey', '/v1/cases/case-a/submit']);
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
