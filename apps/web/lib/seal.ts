import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for cookies (AES-256-GCM). The purpose is bound as AAD so a login-state
 * cookie can never be replayed as a session cookie; expiry is inside the sealed payload.
 */
export function seal(key: Buffer, purpose: string, payload: object, ttlSec: number, nowSec = Math.floor(Date.now() / 1000)): string {
 const iv = randomBytes(12);
 const c = createCipheriv('aes-256-gcm', key, iv);
 c.setAAD(Buffer.from('ape-web:' + purpose));
 const body = Buffer.concat([c.update(JSON.stringify({ ...payload, _exp: nowSec + ttlSec }), 'utf8'), c.final()]);
 return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url');
}

export function unseal<T>(key: Buffer, purpose: string, value: string | undefined, nowSec = Math.floor(Date.now() / 1000)): T | null {
 if (!value) return null;
 try {
  const raw = Buffer.from(value, 'base64url');
  if (raw.length < 29) return null;
  const d = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  d.setAAD(Buffer.from('ape-web:' + purpose));
  d.setAuthTag(raw.subarray(12, 28));
  const json = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8'));
  if (typeof json._exp !== 'number' || json._exp < nowSec) return null;
  delete json._exp;
  return json as T;
 } catch {
  return null;
 }
}
