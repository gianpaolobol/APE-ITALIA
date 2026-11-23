import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AppModule } from '../app.module';
import { collectRoutes, renderApiIndex } from './api-index';

describe('API index', () => {
 const routes = collectRoutes(AppModule);
 it('lists every route with its access class', () => {
  expect(routes.find(r => r.path === '/health')).toMatchObject({ method: 'GET', access: 'pubblico' });
  expect(routes.find(r => r.path === '/v1/me')).toMatchObject({ access: 'utente autenticato' });
  expect(routes.find(r => r.path === '/v1/properties' && r.method === 'POST')).toMatchObject({ access: "membro dell'organizzazione", status: 201 });
  expect(routes.find(r => r.path === '/v1/certifier/assignments/:id/accept')).toMatchObject({ access: 'certificatore verificato' });
  expect(routes.find(r => r.path === '/v1/invitations/accept')).toMatchObject({ limit: 10 });
  expect(routes.find(r => r.path === '/v1/cases/:id' && r.method === 'DELETE')).toMatchObject({ status: 204 });
 });
 it('every organization route except identity and invitation redemption requires x-organization-id', () => {
  const unscoped = routes.filter(r => r.access === 'utente autenticato').map(r => r.path);
  expect(unscoped.sort()).toEqual(['/v1/auth/account', '/v1/auth/push-token', '/v1/auth/session', '/v1/invitations/accept', '/v1/me']);
 });
 it('public routes are only health, notices, certifier applications and the survey photo reader (all throttled)', () => {
  const pub = routes.filter(r => r.access === 'pubblico');
  expect(pub.map(r => r.path).sort()).toEqual(['/health', '/v1/auth/email/start', '/v1/auth/email/verify', '/v1/auth/logout', '/v1/auth/refresh', '/v1/certifier-applications', '/v1/notices', '/v1/survey/read-photo']);
  for (const r of pub.filter(x => x.method === 'POST' && x.path !== '/v1/auth/logout' && x.path !== '/v1/auth/refresh')) expect(r.limit).toBeLessThanOrEqual(10);
 });
 it('docs/API.md is up to date (run `npm run docs:api -w @ape/api`)', () => {
  expect(readFileSync(resolve(__dirname, '../../../../docs/API.md'), 'utf8')).toBe(renderApiIndex(routes));
 });
});
