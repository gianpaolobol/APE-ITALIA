import { describe, expect, it, vi } from 'vitest';
import { startSchedules } from './jobs';

describe('worker scheduler', () => {
 it('runs immediately, never overlaps a slow run, and logs a summary', async () => {
  vi.useFakeTimers();
  const logs: string[] = [];
  let resolveRun: (v: unknown) => void = () => {};
  const run = vi.fn(() => new Promise(r => { resolveRun = r; }));
  const stop = startSchedules([{ name: 'job', everyMs: 1000, run }], m => logs.push(m));
  expect(run).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(3000); // still running: no overlap
  expect(run).toHaveBeenCalledTimes(1);
  resolveRun({ ran: true, result: 2 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(run).toHaveBeenCalledTimes(2);
  expect(logs[0]).toBe('[worker] job ok {"count":2}');
  stop();
  vi.useRealTimers();
 });
 it('logs failures by error name only', async () => {
  const logs: string[] = [];
  const stop = startSchedules([{ name: 'bad', everyMs: 60_000, run: async () => { throw new TypeError('secret detail SYNTHETIC'); } }], m => logs.push(m));
  await new Promise(r => setTimeout(r, 10));
  stop();
  expect(logs).toEqual(['[worker] bad failed: TypeError']);
 });
 it('reports skipped runs when another instance holds the lock', async () => {
  const logs: string[] = [];
  const stop = startSchedules([{ name: 'x', everyMs: 60_000, run: async () => ({ ran: false }) }], m => logs.push(m));
  await new Promise(r => setTimeout(r, 10));
  stop();
  expect(logs[0]).toContain('locked by another instance');
 });
});
