import { describe, expect, it } from 'vitest';
import { PgThrottlerStorage } from './pg-throttler-storage';

describe('PgThrottlerStorage record mapping', () => {
 it('maps rows to throttler records in seconds', async () => {
  const s = new PgThrottlerStorage({ $queryRaw: (async () => [{ hits: 3, ttl_ms: 1500, block_ms: 59_001 }]) as never });
  expect(await s.increment('k', 60_000, 2, 60_000, 'default')).toEqual({ totalHits: 3, timeToExpire: 2, isBlocked: true, timeToBlockExpire: 60 });
  const ok = new PgThrottlerStorage({ $queryRaw: (async () => [{ hits: 1, ttl_ms: 60_000, block_ms: null }]) as never });
  expect(await ok.increment('k', 60_000, 2, 60_000, 'default')).toEqual({ totalHits: 1, timeToExpire: 60, isBlocked: false, timeToBlockExpire: 0 });
 });
});
