import { beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ epoch: 0, api: vi.fn(), download: vi.fn() }));
vi.mock('./server', () => ({
 api: mock.api,
 download: mock.download,
 sessionBoundary: () => {
  const initial = mock.epoch;
  return () => { if (mock.epoch !== initial) throw new Error('Sessione cambiata'); };
 },
}));
import { loadCurrentAssignment, loadDossier, type RemoteAssignment } from './certifier-remote';

const assignment: RemoteAssignment = {
 id: 'assignment-a', status: 'ACCEPTED', offeredAt: '2026-11-25T10:00:00Z', expiresAt: '2026-11-26T10:00:00Z',
 caseId: 'case-a', caseStatus: 'ASSIGNED', property: { city: 'Comune sintetico', region: 'Regione sintetica' },
 summary: { propertyType: null, floorArea: null, province: null, urgency: null, hasPlan: null, estimatedClass: null, payout: null },
 call: null,
};
const me = { name: 'Certificatore sintetico', sace: 'SYNTH' };
const evidence = [
 { id: 'image-a', kind: 'boiler', mimeType: 'image/jpeg', sizeBytes: 100, scanStatus: 'clean' },
 { id: 'image-b', kind: 'boiler', mimeType: 'image/jpeg', sizeBytes: 100, scanStatus: 'clean' },
 { id: 'video-a', kind: 'walkthrough', mimeType: 'video/mp4', sizeBytes: 100, scanStatus: 'clean' },
 { id: 'pending-a', kind: 'boiler', mimeType: 'image/jpeg', sizeBytes: 100, scanStatus: 'pending' },
];
beforeEach(() => {
 mock.epoch = 0;
 mock.api.mockReset().mockImplementation(async (path: string) => {
  if (path.endsWith('/survey')) return { survey: { answers: { floorArea: 80 } } };
  if (path.endsWith('/evidence')) return evidence;
  if (path.endsWith('/inspection')) return { inspection: null };
  if (path.endsWith('/assignments')) return [assignment];
  throw new Error('unexpected route');
 });
 mock.download.mockReset().mockImplementation(async (_path: string, name: string) => 'cache/' + name);
});

describe('certifier dossier session and authorization boundaries', () => {
 it('loads clean images and lazy video references in a stable session', async () => {
  const draft = await loadDossier(assignment, me);
  expect(draft.answers).toEqual({ floorArea: 80 });
  expect(draft.photos['kind:boiler']?.map(p => p.uri)).toEqual(['cache/image-a.jpg', 'cache/image-b.jpg']);
  expect(draft.photos['kind:walkthrough']?.[0]?.uri).toBe('remote:assignment-a:video-a');
  expect(mock.download).toHaveBeenCalledTimes(2);
 });
 it('does not start media downloads if the session changed during initial metadata requests', async () => {
  mock.api.mockImplementationOnce(async () => {
   mock.epoch++;
   return { survey: { answers: { floorArea: 80 } } };
  });
  await expect(loadDossier(assignment, me)).rejects.toThrow('Sessione cambiata');
  expect(mock.download).not.toHaveBeenCalled();
 });
 it('does not continue to the next attachment or return a dossier after a session change', async () => {
  mock.download.mockImplementationOnce(async () => { mock.epoch++; return 'cache/image-a.jpg'; });
  await expect(loadDossier(assignment, me)).rejects.toThrow('Sessione cambiata');
  expect(mock.download).toHaveBeenCalledTimes(1);
 });
 it('rejects an assignment removed from the current list instead of restoring stale metadata', async () => {
  expect(await loadCurrentAssignment(assignment.id)).toEqual(assignment);
  mock.api.mockResolvedValueOnce([]);
  await expect(loadCurrentAssignment(assignment.id)).rejects.toThrow('Incarico non più disponibile');
 });
 it('rejects a late assignment list from another session', async () => {
  mock.api.mockImplementationOnce(async () => { mock.epoch++; return [assignment]; });
  await expect(loadCurrentAssignment(assignment.id)).rejects.toThrow('Sessione cambiata');
 });
});
