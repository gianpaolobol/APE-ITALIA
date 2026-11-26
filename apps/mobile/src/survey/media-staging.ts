/** [Codex] Bounded native file staging for authenticated media transforms.
 * Independent of envelope/key modules. Caller MUST reserve an app-owned private
 * destination in its persistent cleanup journal before invoking this adapter.
 * Nothing here publishes a URI, replaces a manifest or removes the source.
 */
import type { File } from 'expo-file-system';

const MAX_IO = 1024 * 1024 + 16;
type IO<T> = T | Promise<T>;
type Handle = {
 readonly size: number | null;
 readBytes(length: number): IO<Uint8Array>;
 writeBytes(bytes: Uint8Array): IO<void>;
 close(): IO<void>;
};
type StageFile = {
 readonly uri: string;
 readonly exists: boolean;
 readonly size: number;
 open(): Handle;
 create(options: { overwrite: false }): void;
 delete(): void;
};
type Source = { readonly size: number; read(length: number): Promise<Uint8Array> };
type Sink = { write(bytes: Uint8Array): Promise<void> };
type Transform = (source: Source, sink: Sink) => Promise<void>;

function count(n: number): number {
 if (!Number.isSafeInteger(n) || n < 1 || n > MAX_IO) throw new Error('Invalid media IO block');
 return n;
}
function fileSize(n: number | null): number {
 if (n === null || !Number.isSafeInteger(n) || n < 0) throw new Error('Invalid native media size');
 return n;
}

/** The destination must be exclusive, private and journaled. The returned
 * success indicates closed handles and verified byte counts, not fsync or
 * authenticated contents: the supplied transform is responsible for AEAD.
 * Caller must keep the stage unpublished until manifest commit, and handle
 * cleanup even when create/delete/close throws or the process is killed.
 */
export async function transformToStage(input: StageFile, stage: StageFile,
 guard: () => void, transform: Transform): Promise<void> {
 guard();
 if (input.uri === stage.uri || !input.exists || stage.exists) throw new Error('Invalid media stage');
 let source: Handle | undefined, sink: Handle | undefined;
 let created = false, success = false, failure: unknown;
 try {
  source = input.open();
  const reader = source;
  const initial = fileSize(reader.size);
  if (initial === 0) throw new Error('Empty media source');
  guard();
  // Do not delete a pre-existing destination, even on create failure.
  stage.create({ overwrite: false });
  created = true;
  guard();
  sink = stage.open();
  const writer = sink;
  if (fileSize(writer.size) !== 0) throw new Error('Nonempty media stage');
  let consumed = 0, written = 0;
  await transform({
   get size() { return fileSize(reader.size); },
   async read(length) {
    guard();
    const n = count(length);
    if (consumed + n > initial) throw new Error('Media read exceeds source');
    const part = await reader.readBytes(n);
    guard();
    if (part.length !== n) throw new Error('Short native media read');
    consumed += n;
    return part;
   },
  }, {
   async write(bytes) {
    guard();
    count(bytes.length);
    await writer.writeBytes(bytes);
    guard();
    written += bytes.length;
   },
  });
  guard();
  if (consumed !== initial || fileSize(reader.size) !== initial ||
      written === 0 || fileSize(writer.size) !== written) throw new Error('Incomplete native media transform');
  await writer.close();
  sink = undefined;
  await reader.close();
  source = undefined;
  guard();
  if (!stage.exists || fileSize(stage.size) !== written) throw new Error('Incomplete media stage');
  success = true;
 } catch (error) { failure = error; }
 // Close both even if one close fails; cleanup is required even after logout.
 if (!success) {
  let cleanupFailed = false;
  for (const handle of [sink, source]) {
   if (handle) { try { await handle.close(); } catch { cleanupFailed = true; } }
  }
  if (created) {
   try {
    if (stage.exists) stage.delete();
    if (stage.exists) cleanupFailed = true;
   } catch { cleanupFailed = true; }
  }
  if (cleanupFailed) throw new Error('Media stage cleanup incomplete; journal recovery required');
  throw failure;
 }
}

// Structural compatibility with the pinned Expo SDK is checked by tsc.
// Native File handles are opened without loading an entire file in JS.
export function transformNativeMediaToStage(input: File, stage: File,
 guard: () => void, transform: Transform): Promise<void> {
 return transformToStage(input, stage, guard, transform);
}
