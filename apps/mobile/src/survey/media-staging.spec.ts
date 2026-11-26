import { describe, expect, it } from 'vitest';
import { transformToStage } from './media-staging';

function fixture() {
 let active = true;
 function file(uri: string, bytes: number[] | null) {
  let data = bytes === null ? null : Uint8Array.from(bytes);
  const faults = { shortRead: false, shortWrite: false, close: false, delete: false, create: false };
  const counts = { opens: 0, closes: 0, deletes: 0 };
  const f = {
   uri, faults, counts,
   get exists() { return data !== null; },
   get size() { return data?.length ?? 0; },
   bytes: () => data ? Array.from(data) : null,
   create(options: { overwrite: false }) {
    if (options.overwrite !== false || data !== null || faults.create) throw new Error('Create failed');
    data = new Uint8Array(0);
   },
   delete() {
    counts.deletes++;
    if (faults.delete) throw new Error('Delete failed');
    data = null;
   },
   open() {
    if (data === null) throw new Error('Missing file');
    counts.opens++;
    let offset = 0, closed = false;
    return {
     get size() { return closed ? null : data?.length ?? null; },
     readBytes(n: number) {
      if (closed || !data) throw new Error('Closed');
      const part = data.slice(offset, offset + n - (faults.shortRead ? 1 : 0));
      offset += part.length;
      return part;
     },
     writeBytes(bytes: Uint8Array) {
      if (closed || !data) throw new Error('Closed');
      const part = faults.shortWrite ? bytes.slice(0, -1) : bytes;
      const out = new Uint8Array(Math.max(data.length, offset + part.length));
      out.set(data); out.set(part, offset);
      data = out; offset += part.length;
     },
     close() {
      counts.closes++;
      if (faults.close) throw new Error('Close failed');
      closed = true;
     },
    };
   },
  };
  return f;
 }
 const input = file('file:///private/input', [1, 2, 3, 4]);
 const stage = file('file:///private/stage', null);
 const guard = () => { if (!active) throw new Error('Session changed'); };
 const copy = async (source: { size: number; read(n: number): Promise<Uint8Array> },
  sink: { write(bytes: Uint8Array): Promise<void> }) => {
  await sink.write(await source.read(2));
  await sink.write(await source.read(2));
 };
 return { input, stage, guard, copy, invalidate: () => { active = false; } };
}
describe('bounded native media staging', () => {
 it('closes both handles and returns only a complete stage without altering source', async () => {
  const f = fixture();
  await transformToStage(f.input, f.stage, f.guard, f.copy);
  expect(f.stage.bytes()).toEqual([1, 2, 3, 4]);
  expect(f.input.bytes()).toEqual([1, 2, 3, 4]);
  expect(f.input.counts.closes).toBe(1);
  expect(f.stage.counts.closes).toBe(1);
 });
 it('refuses an existing destination or an alias without deleting either', async () => {
  const f = fixture();
  f.stage.create({ overwrite: false });
  await expect(transformToStage(f.input, f.stage, f.guard, f.copy)).rejects.toThrow('Invalid media stage');
  await expect(transformToStage(f.input, f.input, f.guard, f.copy)).rejects.toThrow('Invalid media stage');
  expect(f.stage.exists).toBe(true);
  expect(f.input.bytes()).toEqual([1, 2, 3, 4]);
  expect(f.stage.counts.deletes).toBe(0);
 });
 it('discards a stage after a transform rejects its last authenticated block', async () => {
  const f = fixture();
  await expect(transformToStage(f.input, f.stage, f.guard, async (s, t) => {
   await t.write(await s.read(2));
   throw new Error('Authentication failed');
  })).rejects.toThrow('Authentication failed');
  expect(f.stage.exists).toBe(false);
  expect(f.input.exists).toBe(true);
  expect(f.input.counts.closes).toBe(1);
  expect(f.stage.counts.closes).toBe(1);
 });
 it('detects a short native read and a short write', async () => {
  for (const fault of ['shortRead', 'shortWrite'] as const) {
   const f = fixture();
   (fault === 'shortRead' ? f.input : f.stage).faults[fault] = true;
   await expect(transformToStage(f.input, f.stage, f.guard, f.copy)).rejects.toThrow();
   expect(f.stage.exists).toBe(false);
  }
 });
 it('rejects incomplete consumption and oversized blocks', async () => {
  for (const partial of [true, false]) {
   const f = fixture();
   await expect(transformToStage(f.input, f.stage, f.guard, async (s, t) => {
    await t.write(await s.read(partial ? 2 : 2 * 1024 * 1024));
   })).rejects.toThrow();
   expect(f.stage.exists).toBe(false);
  }
 });
 it('discards partial output at a session boundary even after a successful write', async () => {
  const f = fixture();
  await expect(transformToStage(f.input, f.stage, f.guard, async (s, t) => {
   await t.write(await s.read(2));
   f.invalidate();
   await t.write(await s.read(2));
  })).rejects.toThrow('Session changed');
  expect(f.stage.exists).toBe(false);
 });
 it('closes the input if destination creation fails without deleting an uncertain file', async () => {
  const f = fixture(); f.stage.faults.create = true;
  await expect(transformToStage(f.input, f.stage, f.guard, f.copy)).rejects.toThrow('Create failed');
  expect(f.input.counts.closes).toBe(1);
  expect(f.stage.counts.deletes).toBe(0);
 });
 it('reports cleanup failure explicitly rather than returning a partial stage', async () => {
  const f = fixture(); f.stage.faults.delete = true;
  await expect(transformToStage(f.input, f.stage, f.guard, async (s, t) => {
   await t.write(await s.read(2));
   throw new Error('Authentication failed');
  })).rejects.toThrow('journal recovery required');
  expect(f.stage.exists).toBe(true);
  expect(f.input.counts.closes).toBe(1);
 });
 it('attempts both handle closures if one fails and never reports success', async () => {
  const f = fixture(); f.stage.faults.close = true;
  await expect(transformToStage(f.input, f.stage, f.guard, f.copy)).rejects.toThrow('journal recovery required');
  expect(f.input.counts.closes).toBe(1);
  expect(f.stage.counts.closes).toBeGreaterThan(0);
  expect(f.stage.exists).toBe(false);
 });
});
