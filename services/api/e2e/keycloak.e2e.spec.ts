/**
 * End-to-end with a REAL OIDC provider: Keycloak (HTTPS, realm from deploy/keycloak) + compiled API +
 * Next.js portal (BFF) + PostgreSQL + Chrome. Proves that tokens issued by an actual provider are accepted
 * end to end. Synthetic user created at run time with a random password; nothing is committed.
 * Run with RUN_KEYCLOAK_E2E=1, KEYCLOAK_URL, KEYCLOAK_ADMIN_PASSWORD, NODE_EXTRA_CA_CERTS (see CI).
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer, type Server } from 'node:https';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { chromium, type Browser } from 'playwright-core';
import { createOrganizationWithOwner } from '../src/admin/provisioning';

const enabled = process.env.RUN_KEYCLOAK_E2E === '1';
const KC = (process.env.KEYCLOAK_URL ?? 'https://localhost:8443').replace(/\/$/, '');
const ISSUER = `${KC}/realms/ape-italia`;

async function waitFor(url: string, ok: (r: Response) => boolean = r => r.ok, tries = 120) {
 for (let i = 0; i < tries; i++) {
  try { if (ok(await fetch(url))) return; } catch { /* starting */ }
  await new Promise(r => setTimeout(r, 500));
 }
 throw new Error('Timeout waiting for ' + url);
}

describe.skipIf(!enabled)('E2E with Keycloak as real OIDC provider', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const username = 'synthetic-' + randomBytes(4).toString('hex');
 const password = randomBytes(18).toString('base64url');
 let api: ChildProcess, web: ChildProcess, browser: Browser, tlsProxy: Server, sub = '', org = '';
 const API = 'http://127.0.0.1:3311', WEB = 'http://localhost:3300';

 beforeAll(async () => {
  // Synthetic user via the admin API (random password, never stored).
  const admin = await (await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
   method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
   body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'admin', password: process.env.KEYCLOAK_ADMIN_PASSWORD ?? '' }),
  })).json() as { access_token: string };
  const created = await fetch(`${KC}/admin/realms/ape-italia/users`, {
   method: 'POST', headers: { Authorization: 'Bearer ' + admin.access_token, 'Content-Type': 'application/json' },
   body: JSON.stringify({ username, enabled: true, email: `${username}@example.test`, emailVerified: true, firstName: 'Utente', lastName: 'Sintetico', requiredActions: [], credentials: [{ type: 'password', value: password, temporary: false }] }),
  });
  expect(created.status).toBe(201);
  sub = created.headers.get('location')!.split('/').pop()!;

  org = (await createOrganizationWithOwner(db, { name: 'Studio Keycloak E2E', ownerSubject: sub, operator: 'ci-keycloak' })).organizationId;

  const env = { ...process.env, OIDC_ISSUER: ISSUER, OIDC_AUDIENCE: 'ape-italia-api', NEXT_TELEMETRY_DISABLED: '1' };
  const dir = mkdtempSync(join(tmpdir(), 'ape-kc-'));
  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
   env: { ...env, PORT: '3311', OIDC_JWKS_URL: `${ISSUER}/protocol/openid-connect/certs`, EVIDENCE_STORAGE_DIR: join(dir, 'store'), EVIDENCE_ENCRYPTION_KEY: randomBytes(32).toString('base64'), RATE_LIMIT_PER_MINUTE: '1000' },
   stdio: ['ignore', 'inherit', 'inherit'],
  });
  // The portal only talks to an HTTPS API: terminate TLS in front of the API with the CI certificate.
  const certDir = process.env.KC_CERT_DIR ?? '/tmp/kc';
  tlsProxy = createServer({ key: readFileSync(join(certDir, 'k.pem')), cert: readFileSync(join(certDir, 'c.pem')) }, (req, res) => {
   const up = httpRequest({ host: '127.0.0.1', port: 3311, path: req.url, method: req.method, headers: req.headers }, r => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
   up.on('error', () => { res.writeHead(502); res.end(); });
   req.pipe(up);
  });
  await new Promise<void>(r => tlsProxy.listen(3312, '127.0.0.1', () => r()));
  web = spawn(process.execPath, [resolve(__dirname, '../../../node_modules/next/dist/bin/next'), 'start', '-p', '3300'], {
   cwd: resolve(__dirname, '../../../apps/web'),
   env: { ...env, WEB_OIDC_CLIENT_ID: 'ape-web', WEB_BASE_URL: WEB, API_BASE_URL: 'https://localhost:3312', WEB_SESSION_KEY: randomBytes(32).toString('base64') },
   stdio: ['ignore', 'inherit', 'inherit'],
  });
  await waitFor(API + '/health');
  await waitFor(WEB + '/');
  browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome', args: ['--no-sandbox'] });
 }, 120_000);

 afterAll(async () => {
  await browser?.close();
  api?.kill('SIGTERM'); web?.kill('SIGTERM'); tlsProxy?.close();
  if (!enabled) return;
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: org } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.membership.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.$disconnect();
 });

 it('discovery advertises PKCE S256 and the API rejects unauthenticated calls', async () => {
  const d = await (await fetch(`${ISSUER}/.well-known/openid-configuration`)).json() as { issuer: string; code_challenge_methods_supported: string[] };
  expect(d.issuer).toBe(ISSUER);
  expect(d.code_challenge_methods_supported).toContain('S256');
  expect((await fetch(API + '/v1/me')).status).toBe(401);
 });

 it('logs in on the Keycloak page, reaches the organization area and creates a case through the real API', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }); // throwaway CI certificate
  const page = await ctx.newPage();
  await page.goto(WEB + '/auth/login?returnTo=/org');
  await page.waitForURL(u => u.toString().startsWith(ISSUER), { timeout: 30_000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForURL(WEB + '/org', { timeout: 30_000 });
  await page.getByText('Studio Keycloak E2E').first().waitFor({ state: 'visible', timeout: 15_000 });
  expect(await page.evaluate(() => document.cookie)).toBe('');

  await page.getByRole('link', { name: 'Nuova pratica' }).click();
  await page.waitForURL(WEB + '/org/new');
  await page.locator('input[name=address]').fill('Via Keycloak 1');
  await page.locator('input[name=city]').fill('Bologna');
  await page.getByRole('button', { name: 'Crea bozza' }).click();
  await page.waitForURL(u => /\/org\/cases\/[0-9a-f-]{36}/.test(u.toString()), { timeout: 30_000 });
  const cases = await db.apeCase.findMany({ where: { organizationId: org }, include: { property: true } });
  expect(cases.map(c => c.property.address)).toEqual(['Via Keycloak 1']);
  const audit = await db.auditEvent.findMany({ where: { organizationId: org, action: 'case.create' } });
  expect(audit.map(a => a.actorId)).toEqual([sub]); // actor is the Keycloak subject from the verified token
  await ctx.close();
 }, 90_000);

 it('a wrong password never produces a session', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(WEB + '/auth/login?returnTo=/org');
  await page.waitForURL(u => u.toString().startsWith(ISSUER), { timeout: 30_000 });
  await page.locator('#username').fill(username);
  await page.locator('#password').fill('wrong-' + randomUUID());
  await page.locator('#kc-login').click();
  await page.waitForTimeout(1500);
  expect(page.url().startsWith(ISSUER)).toBe(true);
  expect((await ctx.cookies()).find(c => c.name === '__Host-ape_session')).toBeUndefined();
  await ctx.close();
 }, 60_000);
});
