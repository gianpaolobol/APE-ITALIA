import { describe, expect, it } from 'vitest';
import { certificateBinding, matchesCertificateBinding } from './certificate-binding';

describe('certificate session binding', () => {
 const key = Buffer.alloc(32, 7);
 const session = { sub: 'synthetic-alice', accessToken: 'synthetic-token-a', expiresAt: 1234567890 };
 const org = 'org-a', id = 'case-a';
 const binding = certificateBinding(key, session, org, id);
 it('accepts only the matching scope and session', () => {
  expect(binding).toMatch(/^[a-f0-9]{64}$/);
  expect(matchesCertificateBinding(key, session, org, id, binding)).toBe(true);
  expect(matchesCertificateBinding(key, { ...session, sub: 'synthetic-bob' }, org, id, binding)).toBe(false);
  expect(matchesCertificateBinding(key, { ...session, accessToken: 'synthetic-token-b' }, org, id, binding)).toBe(false);
  expect(matchesCertificateBinding(key, { ...session, expiresAt: session.expiresAt + 1 }, org, id, binding)).toBe(false);
  expect(matchesCertificateBinding(key, session, 'org-b', id, binding)).toBe(false);
  expect(matchesCertificateBinding(key, session, org, 'case-b', binding)).toBe(false);
  expect(matchesCertificateBinding(Buffer.alloc(32, 8), session, org, id, binding)).toBe(false);
 });
 it('fails closed on missing or malformed bindings', () => {
  for (const invalid of [null, undefined, '', 'z'.repeat(64), binding + '0', {}, 123]) {
   expect(matchesCertificateBinding(key, session, org, id, invalid)).toBe(false);
  }
 });
});
