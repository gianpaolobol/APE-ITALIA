import { beforeEach, describe, expect, it, vi } from 'vitest';

const fs = vi.hoisted(() => ({ files: new Map<string, string>(), dirs: new Set<string>(), failMoveTo: '', failDeleteAt: '', failReadAt: '' }));
vi.mock('expo-file-system', () => {
 class Directory {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get exists() { return fs.dirs.has(this.uri); }
  create() { fs.dirs.add(this.uri); }
  delete() {
   if (this.uri === fs.failDeleteAt) throw new Error('simulated directory delete failure');
   for (const key of fs.files.keys()) if (key.startsWith(this.uri + '/')) fs.files.delete(key);
   for (const key of fs.dirs) if (key === this.uri || key.startsWith(this.uri + '/')) fs.dirs.delete(key);
  }
 }
 class File {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get exists() { return fs.files.has(this.uri); }
  create() { fs.files.set(this.uri, ''); }
  write(data: string) { fs.files.set(this.uri, data); }
  async text() { return this.textSync(); }
  textSync() {
   if (this.uri === fs.failReadAt) throw new Error('simulated protected file');
   return fs.files.get(this.uri) ?? '';
  }
  delete() { if (this.uri === fs.failDeleteAt) throw new Error('simulated delete failure'); fs.files.delete(this.uri); }
  move(dest: File) {
   if (dest.uri === fs.failMoveTo) throw new Error('simulated move failure');
   if (!this.exists || dest.exists) throw new Error('invalid move');
   fs.files.set(dest.uri, fs.files.get(this.uri)!); fs.files.delete(this.uri); this.uri = dest.uri;
  }
 }
 return { Directory, File, Paths: { document: '/documents' } };
});

const secure = vi.hoisted(() => ({ raw: null as string | null, failWrite: false, failRandom: false, writes: 0 }));
vi.mock('expo-secure-store', () => ({
 WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
 getItemAsync: async () => secure.raw,
 setItemAsync: async (_key: string, value: string) => {
  if (secure.failWrite) throw new Error('simulated Keychain write failure');
  secure.raw = value;
  secure.writes++;
 },
}));
vi.mock('expo-crypto', () => ({
 getRandomValues: (a: Uint8Array) => {
  if (secure.failRandom) throw new Error('simulated RNG unavailable');
  return globalThis.crypto.getRandomValues(a);
 },
}));

import { loadState, newDraft, saveStateNow, type AppState } from './drafts';

const primary = '/documents/ape/state.json', backup = '/documents/ape/state.bak.json';
const marker = '/documents/ape/state.encrypted';
const state = (...drafts: AppState['drafts']): AppState => ({ version: 1, drafts });
const envelope = /^APE-AEAD:1:[0-9a-f]{48}:[0-9a-f]+$/;
const corrupt = (value: string) => value.slice(0, -1) + (value.endsWith('0') ? '1' : '0');

beforeEach(() => {
 fs.files.clear(); fs.dirs.clear(); fs.failMoveTo = ''; fs.failDeleteAt = ''; fs.failReadAt = '';
 secure.raw = null; secure.failWrite = false; secure.failRandom = false; secure.writes = 0;
});

