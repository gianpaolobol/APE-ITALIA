import { beforeEach, describe, expect, it, vi } from 'vitest';
const fs = vi.hoisted(() => ({ files: new Set<string>(), dirs: new Set<string>(), failList: false }));
vi.mock('expo-file-system', () => {
 class Directory {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get name() { return this.uri.split('/').pop()!; }
  get exists() { return fs.dirs.has(this.uri); }
  create() { fs.dirs.add(this.uri); }
  delete() { fs.dirs.delete(this.uri); for (const f of fs.files) if (f.startsWith(this.uri + '/')) fs.files.delete(f); }
  list() {
   if (fs.failList) throw new Error('locked');
   const immediate = (p: string) => p.startsWith(this.uri + '/') && !p.slice(this.uri.length + 1).includes('/');
   return [...Array.from(fs.dirs).filter(immediate).map(p => new Directory(p)),
    ...Array.from(fs.files).filter(immediate).map(p => new File(p))];
  }
 }
 class File {
  uri: string;
  constructor(parent: string | { uri: string }, ...parts: string[]) { this.uri = [typeof parent === 'string' ? parent : parent.uri, ...parts].join('/'); }
  get name() { return this.uri.split('/').pop()!; }
  get exists() { return fs.files.has(this.uri); }
  create() { if (this.exists) throw new Error('exists'); fs.files.add(this.uri); }
 }
 return { Directory, File, Paths: { document: '/doc', cache: '/cache' } };
});
import { createCacheRecovery, hasNativeEncryptedMedia, markNativeEncryptedMedia } from './media-native-storage';
beforeEach(() => { fs.files.clear(); fs.dirs.clear(); fs.failList = false; });
describe('native media namespace', () => {
 it('clears abandoned cache once, without deleting active stages on repeated startup', () => {
  let exists = true, deletions = 0, creations = 0;
  const recover = createCacheRecovery(() => ({ get exists() { return exists; }, delete() { deletions++; exists = false; }, create() { creations++; exists = true; } }));
  recover(); recover();
  expect([deletions, creations]).toEqual([1, 1]);
 });
 it('fails closed if deletion was incomplete and permits a recovery retry', () => {
  let exists = true, fail = true;
  const recover = createCacheRecovery(() => ({ get exists() { return exists; }, delete() { if (!fail) exists = false; }, create() { exists = true; } }));
  expect(recover).toThrow('cleanup incomplete');
  fail = false; expect(recover).not.toThrow();
 });
 it('never interprets a legacy-only tree as encrypted, but detects orphan envelopes in any draft', () => {
  fs.dirs.add('/doc/ape/media'); fs.dirs.add('/doc/ape/media/old'); fs.dirs.add('/doc/ape/media/other');
  fs.files.add('/doc/ape/media/old/photo.jpg');
  expect(hasNativeEncryptedMedia()).toBe(false);
  fs.files.add('/doc/ape/media/other/orphan.apem');
  expect(hasNativeEncryptedMedia()).toBe(true);
 });
 it('retains the independent key-loss marker even with no remaining attachments', () => {
  expect(hasNativeEncryptedMedia()).toBe(false);
  markNativeEncryptedMedia(); markNativeEncryptedMedia();
  expect(fs.files.has('/doc/ape/media.encrypted.v1')).toBe(true);
  expect(hasNativeEncryptedMedia()).toBe(true);
 });
 it('resweeps after an exclusive lease boundary and retries a failed sweep', () => {
  let exists = true, fail = false, deletions = 0;
  const recover = createCacheRecovery(() => ({ get exists() { return exists; }, delete() { deletions++; if (!fail) exists = false; }, create() { exists = true; } }));
  recover(); recover(); expect(deletions).toBe(1);
  fail = true; expect(() => recover(true)).toThrow('cleanup incomplete');
  fail = false; recover(); expect(deletions).toBe(3);
  exists = false; recover(true); expect(exists).toBe(true);
 });
 it('fails closed on unreadable or unexpected archive layout', () => {
  fs.dirs.add('/doc/ape/media'); fs.failList = true;
  expect(() => hasNativeEncryptedMedia()).toThrow();
  fs.failList = false; fs.files.add('/doc/ape/media/unexpected.jpg');
  expect(() => hasNativeEncryptedMedia()).toThrow('Unexpected media archive layout');
 });
});
