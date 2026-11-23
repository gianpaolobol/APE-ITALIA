import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NestFactory } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaService } from './prisma.service';
import { configureHttp } from './http-setup';

/** Boots the real Nest module over HTTP. Database connection is stubbed: only unauthenticated paths are exercised. */
describe('HTTP runtime (real Nest app, no database)', () => {
 let app: INestApplication;
 let base: string;
 beforeAll(async () => {
  vi.spyOn(PrismaService.prototype, 'onModuleInit').mockResolvedValue(undefined);
  vi.spyOn(PrismaService.prototype, 'onModuleDestroy').mockResolvedValue(undefined);
  delete process.env.OIDC_ISSUER;
  app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  configureHttp(app);
  await app.listen(0, '127.0.0.1');
  base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
 });
 afterAll(async () => { await app?.close(); });

 it('GET /health returns 200', async () => {
  const res = await fetch(base + '/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({ status: 'ok' });
 });
 for (const path of ['/v1/me', '/v1/properties', '/v1/cases']) {
  it(`GET ${path} without token returns 401`, async () => {
   expect((await fetch(base + path)).status).toBe(401);
  });
 }
 it('sends hardening headers and hides the framework', async () => {
  const res = await fetch(base + '/health');
  expect(res.headers.get('x-powered-by')).toBeNull();
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(res.headers.get('access-control-allow-origin')).toBeNull();
 });
 it('POST /v1/cases with an invalid token returns 401', async () => {
  const res = await fetch(base + '/v1/cases', { method: 'POST', headers: { Authorization: 'Bearer x.y.z', 'Content-Type': 'application/json' }, body: '{}' });
  expect(res.status).toBe(401);
 });
});
