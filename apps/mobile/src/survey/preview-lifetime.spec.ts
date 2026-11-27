import { describe, expect, it, vi } from 'vitest';
import { createPreviewLifetime } from './preview-lifetime';
describe('authenticated preview lifetime', () => {
 it('holds until viewer closes', async () => {
  const life = createPreviewLifetime(), show = vi.fn(), done = vi.fn();
  const task = life.hold('private-cache', show).then(done);
  await Promise.resolve(); expect(show).toHaveBeenCalledWith('private-cache'); expect(done).not.toHaveBeenCalled();
  life.close(); await task; expect(done).toHaveBeenCalledOnce();
 });
 it('never displays a late result after close', async () => {
  const life = createPreviewLifetime(), show = vi.fn(); life.close();
  await expect(life.hold('private-cache', show)).rejects.toThrow(); expect(show).not.toHaveBeenCalled();
 });
 it('rejects a second consumer and closes idempotently', async () => {
  const life = createPreviewLifetime(), show = vi.fn(); const task = life.hold('first', show);
  await expect(life.hold('second', show)).rejects.toThrow();
  life.close(); life.close(); await task; expect(show).toHaveBeenCalledTimes(1);
 });
});
