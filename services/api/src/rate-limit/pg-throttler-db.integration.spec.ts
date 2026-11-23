import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PgThrottlerStorage } from './pg-throttler-storage';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL shared rate limit', () => {
 const a = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const b = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const prefix = 'test-' + randomUUID();
 afterAll(async () => { await a.rateLimitBucket.deleteMany({ where: { key: { startsWith: prefix } } }); await a.$disconnect(); await b.$disconnect(); });

 it('two API instances share one budget and the key is blocked after the limit', async () => {
  const s1 = new PgThrottlerStorage(a), s2 = new PgThrottlerStorage(b), key = prefix + '-shared';
  const hits = [await s1.increment(key, 60_000, 3, 60_000, 'default'), await s2.increment(key, 60_000, 3, 60_000, 'default'), await s1.increment(key, 60_000, 3, 60_000, 'default'), await s2.increment(key, 60_000, 3, 60_000, 'default')];
  expect(hits.map(h => [h.totalHits, h.isBlocked])).toEqual([[1, false], [2, false], [3, false], [4, true]]);
  expect(hits[3].timeToBlockExpire).toBeGreaterThan(55);
 });
 it('is atomic under concurrency', async () => {
  const s = new PgThrottlerStorage(a), key = prefix + '-concurrent';
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => new PgThrottlerStorage(i % 2 ? a : b).increment(key, 60_000, 1000, 60_000, 'default')));
  expect(res.map(r => r.totalHits).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  expect((await s.increment(key, 60_000, 1000, 60_000, 'default')).totalHits).toBe(21);
 });
 it('starts a new window after expiry, but not while blocked', async () => {
  const s = new PgThrottlerStorage(a), key = prefix + '-window';
  await s.increment(key, 300, 1, 1500, 'default');
  expect((await s.increment(key, 300, 1, 1500, 'default')).isBlocked).toBe(true);
  await new Promise(r => setTimeout(r, 500));
  expect((await s.increment(key, 300, 1, 1500, 'default')).isBlocked).toBe(true); // window expired, block still active
  await new Promise(r => setTimeout(r, 1300));
  const fresh = await s.increment(key, 300, 1, 1500, 'default');
  expect([fresh.totalHits, fresh.isBlocked]).toEqual([1, false]);
 });
});
