import { describe, expect, it, vi } from 'vitest';
vi.mock('expo-secure-store', () => ({}));
vi.mock('expo-file-system', () => ({ File: class {}, Directory: class {}, Paths: {} }));
import { toBase64 } from './server';
describe('base64 for upload parts', () => {
 it('matches Node encoding for all padding cases', () => {
  for (const n of [0, 1, 2, 3, 4, 5, 255, 1000]) {
   const b = new Uint8Array(Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255));
   expect(toBase64(b)).toBe(Buffer.from(b).toString('base64'));
  }
 });
});
