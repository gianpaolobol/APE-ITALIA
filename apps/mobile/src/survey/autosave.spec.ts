import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAutosave } from './autosave';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe('local autosave', () => {
 it('writes only the latest debounced snapshot', () => {
  const write = vi.fn(), failure = vi.fn();
  const a = createAutosave(write, failure);
  a.schedule('old');
  a.schedule('new');
  vi.advanceTimersByTime(300);
  expect(write.mock.calls).toEqual([['new']]);
  expect(failure).toHaveBeenLastCalledWith(false);
 });
 it('retains a failed snapshot and exposes the failure until retry succeeds', () => {
  const write = vi.fn().mockImplementationOnce(() => { throw new Error('disk full'); });
  const failure = vi.fn();
  const a = createAutosave(write, failure);
  a.schedule('draft');
  vi.advanceTimersByTime(300);
  expect(failure).toHaveBeenLastCalledWith(true);
  expect(a.flush()).toBe(true);
  expect(write.mock.calls).toEqual([['draft'], ['draft']]);
  expect(failure).toHaveBeenLastCalledWith(false);
 });
 it('retries a newer edit instead of resurrecting a failed older snapshot', () => {
  const write = vi.fn().mockImplementationOnce(() => { throw new Error('disk full'); });
  const failure = vi.fn();
  const a = createAutosave(write, failure);
  a.schedule('old');
  expect(a.flush()).toBe(false);
  a.schedule('new');
  expect(failure).toHaveBeenLastCalledWith(true);
  expect(a.flush()).toBe(true);
  vi.advanceTimersByTime(300);
  expect(write.mock.calls).toEqual([['old'], ['new']]);
 });
 it('flushes on background without writing again when no changes remain', () => {
  const write = vi.fn();
  const a = createAutosave(write, vi.fn());
  a.schedule('draft');
  expect(a.flush()).toBe(true);
  expect(a.flush()).toBe(true);
  vi.advanceTimersByTime(300);
  expect(write).toHaveBeenCalledTimes(1);
 });
 it('cancels obsolete pending saves after a successful explicit commit', () => {
  const write = vi.fn().mockImplementationOnce(() => { throw new Error('disk full'); });
  const failure = vi.fn();
  const a = createAutosave(write, failure);
  a.schedule('before deletion');
  expect(a.flush()).toBe(false);
  a.schedule('newer pending');
  a.committed();
  expect(failure).toHaveBeenLastCalledWith(false);
  expect(a.flush()).toBe(true);
  vi.advanceTimersByTime(300);
  expect(write.mock.calls).toEqual([['before deletion']]);
 });
});
