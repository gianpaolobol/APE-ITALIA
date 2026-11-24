/**
 * Browser end-to-end test of the web portal (BFF): real Chrome, real `next start`, a fake OIDC provider
 * that enforces PKCE S256 and signs ID tokens, and a stub API that checks the bearer token. HTTPS with a
 * throwaway self-signed certificate. Synthetic data only. Requires `next build`; run with RUN_WEB_E2E=1.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { chromium, type Browser } from 'playwright-core';

const enabled = process.env.RUN_WEB_E2E === '1';
const CHROME = process.env.CHROME_PATH ?? '/usr/bin/google-chrome';

describe.skipIf(!enabled)('web portal in a real browser', () => {
 const dir = enabled ? mkdtempSync(join(tmpdir(), 'ape-web-e2e-')) : '';
 const ASSIGNMENT = randomUUID(), CASE = randomUUID(), ORG_A = randomUUID(), ORG_B = randomUUID(), PROP = randomUUID();
 const CERT_CASE = randomUUID();
 const pdf = Buffer.from('%PDF-1.4\nsynthetic certificate fixture\n%%EOF\n');
 const pdfHash = createHash('sha256').update(pdf).digest('hex');
 const certificate = { regionalId: 'SYNTHETIC-APE', depositedAt: '2026-11-24T00:00:00Z', validUntil: null, sha256: pdfHash, sizeBytes: pdf.length, deliveredAt: null as string | null };
 const receiptState = { corrupt: false, reads: 0, receipts: 0 };
 const invitations: { id: string; role: string; createdBy: string; expiresAt: string; createdAt: string }[] = [];
 const orgHeaders: string[] = [];
 const created: { id: string; propertyId: string; status: string; createdAt: string; consent: boolean; uploads: { kind: string; bytes: number }[] }[] = [];
 const createdProps: Record<string, { id: string; address: string; city: string; region: string; floorAreaM2: number | null }> = {};
 const ACCESS_TOKEN = 'synthetic-access-' + randomBytes(12).toString('hex');
 const state = { accepted: false, tokenRequests: 0, pkceFailures: 0, apiAuthFailures: 0 };
 let idp: Server, api: Server, next: ChildProcess, browser: Browser, key: CryptoKey, issuer = '', apiBase = '', web = '';
 const codes = new Map<string, { challenge: string; nonce: string; redirectUri: string }>();

 const readBody = (req: import('node:http').IncomingMessage) => new Promise<string>(r => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => r(b)); });

 beforeAll(async () => {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-subj', '/CN=localhost', '-days', '1', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const tls = { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  const jwks = JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'web-e2e', alg: 'RS256', use: 'sig' }] });

  idp = createServer(tls, async (req, res) => {
   const url = new URL(req.url!, issuer);
   const send = (code: number, body: unknown, headers: Record<string, string> = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(typeof body === 'string' ? body : JSON.stringify(body)); };
   if (url.pathname === '/.well-known/openid-configuration') return send(200, { issuer, authorization_endpoint: issuer + 'authorize', token_endpoint: issuer + 'token', jwks_uri: issuer + 'jwks', code_challenge_methods_supported: ['S256'] });
   if (url.pathname === '/jwks') return send(200, jwks);
   if (url.pathname === '/authorize') {
    const p = url.searchParams;
    if (p.get('code_challenge_method') !== 'S256' || p.get('response_type') !== 'code') return send(400, { error: 'invalid_request' });
    const code = randomBytes(16).toString('hex');
    codes.set(code, { challenge: p.get('code_challenge')!, nonce: p.get('nonce')!, redirectUri: p.get('redirect_uri')! });
    const back = new URL(p.get('redirect_uri')!);
    back.searchParams.set('code', code); back.searchParams.set('state', p.get('state')!); back.searchParams.set('iss', issuer);
    res.writeHead(302, { Location: back.toString() }); return res.end();
   }
   if (url.pathname === '/token' && req.method === 'POST') {
    state.tokenRequests++;
    const f = new URLSearchParams(await readBody(req));
    const pending = codes.get(f.get('code') ?? '');
    codes.delete(f.get('code') ?? '');
    if (!pending || createHash('sha256').update(f.get('code_verifier') ?? '').digest('base64url') !== pending.challenge || f.get('redirect_uri') !== pending.redirectUri) { state.pkceFailures++; return send(400, { error: 'invalid_grant' }); }
    const idToken = await new SignJWT({ nonce: pending.nonce }).setProtectedHeader({ alg: 'RS256', kid: 'web-e2e' }).setIssuer(issuer).setAudience('ape-web-e2e')
     .setSubject('synthetic-certifier').setIssuedAt().setExpirationTime('5m').sign(key);
    return send(200, { access_token: ACCESS_TOKEN, token_type: 'Bearer', expires_in: 600, id_token: idToken });
   }
   send(404, {});
  });
  await new Promise<void>(r => idp.listen(0, '127.0.0.1', () => r()));
  issuer = `https://localhost:${(idp.address() as AddressInfo).port}/`;

  api = createServer(tls, async (req, res) => {
   const send = (code: number, body: unknown) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
   if (req.headers.authorization !== 'Bearer ' + ACCESS_TOKEN) { state.apiAuthFailures++; return send(401, {}); }
   const path = req.url!.split('?')[0];
   const property = { city: 'Comune Test', region: 'Emilia-Romagna', ...(state.accepted ? { address: 'Via Sintetica 9', floorAreaM2: 80 } : {}) };
   if (path === '/v1/certifier/assignments') return send(200, [{ id: ASSIGNMENT, status: state.accepted ? 'ACCEPTED' : 'OFFERED', offeredAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 86400_000).toISOString(), caseId: CASE, caseStatus: state.accepted ? 'ASSIGNED' : 'SUBMITTED', property }]);
   if (path === `/v1/certifier/assignments/${ASSIGNMENT}/accept` && req.method === 'POST') { state.accepted = true; return send(201, { id: ASSIGNMENT, status: 'ACCEPTED', caseId: CASE }); }
   if (path === `/v1/certifier/assignments/${ASSIGNMENT}/evidence`) return send(200, []);
   if (path === `/v1/certifier/assignments/${ASSIGNMENT}/inspection`) return send(200, { inspection: null });
   if (path === `/v1/certifier/assignments/${ASSIGNMENT}/extracted-fields`) return send(200, []);
   if (path === '/v1/me') return send(200, { subject: 'synthetic-certifier', memberships: [{ organizationId: ORG_A, organizationName: 'Studio Alfa', role: 'owner' }, { organizationId: ORG_B, organizationName: 'Agenzia Beta', role: 'viewer' }] });
   if (path.startsWith('/v1/') && !path.startsWith('/v1/certifier') && path !== '/v1/me') {
    const org = String(req.headers['x-organization-id'] ?? '');
    orgHeaders.push(org);
    if (org !== ORG_A && org !== ORG_B) return send(403, {});
    if (path === '/v1/properties' && req.method === 'POST') { const b = JSON.parse(await readBody(req)); if (!b.address) return send(400, {}); const id = randomUUID(); createdProps[id] = { id, ...b, floorAreaM2: b.floorAreaM2 ?? null }; return send(201, createdProps[id]); }
    if (path === '/v1/cases' && req.method === 'POST') { const b = JSON.parse(await readBody(req)); const c = { id: randomUUID(), propertyId: b.propertyId, status: 'DRAFT', createdAt: new Date().toISOString(), consent: false, uploads: [] }; created.push(c); return send(201, c); }
    if (path === '/v1/notices') return send(200, { evidence_processing: '2026-11-23-draft' });
    if (path.startsWith('/v1/cases/' + CERT_CASE + '/')) {
     if (org !== ORG_A) return send(403, {});
     const endpoint = path.slice(('/v1/cases/' + CERT_CASE + '/').length);
     if (endpoint === 'inspection') return send(200, { caseStatus: certificate.deliveredAt ? 'DELIVERED' : 'DEPOSITED', inspection: null });
     if (endpoint === 'evidence' || endpoint === 'evidence-requests') return send(200, []);
     if (endpoint === 'certificate') return send(200, { certificate });
     if (endpoint === 'certificate/content' && req.method === 'GET') {
      receiptState.reads++;
      const body = Buffer.from(pdf);
      if (receiptState.corrupt) body[10] ^= 1;
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': String(body.length) });
      return res.end(body);
     }
     if (endpoint === 'certificate/receipt' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req));
      if (body.sha256 !== pdfHash || body.sizeBytes !== pdf.length) return send(400, {});
      receiptState.receipts++;
      certificate.deliveredAt ??= new Date().toISOString();
      return send(201, { deliveredAt: certificate.deliveredAt });
     }
     return send(404, {});
    }
    const m = /^\/v1\/cases\/([0-9a-f-]{36})\/(.+)$/.exec(path);
    const mine = m && created.find(c => c.id === m[1]);
    if (m && mine) {
     if (m[2] === 'consents') { mine.consent = true; return send(201, { id: randomUUID() }); }
     if (m[2] === 'evidence' && req.method === 'POST') { const raw = await readBody(req); if (!mine.consent) return send(403, {}); mine.uploads.push({ kind: /name="kind"\r\n\r\n(\w+)/.exec(raw)?.[1] ?? '?', bytes: raw.length }); return send(201, { id: randomUUID() }); }
     if (m[2] === 'evidence') return send(200, mine.uploads.map((u, i) => ({ id: randomUUID(), kind: u.kind, mimeType: 'image/png', sizeBytes: u.bytes, scanStatus: 'unscanned', createdAt: new Date().toISOString(), idx: i })));
     if (m[2] === 'submit') { mine.status = 'SUBMITTED'; return send(201, mine); }
     if (m[2] === 'inspection') return send(200, { caseStatus: mine.status, inspection: null });
     if (m[2] === 'certificate') return send(200, { certificate: null });
     if (m[2] === 'evidence-requests') return send(200, []);
    }
    if (path === '/v1/properties') return send(200, [{ id: PROP, address: 'Via Portafoglio 3', city: 'Bologna', region: 'Emilia-Romagna', floorAreaM2: 90 }, ...Object.values(createdProps)]);
    if (path === '/v1/cases') return send(200, [{ id: CASE, propertyId: PROP, status: 'INSPECTION_SCHEDULED', createdAt: new Date().toISOString() }, ...(org === ORG_A ? [{ id: CERT_CASE, propertyId: PROP, status: certificate.deliveredAt ? 'DELIVERED' : 'DEPOSITED', createdAt: certificate.depositedAt }] : []), ...created.map(({ id, propertyId, status, createdAt }) => ({ id, propertyId, status, createdAt }))]);
    if (path === '/v1/members') return send(200, [{ id: randomUUID(), userSubject: 'synthetic-certifier', role: 'owner', active: true, createdAt: new Date().toISOString() }]);
    if (path === '/v1/invitations' && req.method === 'POST') {
     const body = JSON.parse(await readBody(req));
     const inv = { id: randomUUID(), role: body.role, createdBy: 'synthetic-certifier', expiresAt: new Date(Date.now() + body.ttlHours * 3600_000).toISOString(), createdAt: new Date().toISOString() };
     invitations.push(inv);
     return send(201, { ...inv, code: 'SYNTHETICINVITECODE' + 'x'.repeat(24) });
    }
    if (path === '/v1/invitations') return send(200, invitations);
   }
   if (path === '/v1/certifier/inspection-schema') return send(200, { fields: { 'windows.glazing': { label: 'Vetro serramenti', kind: 'enum', values: ['singolo', 'doppio'] } }, statuses: ['verified', 'to_verify', 'undeterminable'], sources: ['inspection'] });
   send(404, {});
  });
  await new Promise<void>(r => api.listen(0, '127.0.0.1', () => r()));
  apiBase = `https://localhost:${(api.address() as AddressInfo).port}`;

  const port = 3200 + Math.floor(Math.random() * 500);
  web = `http://localhost:${port}`;
  next = spawn(process.execPath, [resolve(__dirname, '../../../node_modules/next/dist/bin/next'), 'start', '-p', String(port)], {
   cwd: resolve(__dirname, '..'),
   env: { ...process.env, NODE_EXTRA_CA_CERTS: join(dir, 'c.pem'), OIDC_ISSUER: issuer, WEB_OIDC_CLIENT_ID: 'ape-web-e2e', WEB_BASE_URL: web, API_BASE_URL: apiBase, WEB_SESSION_KEY: randomBytes(32).toString('base64'), NEXT_TELEMETRY_DISABLED: '1' },
   stdio: ['ignore', 'inherit', 'inherit'],
  });
  for (let i = 0; i < 80; i++) { try { if ((await fetch(web + '/')).ok) break; } catch { /* starting */ } await new Promise(r => setTimeout(r, 250)); }
  browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
 }, 90_000);

 afterAll(async () => {
  await browser?.close();
  next?.kill('SIGTERM');
  idp?.close(); api?.close();
 });

 it('logs in through the system flow, keeps tokens out of the browser, accepts an offer and logs out', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true }); // only the fake IdP uses the throwaway certificate
  const page = await ctx.newPage();
  await page.goto(web + '/');
  await page.getByText('Accedi come certificatore').click();
  await page.waitForURL(web + '/certifier');
  await page.getByText('Offerte (1)').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('Comune Test (Emilia-Romagna)').waitFor({ state: 'visible', timeout: 15_000 });
  expect(await page.content()).not.toContain('Via Sintetica 9'); // address hidden before acceptance

  // Tokens: one PKCE-verified exchange, session cookie HttpOnly, nothing readable by page scripts.
  expect(state).toMatchObject({ tokenRequests: 1, pkceFailures: 0, apiAuthFailures: 0 });
  const cookies = await ctx.cookies();
  const session = cookies.find(c => c.name === '__Host-ape_session')!;
  expect(session).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
  expect(cookies.find(c => c.name === '__Host-ape_login')).toBeUndefined(); // single-use login state removed
  expect(await page.evaluate(() => document.cookie)).toBe('');
  expect(await page.content()).not.toContain(ACCESS_TOKEN);
  expect(Buffer.from(session.value, 'base64url').toString('latin1')).not.toContain(ACCESS_TOKEN);

  await page.getByRole('button', { name: 'Accetta' }).click(); // Server Action
  await page.waitForURL(web + `/certifier/${ASSIGNMENT}`);
  await page.getByText('Via Sintetica 9, Comune Test').first().waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('Sopralluogo').first().waitFor({ state: 'visible', timeout: 15_000 });
  expect(state.accepted).toBe(true);

  await page.goto(web + '/certifier');
  await page.getByRole('button', { name: 'Esci' }).click();
  await page.waitForURL(web + '/');
  expect((await ctx.cookies()).find(c => c.name === '__Host-ape_session')).toBeUndefined();
  // Without a session the protected page redirects to login (checked without following redirects).
  const after = await ctx.request.get(web + '/certifier', { maxRedirects: 0 });
  expect([303, 307]).toContain(after.status());
  expect(after.headers()['location']).toContain('/auth/login');
  await ctx.close();
 }, 60_000);

 it('rejects a forged callback (state mismatch) without creating a session', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  const before = state.tokenRequests;
  await page.goto(web + '/auth/callback?code=forged&state=attacker');
  await page.waitForURL(web + '/?login=failed');
  expect((await ctx.cookies()).find(c => c.name === '__Host-ape_session')).toBeUndefined();
  expect(state.tokenRequests).toBe(before);
  await ctx.close();
 });

 it('organization area: choose organization, portfolio, one-time invitation code', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(web + '/auth/login?returnTo=/org');
  await page.waitForURL(web + '/org');
  await page.getByText("Scegli l'organizzazione").waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('form', { hasText: 'Studio Alfa' }).getByRole('button', { name: 'Apri' }).click();
  await page.waitForURL(web + '/org');
  await page.getByText('Via Portafoglio 3, Bologna').waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByText('Sopralluogo programmato').first().waitFor({ state: 'visible', timeout: 15_000 });
  const orgCookie = (await ctx.cookies()).find(c => c.name === '__Host-ape_org');
  expect(orgCookie).toMatchObject({ value: ORG_A, httpOnly: true, secure: true });
  expect(orgHeaders.every(h => h === ORG_A)).toBe(true);

  await page.getByRole('link', { name: 'Membri e inviti' }).click();
  await page.waitForURL(web + '/org/members');
  await page.locator('select[name=role]').last().selectOption('member');
  await page.getByRole('button', { name: 'Crea invito' }).click();
  await page.getByText('mostrato').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('code', { hasText: 'SYNTHETICINVITECODE' }).waitFor({ state: 'visible', timeout: 15_000 });
  expect(invitations).toHaveLength(1);
  await page.reload();
  expect(await page.content()).not.toContain('SYNTHETICINVITECODE'); // shown once, never persisted by the portal
  await page.getByText('Inviti in attesa (1)').waitFor({ state: 'visible', timeout: 15_000 });

  // A forged preference for an organization the user does not belong to is ignored.
  await ctx.addCookies([{ name: '__Host-ape_org', value: randomUUID(), domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
  await page.goto(web + '/org');
  await page.getByText("Scegli l'organizzazione").waitFor({ state: 'visible', timeout: 15_000 });
  await ctx.close();
 }, 60_000);

 it('professional creates, documents and submits a case from the web', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  await page.goto(web + '/auth/login?returnTo=/org');
  await page.waitForURL(web + '/org');
  await page.locator('form', { hasText: 'Studio Alfa' }).getByRole('button', { name: 'Apri' }).click();
  await page.getByRole('link', { name: 'Nuova pratica' }).click();
  await page.waitForURL(web + '/org/new');
  await page.locator('input[name=address]').fill('Via Nuova 12');
  await page.locator('input[name=city]').fill('Imola');
  await page.locator('input[name=floorAreaM2]').fill('72,5');
  await page.getByRole('button', { name: 'Crea bozza' }).click();
  await page.waitForURL(u => /\/org\/cases\/[0-9a-f-]{36}/.test(u.toString()));
  expect(created).toHaveLength(1);
  expect(Object.values(createdProps)[0]).toMatchObject({ address: 'Via Nuova 12', city: 'Imola', region: 'Emilia-Romagna', floorAreaM2: 72.5 });
  await page.getByText('Via Nuova 12, Imola').first().waitFor({ state: 'visible', timeout: 15_000 });

  // Upload without consent is refused by the API and explained to the user.
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('synthetic')]);
  await page.locator('select[name=kind]').selectOption('window');
  await page.locator('input[type=file]').setInputFiles({ name: 'serramento.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Carica' }).click();
  await page.getByText("Serve il consenso").waitFor({ state: 'visible', timeout: 15_000 });
  await page.getByRole('button', { name: 'Ho letto e acconsento' }).click();
  await page.getByText('Consenso registrato').waitFor({ state: 'visible', timeout: 15_000 });
  await page.locator('select[name=kind]').selectOption('window');
  await page.locator('input[type=file]').setInputFiles({ name: 'serramento.png', mimeType: 'image/png', buffer: png });
  await page.getByRole('button', { name: 'Carica' }).click();
  await page.getByText('File caricato.').waitFor({ state: 'visible', timeout: 15_000 });
  expect(created[0].uploads).toEqual([expect.objectContaining({ kind: 'window' })]);

  await page.getByRole('button', { name: 'Invia la richiesta' }).click();
  await page.getByText('Richiesta inviata').waitFor({ state: 'visible', timeout: 15_000 });
  expect(created[0].status).toBe('SUBMITTED');
  await ctx.close();
 }, 60_000);

 it('verifies PDF bytes in Chrome, refuses stale tenant and corrupted downloads, then confirms receipt', async () => {
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, acceptDownloads: true });
  const page = await ctx.newPage();
  try {
   await page.goto(web + '/auth/login?returnTo=/org');
   await page.waitForURL(web + '/org');
   await page.locator('form', { hasText: 'Studio Alfa' }).getByRole('button', { name: 'Apri' }).click();
   await page.goto(web + '/org/cases/' + CERT_CASE);
   const button = page.getByRole('button', { name: 'Scarica l’APE (PDF)' });
   await button.waitFor({ state: 'visible', timeout: 15_000 });
   await page.getByText('Ricezione non ancora confermata.').waitFor({ state: 'visible' });
   expect(await page.evaluate(() => !!crypto.subtle)).toBe(true);
   const direct = await ctx.request.get(web + '/org/cases/' + CERT_CASE + '/certificate');
   expect(direct.status()).toBe(403);
   expect(receiptState.reads).toBe(0);

   // Keep the old page open while switching organization in the shared browser session.
   await ctx.addCookies([{ name: '__Host-ape_org', value: ORG_B, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
   await button.click();
   await page.getByText('Download o conferma non riusciti. Riprova.').waitFor({ state: 'visible' });
   expect(receiptState.reads).toBe(0);
   expect(receiptState.receipts).toBe(0);

   await ctx.addCookies([{ name: '__Host-ape_org', value: ORG_A, domain: 'localhost', path: '/', secure: true, httpOnly: true, sameSite: 'Lax' }]);
   await page.reload();
   receiptState.corrupt = true;
   await button.click();
   await page.getByText('Download o conferma non riusciti. Riprova.').waitFor({ state: 'visible' });
   expect(receiptState.reads).toBe(1);
   expect(receiptState.receipts).toBe(0);
   expect(certificate.deliveredAt).toBeNull();

   receiptState.corrupt = false;
   const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
   await button.click();
   const download = await downloadPromise;
   expect(download.suggestedFilename()).toBe('APE-' + CERT_CASE + '.pdf');
   const downloadedPath = await download.path();
   expect(readFileSync(downloadedPath)).toEqual(pdf);
   expect(receiptState.reads).toBe(2);
   expect(receiptState.receipts).toBe(1);
   await page.getByText('Ricezione registrata il', { exact: false }).waitFor({ state: 'visible', timeout: 15_000 });
  } finally {
   receiptState.corrupt = false;
   await ctx.close();
  }
 }, 60_000);

 it('serves security headers on pages', async () => {
  const res = await fetch(web + '/');
  expect(res.headers.get('x-frame-options')).toBe('DENY');
  expect(res.headers.get('referrer-policy')).toBe('no-referrer');
  expect(res.headers.get('x-powered-by')).toBeNull();
 });
});
