/** [Codex] Compose authenticated envelope, key lifecycle and native staging.
 * A caller must authorize the draft, journal every stage durably, serialize
 * operations against manifest/cleanup writers and recheck ownership on every
 * guard. This module never mutates the manifest or deletes the original.
 */
import { sealMedia, openMedia } from './media-envelope';
import { nativeMediaKeys } from './media-key';
import { transformToStage } from './media-staging';
import type { File } from 'expo-file-system';

type StageFile = Parameters<typeof transformToStage>[0];
type Keys = Pick<typeof nativeMediaKeys, 'withKey'>;
type IO<T> = T | Promise<T>;
type Operation = {
 input: StageFile;
 stage: StageFile;
 identity: string;
 guard: () => void;
 /** Must persist a cleanup intent before any bytes are written. */
 reserve: () => IO<void>;
 /** Must scan all encrypted evidence, not only the current draft. */
 hasEncryptedEvidence: () => IO<boolean>;
};

function check(op: Operation) {
 op.guard();
 if (!/^[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,12}$/.test(op.identity))
  throw new Error('Invalid media identity');
 if (op.input.uri === op.stage.uri || !op.input.exists || op.stage.exists)
  throw new Error('Invalid media stage');
}
function discard(stage: StageFile) {
 try {
  if (stage.exists) stage.delete();
  if (stage.exists) throw new Error('Stage still exists');
 } catch { throw new Error('Media stage cleanup incomplete; journal recovery required'); }
}

export function createMediaGateway(keys: Keys, random: (length: number) => Uint8Array) {
 async function transform(op: Operation, opening: boolean): Promise<void> {
  check(op);
  let completed = false;
  try {
   await keys.withKey({
    guard: op.guard,
    // A missing key must never be regenerated while opening a sealed file.
    hasEncryptedEvidence: opening ? () => true : op.hasEncryptedEvidence,
   }, async key => {
    check(op);
    await op.reserve();
    check(op);
    await transformToStage(op.input, op.stage, op.guard, (source, sink) => {
     const context = { key, identity: op.identity, guard: op.guard };
     return opening ? openMedia(source, sink, context) : sealMedia(source, sink, context, random);
    });
    completed = true;
    op.guard();
   });
   op.guard();
  } catch (error) {
   // The staging adapter handles its own failures. Only discard a stage whose
   // successful creation we observed, never a pre-existing destination.
   if (completed) discard(op.stage);
   throw error;
  }
 }
 return {
  /** Caller may commit the returned encrypted stage to its manifest only
   * after checking current scope/state. Journal remains until commit. */
  seal(op: Operation): Promise<void> { return transform(op, false); },
  /** Plaintext is exposed only after full authentication and closed handles.
   * Callback must finish all I/O and never retain the temporary URI or bytes.
   * A process kill still requires the durable cleanup intent on restart. */
  async withOpened<T>(op: Operation, use: (stage: StageFile) => IO<T>): Promise<T> {
   await transform(op, true);
   try {
    op.guard();
    const result = await use(op.stage);
    op.guard();
    return result;
   } finally { discard(op.stage); }
  },
 };
}

type NativeOperation = Omit<Operation, 'input' | 'stage' | 'identity'> & {
 input: File;
 stage: File;
 draftId: string;
 filename: string;
};
function nativeIdentity(op: NativeOperation): string {
 const identity = op.draftId + '/' + op.filename;
 if (!/^[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,12}$/.test(identity))
  throw new Error('Invalid media identity');
 return identity;
}

/** Native entry points deliberately constrain durable files to the existing
 * app media directory and temporary plaintext to an app-private cache folder.
 * The caller must create parent directories and journal the exact destination. */
export async function sealNativeMedia(op: NativeOperation): Promise<void> {
 const identity = nativeIdentity(op);
 if (!op.filename.endsWith('.apem')) throw new Error('Invalid encrypted media filename');
 const { File, Directory, Paths } = await import('expo-file-system');
 const crypto = await import('expo-crypto');
 const { hasNativeEncryptedMedia, markNativeEncryptedMedia } = await import('./media-native-storage');
 op.guard();
 const expected = new File(new Directory(Paths.document, 'ape', 'media', op.draftId), op.filename);
 if (op.stage.uri !== expected.uri) throw new Error('Invalid durable media destination');
 await createMediaGateway(nativeMediaKeys, n => crypto.getRandomValues(new Uint8Array(n))).seal({
  ...op, identity,
  hasEncryptedEvidence: () => hasNativeEncryptedMedia() || op.hasEncryptedEvidence(),
  reserve: async () => {
   await op.reserve();
   op.guard();
   markNativeEncryptedMedia();
  },
 });
}

export async function withOpenedNativeMedia<T>(op: NativeOperation, temporaryName: string,
 use: (file: File) => IO<T>): Promise<T> {
 const identity = nativeIdentity(op);
 if (!op.filename.endsWith('.apem')) throw new Error('Invalid encrypted media filename');
 if (!/^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,12}$/.test(temporaryName))
  throw new Error('Invalid temporary media name');
 const { File, Directory, Paths } = await import('expo-file-system');
 op.guard();
 const expected = new File(new Directory(Paths.document, 'ape', 'media', op.draftId), op.filename);
 const { preparePrivateMediaCache } = await import('./media-native-storage');
 op.guard();
 const temporary = new File(new Directory(Paths.cache, 'ape-media-open'), temporaryName);
 if (op.input.uri !== expected.uri || op.stage.uri !== temporary.uri)
  throw new Error('Invalid native media paths');
 preparePrivateMediaCache();
 op.guard();
 return createMediaGateway(nativeMediaKeys, () => { throw new Error('Unexpected random request'); })
  .withOpened({ ...op, identity }, () => use(op.stage));
}
