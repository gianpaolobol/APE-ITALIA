import { describe, expect, it } from 'vitest';
import { MEDIA_BLOCK, MEDIA_MAX, openMedia, sealMedia, sealedMediaSize } from './media-envelope';

const key = new Uint8Array(32).fill(17);
const identity = 'draft-1/photo.jpg';
const context = { key, identity };
const prefix = (n: number) => new Uint8Array(n).fill(29);
function join(parts: Uint8Array[]) {
 const result = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
 let i = 0;
 for (const part of parts) { result.set(part, i); i += part.length; }
 return result;
}
function source(bytes: Uint8Array) {
 let offset = 0;
 const reads: number[] = [];
 return { size: bytes.length, reads, read: (n: number) => {
  reads.push(n);
  const part = bytes.slice(offset, offset + n);
  offset += part.length;
  return part;
 } };
}
function sink() {
 const parts: Uint8Array[] = [];
 return { parts, write: (part: Uint8Array) => { parts.push(part.slice()); }, bytes: () => join(parts) };
}
async function sealed(plain: Uint8Array) {
 const result = sink();
 await sealMedia(source(plain), result, context, prefix);
 return result.bytes();
}
function flip(data: Uint8Array, index: number) {
 const copy = data.slice();
 copy[index] ^= 1;
 return copy;
}

describe('bounded media envelope', () => {
 it('round-trips binary data with a partial final block and bounded reads', async () => {
  const data = Uint8Array.from({ length: MEDIA_BLOCK + 17 }, (_, i) => i % 251);
  const input = source(data), encrypted = sink();
  await sealMedia(input, encrypted, context, prefix);
  expect(input.reads).toEqual([MEDIA_BLOCK, 17]);
  const bytes = encrypted.bytes();
  expect(bytes.length).toBe(sealedMediaSize(data.length));
  const input2 = source(bytes), output = sink();
  await openMedia(input2, output, context);
  expect(input2.reads).toEqual([28, 16, MEDIA_BLOCK + 16, 17 + 16]);
  expect(output.parts).toHaveLength(2);
  expect(output.bytes()).toEqual(data);
 });
 it('uses the supplied fresh random prefix on every encryption', async () => {
  const data = Uint8Array.of(1, 2, 3);
  const a = sink(), b = sink();
  await sealMedia(source(data), a, context, n => new Uint8Array(n).fill(1));
  await sealMedia(source(data), b, context, n => new Uint8Array(n).fill(2));
  expect(a.bytes()).not.toEqual(b.bytes());
  expect(a.bytes().slice(8, 24)).not.toEqual(b.bytes().slice(8, 24));
 });
 it('rejects wrong media identity or key without writing plaintext', async () => {
  const bytes = await sealed(Uint8Array.of(9, 0, 255));
  for (const c of [{ ...context, identity: 'draft-2/photo.jpg' },
   { ...context, key: new Uint8Array(32).fill(18) }]) {
   const output = sink();
   await expect(openMedia(source(bytes), output, c)).rejects.toThrow();
   expect(output.parts).toHaveLength(0);
  }
 });
 it('authenticates the header and rejects unknown format, changed size and tag', async () => {
  const bytes = await sealed(Uint8Array.of(1, 2, 3));
  for (const i of [0, 8, 27, 28, 43]) {
   const output = sink();
   await expect(openMedia(source(flip(bytes, i)), output, context)).rejects.toThrow();
   expect(output.parts).toHaveLength(0);
  }
 });
 it('rejects truncated, appended, or altered first block', async () => {
  const bytes = await sealed(Uint8Array.of(1, 2, 3));
  for (const altered of [bytes.slice(0, -1), join([bytes, Uint8Array.of(0)]), flip(bytes, 44), flip(bytes, bytes.length - 1)]) {
   const output = sink();
   await expect(openMedia(source(altered), output, context)).rejects.toThrow();
   expect(output.parts).toHaveLength(0);
  }
 });
 it('rejects reordered blocks of equal length', async () => {
  const data = new Uint8Array(2 * MEDIA_BLOCK);
  data.fill(1, 0, MEDIA_BLOCK); data.fill(2, MEDIA_BLOCK);
  const bytes = await sealed(data), boundary = 44 + MEDIA_BLOCK + 16;
  const reordered = join([bytes.slice(0, 44), bytes.slice(boundary), bytes.slice(44, boundary)]);
  const output = sink();
  await expect(openMedia(source(reordered), output, context)).rejects.toThrow();
  expect(output.parts).toHaveLength(0);
 });
 it('rejects a changed last block even when an earlier block reached staging', async () => {
  const data = new Uint8Array(MEDIA_BLOCK + 1).fill(7);
  const bytes = await sealed(data), output = sink();
  await expect(openMedia(source(flip(bytes, bytes.length - 1)), output, context)).rejects.toThrow();
  // The caller must destroy this staging sink, not publish its valid prefix.
  expect(output.parts.map(x => x.length)).toEqual([MEDIA_BLOCK]);
 });
 it('rejects invalid size, identity and key before source reads or sink writes', async () => {
  for (const size of [0, -1, Infinity, 1.5, MEDIA_MAX + 1]) {
   const output = sink();
   const input = { size, read: () => { throw new Error('unexpected read'); } };
   await expect(sealMedia(input, output, context, prefix)).rejects.toThrow('Invalid media length');
   expect(output.parts).toHaveLength(0);
  }
  for (const c of [{ ...context, identity: '../photo.jpg' }, { ...context, key: new Uint8Array(31) }]) {
   const output = sink();
   await expect(sealMedia(source(Uint8Array.of(1)), output, c, prefix)).rejects.toThrow();
   expect(output.parts).toHaveLength(0);
  }
 });
 it('rejects a short source read and a source whose length changes', async () => {
  const output = sink();
  await expect(sealMedia({ size: 2, read: () => Uint8Array.of(1) }, output, context, prefix)).rejects.toThrow('Short media read');
  const input = { size: 1, read: () => { input.size = 2; return Uint8Array.of(1); } };
  await expect(sealMedia(input, sink(), context, prefix)).rejects.toThrow('Media source length changed');
 });
 it('stops on a session boundary before writing plaintext obtained after an asynchronous read', async () => {
  const bytes = await sealed(Uint8Array.of(1, 2, 3)), input = source(bytes), output = sink();
  let active = true;
  const guardedSource = { size: bytes.length, read: async (n: number) => {
   const part = input.read(n);
   if (input.reads.length === 3) active = false;
   return part;
  } };
  await expect(openMedia(guardedSource, output, { ...context, guard: () => {
   if (!active) throw new Error('Session changed');
  } })).rejects.toThrow('Session changed');
  expect(output.parts).toHaveLength(0);
 });
});
