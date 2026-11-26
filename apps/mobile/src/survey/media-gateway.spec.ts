import { describe, expect, it } from 'vitest';
import { createMediaGateway } from './media-gateway';
import { createMediaKeyManager } from './media-key';
import { MEDIA_BLOCK, sealedMediaSize } from './media-envelope';

function file(uri: string, initial: Uint8Array | null = null) {
 let data = initial;
 return {
  uri, get exists() { return data !== null; }, get size() { return data?.length ?? 0; },
  bytes: () => data?.slice(),
  corrupt() { if (data) data[data.length - 1] ^= 1; },
  create({ overwrite }: { overwrite: false }) {
   if (overwrite !== false || data !== null) throw new Error('Already exists');
   data = new Uint8Array();
  },
  delete() { data = null; },
  open() {
   if (!data) throw new Error('Missing');
   let offset = 0, closed = false;
   return {
    get size() { return closed ? null : data?.length ?? null; },
    readBytes(n: number) {
     if (closed || !data) throw new Error('Closed');
     const b = data.slice(offset, offset+n); offset += b.length; return b;
    },
    writeBytes(b: Uint8Array) {
     if (closed || !data) throw new Error('Closed');
     const next = new Uint8Array(Math.max(data.length, offset+b.length));
     next.set(data); next.set(b, offset); offset += b.length; data = next;
    },
    close() { closed = true; },
   };
  },
 };
}
function setup() {
 let record: string | null = null, nonce = 0, active = true, reserved = 0;
 const keyManager = createMediaKeyManager({
  read: () => record, write: value => { record = value; },
  random: n => new Uint8Array(n).fill(77),
 });
 const gateway = createMediaGateway(keyManager, n => new Uint8Array(n).fill(++nonce));
 const original = Uint8Array.from({ length: MEDIA_BLOCK + 9 }, (_, i) => i % 251);
 const input = file('file:///source', original), sealed = file('file:///durable'), temp = file('file:///temporary');
 const guard = () => { if (!active) throw new Error('Session changed'); };
 const base = { identity: 'draft123/capture.jpg', guard,
  reserve: () => { reserved++; }, hasEncryptedEvidence: () => sealed.exists };
 const encrypt = { ...base, input, stage: sealed };
 const decrypt = { ...base, input: sealed, stage: temp };
 return { gateway, original, input, sealed, temp, encrypt, decrypt,
  invalidate: () => { active = false; }, reservations: () => reserved,
  loseKey: () => { record = null; } };
}
describe('composed authenticated media pipeline', () => {
 it('round trips across block boundaries, preserving the source and removing temporary plaintext', async () => {
  const f = setup();
  await f.gateway.seal(f.encrypt);
  expect(f.sealed.size).toBe(sealedMediaSize(f.original.length));
  expect(f.input.bytes()).toEqual(f.original);
  expect(f.sealed.bytes()?.slice(0, 8)).toEqual(Uint8Array.from([65,80,69,77,69,68,48,49]));
  const length = await f.gateway.withOpened(f.decrypt, () => {
   expect(f.temp.bytes()).toEqual(f.original);
   return f.temp.size;
  });
  expect(length).toBe(f.original.length);
  expect(f.temp.exists).toBe(false);
  expect(f.sealed.exists).toBe(true);
  expect(f.reservations()).toBe(2);
 });
 it('does not write when the durable reservation fails', async () => {
  const f = setup();
  await expect(f.gateway.seal({ ...f.encrypt, reserve: () => { throw new Error('Journal failed'); } }))
   .rejects.toThrow('Journal failed');
  expect(f.sealed.exists).toBe(false);
  expect(f.input.exists).toBe(true);
 });
 it('never hands a partial plaintext to a consumer when the final tag is corrupt', async () => {
  const f = setup(); await f.gateway.seal(f.encrypt); f.sealed.corrupt();
  let called = false;
  await expect(f.gateway.withOpened(f.decrypt, () => { called = true; })).rejects.toThrow();
  expect(called).toBe(false);
  expect(f.temp.exists).toBe(false);
  expect(f.sealed.exists).toBe(true);
 });
 it('rejects a different logical identity and does not expose data', async () => {
  const f = setup(); await f.gateway.seal(f.encrypt);
  await expect(f.gateway.withOpened({ ...f.decrypt, identity: 'other/capture.jpg' }, () => {
   throw new Error('Consumer must not run');
  })).rejects.toThrow(/tag|auth/i);
  expect(f.temp.exists).toBe(false);
 });
 it('does not generate a replacement key for an existing envelope', async () => {
  const f = setup(); await f.gateway.seal(f.encrypt); f.loseKey();
  await expect(f.gateway.withOpened(f.decrypt, () => {})).rejects.toThrow('Media key unavailable');
  expect(f.temp.exists).toBe(false);
  expect(f.sealed.exists).toBe(true);
  expect(f.reservations()).toBe(1);
 });
 it('removes the temporary stage when the consumer fails or changes session', async () => {
  const f = setup(); await f.gateway.seal(f.encrypt);
  await expect(f.gateway.withOpened(f.decrypt, () => { throw new Error('Consumer failed'); }))
   .rejects.toThrow('Consumer failed');
  expect(f.temp.exists).toBe(false);
  await expect(f.gateway.withOpened(f.decrypt, () => { f.invalidate(); })).rejects.toThrow('Session changed');
  expect(f.temp.exists).toBe(false);
 });
 it('does not delete a pre-existing destination', async () => {
  const f = setup(); f.sealed.create({ overwrite: false });
  await expect(f.gateway.seal(f.encrypt)).rejects.toThrow('Invalid media stage');
  expect(f.sealed.exists).toBe(true);
  expect(f.reservations()).toBe(0);
 });
 it('does not write after a session change during reservation', async () => {
  const f = setup();
  await expect(f.gateway.seal({ ...f.encrypt, reserve: f.invalidate })).rejects.toThrow('Session changed');
  expect(f.sealed.exists).toBe(false);
  expect(f.input.exists).toBe(true);
 });
});
