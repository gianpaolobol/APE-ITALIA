/** [Codex] Device-local media key lifecycle. Not connected to capture yet.
 * The evidence scan must include every durable envelope, including staging,
 * migration journals and orphan files. An uncertain scan must throw.
 * One singleton per JS runtime; do not run another native writer concurrently.
 */
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils';

type IO<T> = T | Promise<T>;
type Provider = {
 read: () => IO<string | null>;
 write: (record: string) => IO<void>;
 random: (length: number) => IO<Uint8Array>;
};
type Access = {
 hasEncryptedEvidence: () => IO<boolean>;
 guard: () => void;
};

function decode(raw: string): Uint8Array {
 const record = JSON.parse(raw) as { version?: unknown; key?: unknown } | null;
 if (!record || record.version !== 1 || typeof record.key !== 'string' ||
     !/^[0-9a-f]{64}$/.test(record.key)) throw new Error('Invalid media key record');
 return hexToBytes(record.key);
}

export function createMediaKeyManager(provider: Provider) {
 let tail: Promise<void> = Promise.resolve();
 let observedKey = false;
 async function load(access: Access): Promise<Uint8Array> {
  access.guard();
  const raw = await provider.read();
  access.guard();
  if (raw !== null) {
   observedKey = true;
   return decode(raw);
  }
  if (observedKey || await access.hasEncryptedEvidence()) throw new Error('Media key unavailable');
  access.guard();
  // Serialize creation in this runtime; scan again after random generation.
  const key = await provider.random(32);
  try {
   access.guard();
   if (key.length !== 32) throw new Error('Invalid media randomness');
   const existing = await provider.read();
   access.guard();
   if (existing !== null) {
    observedKey = true;
    return decode(existing);
   }
   if (await access.hasEncryptedEvidence()) throw new Error('Media key unavailable');
   access.guard();
   const record = JSON.stringify({ version: 1, key: bytesToHex(key) });
   // Once a write was attempted, never silently generate another key in this
   // runtime: the first write may have succeeded despite an I/O exception.
   observedKey = true;
   await provider.write(record);
   access.guard();
   const confirmed = await provider.read();
   access.guard();
   if (confirmed !== record) throw new Error('Media key not confirmed');
   return decode(confirmed);
  } finally { key.fill(0); }
 }
 function acquire(access: Access): Promise<Uint8Array> {
  const pending = tail.then(() => load(access));
  tail = pending.then(() => undefined, () => undefined);
  return pending;
 }
 return {
  /** The callback must not retain or copy key material. Cleanup is best effort
   * in JS; native storage and cryptographic library internals are not zeroized
   * by this function. Guard the actual asynchronous IO separately. */
  async withKey<T>(access: Access, use: (key: Uint8Array) => IO<T>): Promise<T> {
   const key = await acquire(access);
   try {
    access.guard();
    const value = await use(key);
    access.guard();
    return value;
   } finally { key.fill(0); }
  },
 };
}

const SLOT = 'ape.media.key.v1'; // separate from ape.snapshot.key.v1
export const nativeMediaKeys = createMediaKeyManager({
 async read() {
  const store = await import('expo-secure-store');
  return store.getItemAsync(SLOT, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
 },
 async write(record) {
  const store = await import('expo-secure-store');
  await store.setItemAsync(SLOT, record, { keychainAccessible: store.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
 },
 async random(length) {
  const crypto = await import('expo-crypto');
  return crypto.getRandomValues(new Uint8Array(length));
 },
});
