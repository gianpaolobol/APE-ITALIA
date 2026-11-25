import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
import { parseStoredSession, toBase64 } from './server';
describe('base64 for upload parts', () => {
 it('matches Node encoding for all padding cases', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 255, 1000]) {
   const b = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
   expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
  }
 });
});

describe('stored session validation', () => {
 const valid = { accessToken: 'synthetic-access', refreshToken: 'synthetic-refresh', subject: 'subject-a', email: 'test@example.invalid', expiresAt: 1, organizationId: 'org-a', isCertifier: false };
 it('preserves valid expired sessions for refresh and allows null organization', () => {
  expect(parseStoredSession(JSON.stringify(valid))).toEqual(valid);
  expect(parseStoredSession(JSON.stringify({ ...valid, organizationId: null }))).toEqual({ ...valid, organizationId: null });
 });
 it('rejects malformed and incomplete sessions before exposing their account scope', () => {
  for (const x of [null, [], {}, { ...valid, accessToken: '' }, { ...valid, refreshToken: 123 }, { ...valid, subject: ' ' }, { ...valid, organizationId: {} }, { ...valid, organizationId: '' }, { ...valid, email: null }, { ...valid, expiresAt: '1' }, { ...valid, expiresAt: null }, { ...valid, isCertifier: 'false' }]) {
   expect(parseStoredSession(JSON.stringify(x))).toBeNull();
  }
  expect(parseStoredSession('{')).toBeNull();
 });
 it('does not retain unexpected stored fields', () => {
  expect(parseStoredSession(JSON.stringify({ ...valid, other: 'unexpected' }))).toEqual(valid);
 });
});
