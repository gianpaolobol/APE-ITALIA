import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';

/** Private object storage port: no public URLs, server-generated keys only. */
export interface ObjectStorage {
 put(key: string, data: Buffer): Promise<void>;
 get(key: string): Promise<Buffer>;
 delete(key: string): Promise<void>;
}

const KEY_PATTERN = /^org\/[0-9a-f-]{36}\/case\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/;
export function evidenceStorageKey(organizationId: string, caseId: string, objectId: string): string {
 const key = `org/${organizationId}/case/${caseId}/${objectId}`;
 if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
 return key;
}

const MAGIC = Buffer.from('APE1');
/** AES-256-GCM envelope: MAGIC | IV(12) | TAG(16) | CIPHERTEXT; the storage key is bound as AAD. */
export function encrypt(masterKey: Buffer, storageKey: string, plaintext: Buffer): Buffer {
 const iv = randomBytes(12);
 const c = createCipheriv('aes-256-gcm', masterKey, iv);
 c.setAAD(Buffer.from(storageKey, 'utf8'));
 const body = Buffer.concat([c.update(plaintext), c.final()]);
 return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}
export function decrypt(masterKey: Buffer, storageKey: string, envelope: Buffer): Buffer {
 if (envelope.length < 32 || !envelope.subarray(0, 4).equals(MAGIC)) throw new Error('Unknown storage envelope');
 const d = createDecipheriv('aes-256-gcm', masterKey, envelope.subarray(4, 16));
 d.setAAD(Buffer.from(storageKey, 'utf8'));
 d.setAuthTag(envelope.subarray(16, 32));
 return Buffer.concat([d.update(envelope.subarray(32)), d.final()]);
}

export function parseMasterKey(value: string | undefined): Buffer | null {
 if (!value) return null;
 const key = Buffer.from(value, 'base64');
 return key.length === 32 ? key : null;
}

/**
 * Development/self-hosted backend: encrypted files on local disk outside any web root.
 * Production should use a managed private bucket with server-side encryption (provider not yet chosen).
 */
export class EncryptedFileStorage implements ObjectStorage {
 private readonly root: string;
 constructor(root: string, private readonly masterKey: Buffer) {
  if (masterKey.length !== 32) throw new Error('Master key must be 32 bytes');
  this.root = resolve(root);
 }
 private path(key: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error('Invalid storage key');
  const p = resolve(join(this.root, key));
  if (!p.startsWith(this.root + sep)) throw new Error('Path escapes storage root');
  return p;
 }
 async put(key: string, data: Buffer): Promise<void> {
  const p = this.path(key);
  await mkdir(dirname(p), { recursive: true, mode: 0o700 });
  const tmp = p + '.' + randomBytes(6).toString('hex') + '.tmp';
  await writeFile(tmp, encrypt(this.masterKey, key, data), { mode: 0o600, flag: 'wx' });
  await rename(tmp, p);
 }
 async get(key: string): Promise<Buffer> {
  return decrypt(this.masterKey, key, await readFile(this.path(key)));
 }
 async delete(key: string): Promise<void> {
  await rm(this.path(key), { force: true });
 }
}

export function storageFromEnv(env = process.env): ObjectStorage | null {
 const key = parseMasterKey(env.EVIDENCE_ENCRYPTION_KEY);
 const dir = env.EVIDENCE_STORAGE_DIR;
 if (!key || !dir) return null;
 return new EncryptedFileStorage(dir, key);
}