describe('authenticated archives and migration (real AEAD, mocked native services)', () => {
 it('initializes one device-local key and writes authenticated copies with distinct nonces on later saves', async () => {
  expect(await loadState()).toEqual(state());
  const d = { ...newDraft(), answers: { name: 'Via dell’Unità 🏠 à漢字', quote: '\\u1234', surrogate: '\ud800' } };
  const first = fs.files.get(primary)!;
  saveStateNow(state(d));
  const sealed = fs.files.get(primary)!;
  expect(sealed).toMatch(envelope);
  expect(sealed.split(':')[2]).not.toBe(first.split(':')[2]);
  expect(sealed).toBe(fs.files.get(backup));
  expect(sealed).not.toContain(d.id);
  expect(sealed).not.toContain('Unità');
  expect(fs.files.has(marker)).toBe(true);
  expect(JSON.parse(secure.raw!).mode).toBe('active');
  expect(secure.writes).toBe(2);
  expect(await loadState()).toEqual(state(d));
  expect(secure.writes).toBe(2);
 });

 it('migrates the newest committed legacy generation and removes plaintext staging', async () => {
  const a = newDraft(), b = { ...newDraft(), answers: { address: 'Indirizzo sintetico' } };
  fs.files.set(primary, JSON.stringify({ ...state(a), storageGeneration: 7 }));
  fs.files.set(backup, JSON.stringify({ ...state(b), storageGeneration: 8 }));
  fs.files.set('/documents/ape/state.tmp.json', JSON.stringify(state(a)));
  expect(await loadState()).toEqual(state(b));
  expect(fs.files.get(primary)).toMatch(envelope);
  expect(fs.files.get(backup)).toBe(fs.files.get(primary));
  expect(fs.files.has('/documents/ape/state.tmp.json')).toBe(false);
  expect([...fs.files.values()].every(v => !v.includes('Indirizzo sintetico'))).toBe(true);
 });

 it('resumes interrupted migration from the authenticated committed copy rather than a legacy replacement', async () => {
  const a = newDraft(), b = newDraft();
  fs.files.set(primary, JSON.stringify(state(a)));
  fs.files.set(backup, JSON.stringify(state(a)));
  fs.failDeleteAt = primary;
  await expect(loadState()).rejects.toThrow('simulated delete failure');
  expect(JSON.parse(secure.raw!).mode).toBe('pending');
  expect(fs.files.get(backup)).toMatch(envelope);
  const originalKey = JSON.parse(secure.raw!).key;
  fs.files.set(primary, JSON.stringify({ ...state(b), storageGeneration: 9999 }));
  fs.failDeleteAt = '';
  expect(await loadState()).toEqual(state(a));
  expect(JSON.parse(secure.raw!).key).toBe(originalKey);
  expect(JSON.parse(secure.raw!).mode).toBe('active');
  expect(fs.files.get(primary)).toBe(fs.files.get(backup));
 });

 it('never falls back to a legacy copy when a committed encrypted migration copy fails authentication', async () => {
  fs.files.set(primary, JSON.stringify(state(newDraft())));
  fs.failDeleteAt = primary;
  await expect(loadState()).rejects.toThrow('simulated delete failure');
  fs.failDeleteAt = '';
  fs.files.set(backup, corrupt(fs.files.get(backup)!));
  const before = [...fs.files];
  await expect(loadState()).rejects.toThrow('Local snapshots temporarily unavailable');
  expect([...fs.files]).toEqual(before);
  expect(JSON.parse(secure.raw!).mode).toBe('pending');
 });

 it('rejects a plaintext downgrade after activation, preserving both files', async () => {
  await loadState();
  const plain = JSON.stringify(state(newDraft()));
  fs.files.set(primary, plain); fs.files.set(backup, plain);
  const before = [...fs.files];
  await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
  expect(() => saveStateNow(state())).toThrow('Local snapshots could not be recovered');
  expect([...fs.files]).toEqual(before);
 });

 it('does not regenerate a lost key for existing archives or for a surviving marker', async () => {
  await loadState();
  saveStateNow(state(newDraft()));
  secure.raw = null;
  const before = [...fs.files], writes = secure.writes;
  await expect(loadState()).rejects.toThrow('Local archive key unavailable');
  expect(secure.writes).toBe(writes);
  expect([...fs.files]).toEqual(before);
  fs.files.delete(primary); fs.files.delete(backup);
  await expect(loadState()).rejects.toThrow('Local archive key unavailable');
  expect(secure.writes).toBe(writes);
 });

 it('does not accept a different valid-looking key or overwrite unreadable encrypted data', async () => {
  await loadState();
  saveStateNow(state(newDraft()));
  const k = JSON.parse(secure.raw!);
  k.key = k.key.startsWith('0') ? '1'.repeat(64) : '0'.repeat(64);
  secure.raw = JSON.stringify(k);
  const before = [...fs.files];
  await expect(loadState()).rejects.toThrow('Local snapshots could not be recovered');
  expect([...fs.files]).toEqual(before);
 });

 it('recovers only a valid authenticated backup after a corrupted primary', async () => {
  await loadState();
  const a = state(newDraft());
  saveStateNow(a);
  fs.files.set(primary, corrupt(fs.files.get(primary)!));
  expect(await loadState()).toEqual(a);
  saveStateNow(a);
  expect(fs.files.get(primary)).toBe(fs.files.get(backup));
 });

 it('never touches a legacy snapshot when native key persistence or entropy is unavailable', async () => {
  fs.files.set(primary, JSON.stringify(state(newDraft())));
  const before = [...fs.files];
  secure.failWrite = true;
  await expect(loadState()).rejects.toThrow('simulated Keychain write failure');
  expect([...fs.files]).toEqual(before);
  secure.failWrite = false; secure.failRandom = true;
  await expect(loadState()).rejects.toThrow('simulated RNG unavailable');
  expect([...fs.files]).toEqual(before);
 });

 it('serializes simultaneous archive initialization and retains the same key', async () => {
  const [a, b] = await Promise.all([loadState(), loadState()]);
  expect(a).toEqual(b);
  expect(secure.writes).toBe(2);
  expect(JSON.parse(secure.raw!).mode).toBe('active');
 });
});
