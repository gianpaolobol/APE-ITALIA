import { describe, expect, it } from 'vitest';
import { romeLocalToIso } from './time';
describe('Europe/Rome local time conversion', () => {
 it('handles winter and summer time', () => {
  expect(romeLocalToIso('2026-12-01T09:30')).toBe('2026-12-01T08:30:00.000Z');
  expect(romeLocalToIso('2026-07-01T09:30')).toBe('2026-07-01T07:30:00.000Z');
 });
 it('rejects malformed input', () => expect(() => romeLocalToIso('01/12/2026 09:30')).toThrow());
});
