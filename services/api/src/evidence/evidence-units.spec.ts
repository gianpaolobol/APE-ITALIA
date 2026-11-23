import { describe, expect, it } from 'vitest';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EncryptedFileStorage, decrypt, encrypt, evidenceStorageKey, parseMasterKey, storageFromEnv } from './storage';
import { isAllowedForKind, sniffMimeType, stripJpegMetadata } from './file-policy';
import { isCurrentNotice, CURRENT_NOTICES } from './consent-policy';
import { heicBytes, jpegWithExif, pdfBytes, pngBytes } from './fixtures';

const key = randomBytes(32);
const sk = () => evidenceStorageKey(randomUUID(), randomUUID(), randomUUID());

describe('AES-256-GCM envelope', () => {
 it('round-trips', () => {
  const k = sk(); const data = randomBytes(1000);
  expect(decrypt(key, k, encrypt(key, k, data))).toEqual(data);
 });
 it('uses a fresh IV per object', () => {
  const k = sk(); const data = Buffer.from('same');
  expect(encrypt(key, k, data).equals(encrypt(key, k, data))).toBe(false);
 });
 it('detects tampering', () => {
  const k = sk(); const env = encrypt(key, k, Buffer.from('payload'));
  env[env.length - 1] ^= 1;
  expect(() => decrypt(key, k, env)).toThrow();
 });
 it('binds ciphertext to its storage key (no swapping between objects)', () => {
  const env = encrypt(key, sk(), Buffer.from('payload'));
  expect(() => decrypt(key, sk(), env)).toThrow();
 });
 it('fails with another master key', () => {
  const k = sk();
  expect(() => decrypt(randomBytes(32), k, encrypt(key, k, Buffer.from('x')))).toThrow();
 });
 it('accepts only 32-byte base64 master keys', () => {
  expect(parseMasterKey(randomBytes(16).toString('base64'))).toBeNull();
  expect(parseMasterKey(undefined)).toBeNull();
  expect(parseMasterKey(key.toString('base64'))?.equals(key)).toBe(true);
 });
 it('storage is disabled unless fully configured', () => {
  expect(storageFromEnv({})).toBeNull();
  expect(storageFromEnv({ EVIDENCE_STORAGE_DIR: '/tmp/x' })).toBeNull();
 });
});

describe('encrypted file storage', () => {
 it('never writes plaintext to disk and restricts permissions', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ape-ev-'));
  const s = new EncryptedFileStorage(dir, key);
  const k = sk(); const marker = Buffer.from('SYNTHETIC-PLAINTEXT-MARKER');
  await s.put(k, marker);
  const raw = await readFile(join(dir, k));
  expect(raw.includes(marker)).toBe(false);
  expect((await stat(join(dir, k))).mode & 0o777).toBe(0o600);
  expect(await s.get(k)).toEqual(marker);
  await s.delete(k);
  await expect(s.get(k)).rejects.toThrow();
 });
 it('rejects keys that are not server-generated', async () => {
  const s = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-ev-')), key);
  for (const bad of ['../../etc/passwd', 'org/x/case/y/z', `org/${randomUUID()}/case/${randomUUID()}/../../${randomUUID()}`]) {
   await expect(s.put(bad, Buffer.from('x'))).rejects.toThrow();
  }
  expect(() => evidenceStorageKey('..', randomUUID(), randomUUID())).toThrow();
 });
});

describe('file policy', () => {
 it('sniffs allowed types from content, not from names or headers', () => {
  expect(sniffMimeType(jpegWithExif())).toBe('image/jpeg');
  expect(sniffMimeType(pngBytes())).toBe('image/png');
  expect(sniffMimeType(pdfBytes())).toBe('application/pdf');
  expect(sniffMimeType(heicBytes())).toBe('image/heic');
 });
 it('rejects executables, HTML, SVG and zip archives', () => {
  for (const b of [Buffer.from('MZ\x90\0', 'latin1'), Buffer.from('<html><script>'), Buffer.from('<svg onload=1>'), Buffer.from('PK\x03\x04', 'latin1'), Buffer.from('\x7fELF', 'latin1')]) {
   expect(sniffMimeType(b)).toBeNull();
  }
 });
 it('allows PDF only for plans and documents', () => {
  expect(isAllowedForKind('floorplan', 'application/pdf')).toBe(true);
  expect(isAllowedForKind('boiler', 'application/pdf')).toBe(false);
  expect(isAllowedForKind('boiler', 'image/jpeg')).toBe(true);
 });
 it('strips EXIF/XMP and IPTC (location data) but keeps image segments', () => {
  const original = jpegWithExif();
  const out = stripJpegMetadata(original)!;
  expect(out.includes(Buffer.from('GPS 44.4949N'))).toBe(false);
  expect(out.includes(Buffer.from('Exif'))).toBe(false);
  expect(out.includes(Buffer.from('JFIF'))).toBe(true);
  expect(out.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(out.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
  expect(out.includes(Buffer.from([0x12, 0x34, 0xff, 0x00, 0x56]))).toBe(true);
  expect(out.length).toBeLessThan(original.length);
 });
 it('rejects malformed JPEG structure', () => {
  expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull();
  expect(stripJpegMetadata(Buffer.from([0xff, 0xd8, 0x00]))).toBeNull();
 });
});

describe('consent notices', () => {
 it('accepts only the current version', () => {
  expect(isCurrentNotice('evidence_processing', CURRENT_NOTICES.evidence_processing)).toBe(true);
  expect(isCurrentNotice('evidence_processing', 'old')).toBe(false);
  expect(isCurrentNotice('marketing', 'x')).toBe(false);
  expect(isCurrentNotice('__proto__', undefined)).toBe(false);
 });
});
