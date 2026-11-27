import { describe, expect, it } from 'vitest';
import { createMediaKeyManager } from './media-key';

function fixture() {
 let record: string | null = null, writes = 0, generated = 0;
 let evidence = false, active = true;
 const provider = {
  read: async () => record,
  write: async (value: string) => { writes++; record = value; },
  random: async (n: number) => { generated++; return new Uint8Array(n).fill(generated); },
 };
 const access = {
  hasEncryptedEvidence: async () => evidence,
  guard: () => { if (!active) throw new Error('Session changed'); },
 };
 return {
  provider, access, manager: createMediaKeyManager(provider),
  setRecord: (value: string | null) => { record = value; },
  setEvidence: () => { evidence = true; },
  invalidate: () => { active = false; },
  counts: () => ({ writes, generated }),
 };
}
describe('media key lifecycle', () => {
 it('serializes concurrent creation and reuses the confirmed key after restart', async () => {
  const f = fixture();
  const read = (key: Uint8Array) => Array.from(key);
  const keys = await Promise.all(Array.from({ length: 12 }, () => f.manager.withKey(f.access, read)));
  expect(keys.every(k => k.length === 32 && k.every(b => b === 1))).toBe(true);
  expect(await createMediaKeyManager(f.provider).withKey(f.access, read)).toEqual(keys[0]);
  expect(f.counts()).toEqual({ writes: 1, generated: 1 });
 });
 it('never creates a key when encrypted evidence exists', async () => {
  const f = fixture(); f.setEvidence();
  await expect(f.manager.withKey(f.access, () => {})).rejects.toThrow('Media key unavailable');
  expect(f.counts()).toEqual({ writes: 0, generated: 0 });
 });
 it('fails closed when the evidence scan is unavailable', async () => {
  const f = fixture();
  await expect(f.manager.withKey({ ...f.access, hasEncryptedEvidence: () => { throw new Error('Scan failed'); } },
   () => {})).rejects.toThrow('Scan failed');
  expect(f.counts()).toEqual({ writes: 0, generated: 0 });
 });
 it('never overwrites an invalid stored key', async () => {
  const f = fixture(); f.setRecord('{"version":2,"key":"bad"}');
  await expect(f.manager.withKey(f.access, () => {})).rejects.toThrow('Invalid media key record');
  expect(f.counts()).toEqual({ writes: 0, generated: 0 });
 });
 it('rejects missing key after previously observing a valid key', async () => {
  const f = fixture();
  await f.manager.withKey(f.access, () => {});
  f.setRecord(null);
  await expect(f.manager.withKey(f.access, () => {})).rejects.toThrow('Media key unavailable');
  expect(f.counts()).toEqual({ writes: 1, generated: 1 });
 });
 it('does not expose a key after an unconfirmed write or silently retry creation', async () => {
  const f = fixture();
  const manager = createMediaKeyManager({ ...f.provider, write: async () => {} });
  let used = false;
  await expect(manager.withKey(f.access, () => { used = true; })).rejects.toThrow('Media key not confirmed');
  await expect(manager.withKey(f.access, () => { used = true; })).rejects.toThrow('Media key unavailable');
  expect(used).toBe(false);
  expect(f.counts().generated).toBe(1);
 });
 it('detects evidence appearing during random generation', async () => {
  const f = fixture();
  const manager = createMediaKeyManager({ ...f.provider, random: async n => {
   f.setEvidence(); return new Uint8Array(n).fill(1);
  } });
  await expect(manager.withKey(f.access, () => {})).rejects.toThrow('Media key unavailable');
  expect(f.counts().writes).toBe(0);
 });
 it('never invokes caller after session changes while reading native storage', async () => {
  const f = fixture();
  const manager = createMediaKeyManager({ ...f.provider, read: async () => {
   f.invalidate(); return null;
  } });
  let used = false;
  await expect(manager.withKey(f.access, () => { used = true; })).rejects.toThrow('Session changed');
  expect(used).toBe(false);
  expect(f.counts().writes).toBe(0);
 });
 it('clears the callback buffer even when work fails or session changes', async () => {
  const f = fixture();
  let held: Uint8Array | undefined;
  await expect(f.manager.withKey(f.access, key => { held = key; throw new Error('IO failed'); })).rejects.toThrow('IO failed');
  expect(held?.every(b => b === 0)).toBe(true);
  await expect(f.manager.withKey(f.access, key => { held = key; f.invalidate(); })).rejects.toThrow('Session changed');
  expect(held?.every(b => b === 0)).toBe(true);
 });
});
