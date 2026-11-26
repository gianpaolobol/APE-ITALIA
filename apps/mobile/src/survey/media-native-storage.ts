/** Native private media namespace. Never clear the durable evidence directory.
 * All opened plaintext is disposable and must live only under ape-media-open.
 * Recovery runs at startup and at the beginning of each exclusive App media
 * lease, before any consumer may obtain a URI. Nested callers do not resweep.
 */
import { Directory, File, Paths } from 'expo-file-system';

type CacheDirectory = { readonly exists: boolean; delete(): void; create(options: { intermediates: true }): void };
export function createCacheRecovery(directory: () => CacheDirectory) {
 let prepared = false;
 return (newExclusiveLease = false) => {
  // Only the App lease owner may request a new sweep. A previous failed
  // unlink or OS cache eviction can invalidate a once-per-runtime recovery.
  if (newExclusiveLease) prepared = false;
  if (prepared) return;
  const dir = directory();
  if (dir.exists) dir.delete();
  if (dir.exists) throw new Error('Private media cache cleanup incomplete');
  dir.create({ intermediates: true });
  if (!dir.exists) throw new Error('Private media cache unavailable');
  prepared = true;
 };
}

export const preparePrivateMediaCache = createCacheRecovery(() => new Directory(Paths.cache, 'ape-media-open'));
const marker = () => new File(new Directory(Paths.document, 'ape'), 'media.encrypted.v1');

/** Reserved suffix means even a damaged or truncated envelope is evidence.
 * A missing marker is not proof of a new archive: scan all draft directories.
 * Unexpected tree shapes or native list errors fail closed, never regenerate.
 */
export function hasNativeEncryptedMedia(): boolean {
 if (marker().exists) return true;
 const root = new Directory(Paths.document, 'ape', 'media');
 if (!root.exists) return false;
 for (const draft of root.list()) {
  if (!(draft instanceof Directory) || !/^[a-zA-Z0-9_-]{1,128}$/.test(draft.name))
   throw new Error('Unexpected media archive layout');
  for (const entry of draft.list()) {
   if (!(entry instanceof File) || !/^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]{1,12}$/.test(entry.name))
    throw new Error('Unexpected media archive entry');
   if (/\.apem$/i.test(entry.name)) return true;
  }
 }
 return false;
}

/** Called only after the key manager has loaded and confirmed a key, and
 * before writing the first envelope. Never remove the marker automatically,
 * even after deleting the last attachment. No key material is written here.
 */
export function markNativeEncryptedMedia(): void {
 const root = new Directory(Paths.document, 'ape');
 if (!root.exists) root.create({ intermediates: true });
 const file = marker();
 if (!file.exists) file.create({ overwrite: false });
 if (!file.exists) throw new Error('Media encryption marker unavailable');
}
