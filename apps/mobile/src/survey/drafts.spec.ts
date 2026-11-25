import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ files: new Map<string, string>(), dirs: new Set<string>(), failMoveTo: '', failDeleteAt: '' }));
vi.mock('expo-file-system', () => {
 class Directory {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get exists() { return fs.dirs.has(this.uri); }
  create() { fs.dirs.add(this.uri); }
 }
 class File {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get exists() { return fs.files.has(this.uri); }
  create() { fs.files.set(this.uri, ''); }
  write(data: string) { fs.files.set(this.uri, data); }
  async text() { return fs.files.get(this.uri) ?? ''; }
  textSync() { return fs.files.get(this.uri) ?? ''; }
  delete() { if (this.uri === fs.failDeleteAt) throw new Error('simulated delete failure'); fs.files.delete(this.uri); }
  move(dest: File) {
   if (dest.uri === fs.failMoveTo) throw new Error('simulated move failure');
   if (!this.exists || dest.exists) throw new Error('invalid move');
   fs.files.set(dest.uri, fs.files.get(this.uri)!); fs.files.delete(this.uri); this.uri = dest.uri;
  }
 }
 return { Directory, File, Paths: { document: '/documents' } };
});
import { visiblePro, storePro, type ProProfile, canViewDraft, deleteDraftPhotoFile, removeDraftPhoto, loadState, newDraft, saveStateNow, persistPhoto, type AppState } from './drafts';

const primary = '/documents/ape/state.json';
const backup = '/documents/ape/state.bak.json';
const state = (...drafts: AppState['drafts']): AppState => ({ version: 1, drafts });

beforeEach(() => { fs.files.clear(); fs.dirs.clear(); fs.failMoveTo = ''; fs.failDeleteAt = ''; });

