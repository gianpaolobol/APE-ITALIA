/** Versioned, authenticated local snapshot envelope. No browser crypto polyfill
 * or Math.random fallback; Expo supplies native random values and SecureStore.
 * The key is device-local and is never written into the document directory. */
import { getRandomValues } from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes } from '@noble/ciphers/utils';

const SLOT = 'ape.snapshot.key.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const PREFIX = 'APE-AEAD:';
const V1 = PREFIX + '1:';
const aad = Uint8Array.from([97,112,101,46,115,110,97,112,115,104,111,116,46,118,49]); // ape.snapshot.v1
type KeyRecord = { version: 1; mode: 'pending' | 'active'; key: string };
let current: KeyRecord | undefined;

function random(size: number): Uint8Array {
 return getRandomValues(new Uint8Array(size));
}

function parseKey(raw: string): KeyRecord {
 const k = JSON.parse(raw) as Partial<KeyRecord> | null;
 if (!k || k.version !== 1 || (k.mode !== 'pending' && k.mode !== 'active') ||
     typeof k.key !== 'string' || !/^[0-9a-f]{64}$/.test(k.key)) throw new Error('Local archive key invalid');
 return { version: 1, mode: k.mode, key: k.key };
}

async function persistKey(record: KeyRecord): Promise<void> {
 const raw = JSON.stringify(record);
 await SecureStore.setItemAsync(SLOT, raw, OPTIONS);
 if (await SecureStore.getItemAsync(SLOT, OPTIONS) !== raw) throw new Error('Local archive key not confirmed');
 current = record;
}

export async function loadArchiveKey(hasEncryptedEvidence: () => boolean): Promise<'pending' | 'active'> {
 current = undefined;
 const raw = await SecureStore.getItemAsync(SLOT, OPTIONS);
 if (raw !== null) { current = parseKey(raw); return current.mode; }
 // Never replace a missing key for an existing sealed archive.
 if (hasEncryptedEvidence()) throw new Error('Local archive key unavailable');
 await persistKey({ version: 1, mode: 'pending', key: bytesToHex(random(32)) });
 return 'pending';
}

export function archiveIsActive(): boolean { return current?.mode === 'active'; }
export function requireActiveArchive(): void {
 if (!archiveIsActive()) throw new Error('Local archive not initialized');
}
export async function activateArchive(): Promise<void> {
 if (!current) throw new Error('Local archive key unavailable');
 if (current.mode !== 'active') await persistKey({ ...current, mode: 'active' });
}
export function isEncryptedSnapshot(data: string): boolean { return data.startsWith(PREFIX); }

// Encode JSON as ASCII with standard JSON Unicode escapes. This preserves every
// UTF-16 code unit, including emoji and lone surrogates, without depending on
// TextEncoder/TextDecoder availability in a particular Hermes runtime.
function jsonBytes(text: string): Uint8Array {
 const ascii = text.replace(/[^\x00-\x7f]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
 return Uint8Array.from(ascii, c => c.charCodeAt(0));
}
function jsonText(bytes: Uint8Array): string {
 const chars: string[] = [];
 for (const b of bytes) {
  if (b > 127) throw new Error('Invalid archive encoding');
  chars.push(String.fromCharCode(b));
 }
 return chars.join('');
}

export function sealSnapshot(json: string): string {
 if (!current) throw new Error('Local archive key unavailable');
 const nonce = random(24);
 const key = hexToBytes(current.key);
 try {
  return V1 + bytesToHex(nonce) + ':' + bytesToHex(xchacha20poly1305(key, nonce, aad).encrypt(jsonBytes(json)));
 } finally { key.fill(0); }
}

export function openSnapshot(data: string): { text: string; encrypted: boolean } {
 if (!current) throw new Error('Local archive key unavailable');
 if (!isEncryptedSnapshot(data)) {
  if (current.mode === 'active') throw new Error('Unencrypted archive rejected');
  return { text: data, encrypted: false };
 }
 if (!data.startsWith(V1)) throw new Error('Unsupported archive version');
 const [nonce, ciphertext, extra] = data.slice(V1.length).split(':');
 if (extra !== undefined || !/^[0-9a-f]{48}$/.test(nonce ?? '') ||
     !/^(?:[0-9a-f]{2}){16,}$/.test(ciphertext ?? '')) throw new Error('Invalid archive envelope');
 const key = hexToBytes(current.key);
 try {
  return { text: jsonText(xchacha20poly1305(key, hexToBytes(nonce), aad).decrypt(hexToBytes(ciphertext))), encrypted: true };
 } finally { key.fill(0); }
}
