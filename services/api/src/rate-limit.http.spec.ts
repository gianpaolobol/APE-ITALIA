import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/** Separate file (own worker process) so the low limit does not affect other HTTP tests. */
describe('rate limiting (real Nest app)', () => {
 let app: INestApplication, base = '';
 beforeAll(async () => {
  process.env.RATE_LIMIT_PER_MINUTE = '3';
  const { AppModule } = await import('./app.module');
  const { PrismaService } = await import('./prisma.service');
  const { configureHttp } = await import('./http-setup');
  vi.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue(undefined);
  vi.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue(undefined);
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
 });
 afterAll(async () => { await app?.close(); });
 it('returns 429 after the per-client limit, with Retry-After', async () => {
  const res: Response[] = [];
  for (let i = 0; i < 5; i++) res.push(await fetch(base + '/health'));
  expect(res.map(r => r.status)).toEqual([200, 200, 200, 429, 429]);
  expect(Number(res[3].headers.get('retry-after'))).toBeGreaterThan(0);
  // Limits are tracked per route and client: another route still has its own budget.
  expect((await fetch(base + '/v1/me')).status).toBe(401);
 });
});
