import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withLock } from './jobs';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL advisory locks for the worker', () => {
 const a = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const b = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 afterAll(async () => { await a.$disconnect(); await b.$disconnect(); });
 it('lets only one instance run a job at a time', async () => {
  let release: () => void = () => {};
  const holding = new Promise<void>(r => { release = r; });
  const first = withLock(a, 99_001, async () => { await holding; return 'first'; });
  await new Promise(r => setTimeout(r, 300));
  expect(await withLock(b, 99_001, async () => 'second')).toEqual({ ran: false });
  release();
  expect(await first).toEqual({ ran: true, result: 'first' });
  expect(await withLock(b, 99_001, async () => 'again')).toEqual({ ran: true, result: 'again' });
 });
});