describe('draft snapshots and deletion', () => {
 it('initializes only when there is no evidence of an existing archive', async () => {
  expect(await loadState()).toEqual(state());
  expect(fs.files.size).toBe(0);
 });
 it('rejects two invalid snapshots without altering either copy', async () => {
  fs.files.set(primary, 'truncated');
  fs.files.set(backup, '{"version":2,"drafts":[]}');
  const before = [...fs.files];
  await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
  expect([...fs.files]).toEqual(before);
 });
 it('rejects a single corrupt snapshot or an interrupted initial write', async () => {
  for (const path of [primary, backup, '/documents/ape/state.tmp.json', '/documents/ape/state.bak.tmp.json']) {
   fs.files.clear();
   fs.files.set(path, 'partial');
   await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
   expect(fs.files.get(path)).toBe('partial');
  }
 });
 it('rejects an absent snapshot when a media directory remains', async () => {
  fs.dirs.add('/documents/ape/media');
  await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
 });
 it('allows retry after a valid backup becomes available', async () => {
  fs.files.set(primary, 'truncated');
  await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
  const a = newDraft();
  fs.files.set(backup, JSON.stringify(state(a)));
  expect(await loadState()).toEqual(state(a));
 });


 it('recovers a valid backup when primary is parseable but structurally invalid', async () => {
  const d = newDraft();
  fs.files.set(backup, JSON.stringify(state(d)));
  for (const bad of [null, {}, { ...d, photos: null }, { ...d, answers: [] },
   { ...d, localOwner: null }, { ...d, remoteOwner: { subject: 'a' } },
   { ...d, uploaded: 'uri' }, { ...d, videoUploads: [] }, { ...d, id: '../other' },
   { ...d, photos: { wall: [null] } }, { ...d, job: { status: 'accettata' } }]) {
   fs.files.set(primary, JSON.stringify({ version: 1, drafts: [bad] }));
   expect(await loadState()).toEqual(state(d));
  }
 });
 it('refuses duplicate draft identifiers or malformed profile scopes without rewriting either snapshot', async () => {
  const d = newDraft();
  for (const invalid of [state(d, d), { ...state(d), proProfiles: [null] },
   { ...state(d), proProfiles: [{ owner: { subject: 'a' }, profile: {} }] }]) {
   fs.files.set(primary, JSON.stringify(invalid));
   fs.files.set(backup, JSON.stringify(invalid));
   const before = [...fs.files];
   await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
   expect([...fs.files]).toEqual(before);
  }
 });
 it('preserves typed legacy survey data and account scopes across snapshot round trip', async () => {
  const d = { ...newDraft(), answers: { a: false, b: 0, c: '', d: ['one'] },
   localOwner: { subject: 'a', organizationId: null },
   photos: { wall: [{ uri: 'file:///documents/photo.jpg', name: 'photo.jpg', mimeType: 'image/jpeg', takenAt: '2026-11-25', width: 20 }] },
   uploaded: [], videoUploads: {} };
  const s = state(d);
  saveStateNow(s);
  expect(await loadState()).toEqual(s);
 });

 it('preserves committed snapshots and staging files when a runtime-invalid state is saved', async () => {
  const a = newDraft();
  saveStateNow(state(a));
  fs.files.set('/documents/ape/state.tmp.json', 'recoverable staging');
  const before = [...fs.files];
  for (const invalid of [state(a, a), state({ ...a, answers: { bad: NaN } }),
   state({ ...a, id: '../other' })]) {
   expect(() => saveStateNow(invalid)).toThrow('Invalid local snapshot');
   expect([...fs.files]).toEqual(before);
  }
  expect(await loadState()).toEqual(state(a));
 });
 it('rejects invalid initial state before creating any directories or files', () => {
  const a = newDraft();
  expect(() => saveStateNow(state(a, a))).toThrow('Invalid local snapshot');
  expect(fs.files.size).toBe(0);
  expect(fs.dirs.size).toBe(0);
 });
 it('rejects unsafe draft identifiers before copying evidence or creating directories', () => {
  for (const id of ['', '..', '../other', 'a/b', 'a\\b', '%2e%2e', ' a ']) {
   expect(() => persistPhoto(id, { uri: '/cache/test.jpg', name: 'test.jpg', mimeType: 'image/jpeg' }))
    .toThrow('Invalid draft identifier');
  }
  expect(fs.files.size).toBe(0);
  expect(fs.dirs.size).toBe(0);
 });

 it('never restores a successfully deleted draft from backup', async () => {
  const a = newDraft(), b = newDraft();
  saveStateNow(state(a, b));
  saveStateNow(state(b));
  expect(fs.files.get(primary)).toBe(fs.files.get(backup));
  expect([...fs.files.values()].every(v => !v.includes(a.id))).toBe(true);
  fs.files.set(primary, 'corrupt');
  expect(await loadState()).toEqual(state(b));
 });
 it('recovers the new snapshot when primary replacement is interrupted', async () => {
  const a = newDraft();
  saveStateNow(state(a));
  fs.failMoveTo = primary;
  expect(() => saveStateNow(state())).toThrow('simulated move failure');
  expect(await loadState()).toEqual(state());
 });
 it('recovers the committed backup even when the old primary still exists', async () => {
  const a = newDraft(), b = newDraft();
  saveStateNow(state(a, b));
  fs.failDeleteAt = primary;
  expect(() => saveStateNow(state(b))).toThrow('simulated delete failure');
  expect(JSON.parse(fs.files.get(primary)!)).toMatchObject(state(a, b));
  expect(JSON.parse(fs.files.get(backup)!)).toMatchObject(state(b));
  const before = [...fs.files];
  expect(await loadState()).toEqual(state(b));
  expect([...fs.files]).toEqual(before);
 });
 it('does not promote staging while backup replacement has not committed', async () => {
  const a = newDraft(), b = newDraft();
  saveStateNow(state(a));
  fs.failDeleteAt = backup;
  expect(() => saveStateNow(state(b))).toThrow('simulated delete failure');
  expect(await loadState()).toEqual(state(a));
 });
 it('does not promote unmatched staging or a divergent legacy backup', async () => {
  const a = newDraft(), b = newDraft(), c = newDraft();
  saveStateNow(state(a));
  fs.files.set(backup, JSON.stringify(state(b)));
  expect(await loadState()).toEqual(state(a));
  fs.files.set('/documents/ape/state.tmp.json', JSON.stringify(state(c)));
  expect(await loadState()).toEqual(state(a));
  fs.files.set('/documents/ape/state.tmp.json', 'truncated');
  expect(await loadState()).toEqual(state(a));
 });
 it('keeps the newest committed backup if a subsequent primary replacement fails', async () => {
  const a = newDraft(), b = newDraft(), c = newDraft();
  saveStateNow(state(a));
  fs.failDeleteAt = primary;
  expect(() => saveStateNow(state(b))).toThrow('simulated delete failure');
  expect(await loadState()).toEqual(state(b));
  fs.failDeleteAt = '';
  fs.failMoveTo = primary;
  expect(() => saveStateNow(state(c))).toThrow('simulated move failure');
  expect(await loadState()).toEqual(state(b));
  fs.failMoveTo = '';
  saveStateNow(state(c));
  expect(await loadState()).toEqual(state(c));
  expect(fs.files.get(primary)).toBe(fs.files.get(backup));
 });
 it('recovers the newer primary if the second replacement fails after backup recovery', async () => {
  const a = newDraft(), b = newDraft(), c = newDraft();
  saveStateNow(state(a));
  fs.failDeleteAt = primary;
  expect(() => saveStateNow(state(b))).toThrow('simulated delete failure');
  fs.failDeleteAt = backup;
  expect(() => saveStateNow(state(c))).toThrow('simulated delete failure');
  expect(await loadState()).toEqual(state(c));
 });
 it('recognizes matching legacy staging and migrates generations without changing app state', async () => {
  const a = newDraft(), b = newDraft();
  fs.files.set(primary, JSON.stringify(state(a)));
  fs.files.set(backup, JSON.stringify(state(b)));
  fs.files.set('/documents/ape/state.tmp.json', JSON.stringify(state(b)));
  expect(await loadState()).toEqual(state(b));
  saveStateNow(state(b));
  expect(JSON.parse(fs.files.get(primary)!).storageGeneration).toBe(1);
  expect(await loadState()).toEqual(state(b));
  expect(fs.files.get(primary)).toBe(fs.files.get(backup));
 });
 it('preserves the previous primary if backup replacement fails', async () => {
  const a = newDraft();
  saveStateNow(state(a));
  fs.failMoveTo = backup;
  expect(() => saveStateNow(state())).toThrow('simulated move failure');
  expect(await loadState()).toEqual(state(a));
 });
 it('reads a valid legacy backup when the primary is corrupt', async () => {
  const a = newDraft();
  fs.files.set(primary, 'broken');
  fs.files.set(backup, JSON.stringify(state(a)));
  expect(await loadState()).toEqual(state(a));
 });
});


