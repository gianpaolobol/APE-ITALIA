/** [Codex] Versioned bounded media envelope, not yet wired to user-facing storage.
 * XChaCha20-Poly1305 from the existing pinned @noble/ciphers dependency.
 * Callers MUST provide an independently generated 32-byte media key, a native
 * CSPRNG, exact-size sources, an exclusive staging sink, and session guards.
 * Never publish a sink until the entire operation succeeds; discard it on error.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha';

export const MEDIA_BLOCK = 1024 * 1024;
export const MEDIA_MAX = 300 * 1024 * 1024;
const TAG = 16;
const MAGIC = Uint8Array.from([65, 80, 69, 77, 69, 68, 48, 49]); // APEMED01
const HEADER = 28; // magic(8), random nonce prefix(16), plaintext length u32 BE
const DOMAIN = Uint8Array.from([97,112,101,46,109,101,100,105,97,46,118,49,0]);
type IO<T> = T | Promise<T>;
export type MediaSource = { size: number; read: (length: number) => IO<Uint8Array> };
export type MediaSink = { write: (bytes: Uint8Array) => IO<void> };
type Context = { key: Uint8Array; identity: string; guard?: () => void };

function concat(...parts: Uint8Array[]): Uint8Array {
 const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
 let offset = 0;
 for (const p of parts) { out.set(p, offset); offset += p.length; }
 return out;
}
function u32(n: number): Uint8Array {
 const bytes = new Uint8Array(4);
 new DataView(bytes.buffer).setUint32(0, n, false);
 return bytes;
}
function sizeCheck(n: number): void {
 if (!Number.isSafeInteger(n) || n < 1 || n > MEDIA_MAX) throw new Error('Invalid media length');
}
function contextBytes(c: Context): Uint8Array {
 if (c.key.length !== 32) throw new Error('Invalid media key');
 // Stable app-owned draft ID / filename, never an absolute sandbox path.
 if (!/^[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,12}$/.test(c.identity)) {
  throw new Error('Invalid media identity');
 }
 return concat(DOMAIN, Uint8Array.from(c.identity, ch => ch.charCodeAt(0)), Uint8Array.of(0));
}
function nonce(header: Uint8Array, index: number): Uint8Array {
 // 128 random bits per independently sealed file; header uses index zero,
 // records 1..300. Never re-use the random prefix when rewriting a file.
 return concat(header.subarray(8, 24), new Uint8Array(4), u32(index));
}
function cipher(c: Context, context: Uint8Array, header: Uint8Array, index: number) {
 return xchacha20poly1305(c.key, nonce(header, index), concat(context, header, u32(index)));
}
export function sealedMediaSize(plainSize: number): number {
 sizeCheck(plainSize);
 return HEADER + TAG + plainSize + Math.ceil(plainSize / MEDIA_BLOCK) * TAG;
}
async function readExact(source: MediaSource, n: number, guard?: () => void): Promise<Uint8Array> {
 guard?.();
 const bytes = await source.read(n);
 guard?.();
 if (bytes.length !== n) throw new Error('Short media read');
 return bytes;
}
async function writeChecked(sink: MediaSink, bytes: Uint8Array, guard?: () => void): Promise<void> {
 guard?.();
 await sink.write(bytes);
 guard?.();
}

/** Encrypt only into a new, private staging destination, never in-place. */
export async function sealMedia(source: MediaSource, sink: MediaSink, c: Context,
 randomBytes: (length: number) => Uint8Array): Promise<void> {
 const context = contextBytes(c), length = source.size;
 sizeCheck(length);
 c.guard?.();
 const prefix = randomBytes(16);
 if (prefix.length !== 16) throw new Error('Invalid media randomness');
 const header = concat(MAGIC, prefix, u32(length));
 const headerTag = cipher(c, context, header, 0).encrypt(new Uint8Array(0));
 await writeChecked(sink, concat(header, headerTag), c.guard);
 let remaining = length;
 for (let i = 1; remaining > 0; i++) {
  const n = Math.min(remaining, MEDIA_BLOCK);
  const plain = await readExact(source, n, c.guard);
  const sealed = cipher(c, context, header, i).encrypt(plain);
  await writeChecked(sink, sealed, c.guard);
  remaining -= n;
 }
 if (source.size !== length) throw new Error('Media source length changed');
 c.guard?.();
}

/** Authenticate header before output, and each block before writing it.
 * On any failure the caller MUST remove the entire unpublished staging sink.
 * No plaintext fallback, including for unsupported versions.
 */
export async function openMedia(source: MediaSource, sink: MediaSink, c: Context): Promise<void> {
 const context = contextBytes(c), length = source.size;
 if (!Number.isSafeInteger(length) || length < sealedMediaSize(1) || length > sealedMediaSize(MEDIA_MAX)) {
  throw new Error('Invalid sealed media length');
 }
 const header = await readExact(source, HEADER, c.guard);
 if (!MAGIC.every((b, i) => header[i] === b)) throw new Error('Unsupported media envelope');
 const plainSize = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(24, false);
 if (sealedMediaSize(plainSize) !== length) throw new Error('Invalid sealed media length');
 const headerTag = await readExact(source, TAG, c.guard);
 cipher(c, context, header, 0).decrypt(headerTag);
 let remaining = plainSize;
 for (let i = 1; remaining > 0; i++) {
  const n = Math.min(remaining, MEDIA_BLOCK);
  const sealed = await readExact(source, n + TAG, c.guard);
  const plain = cipher(c, context, header, i).decrypt(sealed);
  await writeChecked(sink, plain, c.guard);
  remaining -= n;
 }
 if (source.size !== length) throw new Error('Media source length changed');
 c.guard?.();
}