describe('account-bound draft visibility', () => {
 const a = { subject: 'a', organizationId: 'org-a' };
 const b = { subject: 'b', organizationId: 'org-a' };
 const otherOrg = { subject: 'a', organizationId: 'org-b' };
 it('hides locally owned drafts at logout and for another member or tenant', () => {
  const draft = { ...newDraft(), localOwner: a };
  expect(canViewDraft(draft, a)).toBe(true);
  for (const owner of [null, b, otherOrg]) expect(canViewDraft(draft, owner)).toBe(false);
 });
 it('hides remotely bound drafts even if they originated anonymously', () => {
  const draft = { ...newDraft(), remoteOwner: a, remoteCaseId: 'case-a' };
  expect(canViewDraft(draft, a)).toBe(true);
  for (const owner of [null, b, otherOrg]) expect(canViewDraft(draft, owner)).toBe(false);
 });
 it('quarantines remote legacy checkpoints without a known owner', () => {
  for (const checkpoint of [{ remoteCaseId: 'case' }, { remotePropertyId: 'property' }, { uploaded: ['uri'] }, { videoUploads: { uri: 'upload' } }]) {
   expect(canViewDraft({ ...newDraft(), ...checkpoint }, a)).toBe(false);
   expect(canViewDraft({ ...newDraft(), ...checkpoint }, null)).toBe(false);
  }
 });
 it('does not delete anonymous drafts or assign them to an account', () => {
  const draft = newDraft();
  expect(canViewDraft(draft, null)).toBe(true);
  expect(canViewDraft(draft, a)).toBe(true);
  expect(draft.remoteOwner).toBeUndefined();
 });
});


describe('individual evidence removal', () => {
 const photo = (uri: string) => ({ uri, name: 'photo.jpg', mimeType: 'image/jpeg', takenAt: '2026-11-24T00:00:00Z' });
 it('removes only a reference present in the current draft and preserves shared references', () => {
  const p = photo('/documents/ape/media/a/photo.jpg');
  const draft = { ...newDraft(), photos: { wall: [p], window: [p] } };
  expect(removeDraftPhoto(draft, 'missing', p.uri)).toBeNull();
  expect(removeDraftPhoto(draft, 'wall', 'stale-uri')).toBeNull();
  const result = removeDraftPhoto(draft, 'wall', p.uri)!;
  expect(result.draft.photos.wall).toEqual([]);
  expect(result.draft.photos.window).toEqual([p]);
  expect(result.unreferenced).toBe(false);
  expect(removeDraftPhoto(result.draft, 'window', p.uri)?.unreferenced).toBe(true);
 });
 it('commits removal in both snapshots before unlinking the file', async () => {
  const draft = newDraft();
  const uri = '/documents/ape/media/' + draft.id + '/photo.jpg';
  const p = photo(uri);
  const current = { ...draft, photos: { wall: [p] } };
  fs.files.set(uri, 'image');
  saveStateNow(state(current));
  const result = removeDraftPhoto(current, 'wall', uri)!;
  saveStateNow(state(result.draft));
  deleteDraftPhotoFile(draft.id, p);
  expect(fs.files.has(uri)).toBe(false);
  fs.files.set(primary, 'corrupt');
  expect((await loadState()).drafts[0].photos.wall).toEqual([]);
 });
 it('does not unlink another draft file, a nested path or the state snapshot', () => {
  const foreign = ['/documents/ape/media/b/photo.jpg', '/documents/ape/media/a/../b/photo.jpg', primary];
  for (const uri of foreign) { fs.files.set(uri, 'keep'); deleteDraftPhotoFile('a', photo(uri)); expect(fs.files.get(uri)).toBe('keep'); }
  const valid = '/documents/ape/media/a/photo.jpg';
  fs.files.set(valid, 'remove');
  deleteDraftPhotoFile('a', photo(valid));
  expect(fs.files.has(valid)).toBe(false);
 });
});


describe('account-scoped certifier profiles', () => {
 const a = { subject: 'a', organizationId: 'org-a' };
 const b = { subject: 'b', organizationId: 'org-a' };
 const otherOrg = { subject: 'a', organizationId: 'org-b' };
 const profile = (email: string): ProProfile => ({
  submittedAt: '2026-11-24T00:00:00Z', status: 'in_verifica',
  data: { firstName: 'Test', lastName: 'Synthetic', email, phone: '0000000000',
   vatNumber: '00000000000', taxCode: '00000000000', profession: 'architetto',
   professionalOrder: 'Test', orderNumber: '0', region: 'Emilia-Romagna', saceNumber: '00000',
   provinces: ['BO'], maxMonthlyJobs: 10, acceptsTerms: true, declaresAccreditation: true },
 });
 it('does not expose the profile to another subject, organization or logout', () => {
  const p = profile('a@example.test');
  const s = storePro(state(), a, false, p);
  expect(visiblePro(s, a, false)).toEqual(p);
  for (const owner of [b, otherOrg, null]) expect(visiblePro(s, owner, false)).toBeUndefined();
 });
 it('retains each authorized profile across account switches and replaces only its own entry', async () => {
  const pa = profile('a@example.test'), pb = profile('b@example.test');
  let s = storePro(storePro(state(), a, false, pa), b, false, pb);
  s = storePro(s, a, false, { ...pa, status: 'inviata_al_server' });
  saveStateNow(s);
  const loaded = await loadState();
  expect(visiblePro(loaded, a, false)?.status).toBe('inviata_al_server');
  expect(visiblePro(loaded, b, false)).toEqual(pb);
  expect(loaded.proProfiles).toHaveLength(2);
 });
 it('quarantines an unattributed legacy profile without deleting it', () => {
  const legacy = profile('legacy@example.test');
  const s = { ...state(), pro: legacy };
  expect(visiblePro(s, a, false)).toBeUndefined();
  expect(visiblePro(s, null, true)).toBeUndefined();
  expect(storePro(s, a, false, profile('a@example.test')).pro).toEqual(legacy);
 });
 it('does not persist anonymous online applications and isolates offline demo profiles', () => {
  const p = profile('demo@example.test');
  const s = state();
  expect(storePro(s, null, false, p)).toBe(s);
  const demo = storePro(s, null, true, p);
  expect(visiblePro(demo, null, true)).toEqual(p);
  expect(visiblePro(demo, null, false)).toBeUndefined();
  expect(visiblePro(demo, a, true)).toBeUndefined();
 });
 it('stores only subject and organization, not extra session fields', () => {
  const owner = { ...a, accessToken: 'synthetic-token', refreshToken: 'synthetic-refresh' };
  const s = storePro(state(), owner, false, profile('a@example.test'));
  expect(s.proProfiles?.[0].owner).toEqual(a);
  expect(JSON.stringify(s)).not.toContain('synthetic-token');
  expect(JSON.stringify(s)).not.toContain('synthetic-refresh');
 });
});
