/**
 * End-to-end: the compiled API process (dist/main.js) against PostgreSQL, verifying RS256 tokens via a
 * remote JWKS served over HTTPS (self-signed CA trusted through NODE_EXTRA_CA_CERTS). Synthetic data only.
 * Run with RUN_E2E=1 after `npm run build`, with DATABASE_URL pointing to a migrated database.
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SignJWT, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { createOrganizationWithOwner, registerVerifiedCertifier } from '../src/admin/provisioning';
import { jpegWithExif, pdfBytes } from '../src/evidence/fixtures';

const enabled = process.env.RUN_E2E === '1';
describe.skipIf(!enabled)('E2E: customer request to certifier export over HTTP', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const dir = enabled ? mkdtempSync(join(tmpdir(), 'ape-e2e-')) : '';
 const REGION = 'Regione-E2E-' + randomUUID().slice(0, 8);
 const customer = 'e2e-customer-' + randomUUID(), certSub = 'e2e-cert-' + randomUUID();
 let jwks: Server, api: ChildProcess, base = '', issuer = '', key: CryptoKey, rogue: CryptoKey, org = '', certifierId = '';
 const tok = (sub: string, k: CryptoKey = key) => new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'e2e' }).setIssuer(issuer).setAudience('ape-italia-api')
  .setSubject(sub).setIssuedAt().setExpirationTime('5m').sign(k);
 const call = async (sub: string, path: string, init: RequestInit & { org?: boolean } = {}) => {
  const headers: Record<string, string> = { Authorization: 'Bearer ' + (await tok(sub)), ...(init.org ? { 'x-organization-id': org } : {}), ...(init.headers as Record<string, string> | undefined) };
  return fetch(base + path, { ...init, headers });
 };
 const json = async (res: Response) => { if (!res.ok) throw new Error(`${res.status} ${await res.text()}`); return res.json(); };

 beforeAll(async () => {
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-subj', '/CN=localhost', '-days', '1', '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1'], { stdio: 'ignore' });
  const pair = await generateKeyPair('RS256');
  key = pair.privateKey;
  rogue = (await generateKeyPair('RS256')).privateKey;
  const body = JSON.stringify({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'e2e', alg: 'RS256', use: 'sig' }] });
  jwks = createServer({ key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) }, (req, res) => {
   if (req.url === '/jwks.json') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(body); } else { res.writeHead(404); res.end(); }
  });
  await new Promise<void>(r => jwks.listen(0, '127.0.0.1', () => r()));
  issuer = `https://localhost:${(jwks.address() as AddressInfo).port}/`;
  org = (await createOrganizationWithOwner(db, { name: 'E2E Studio', ownerSubject: customer, operator: 'ci-e2e' })).organizationId;
  certifierId = (await registerVerifiedCertifier(db, { subject: certSub, displayName: 'E2E Cert', registrationId: 'E2E-1', regions: [REGION], operator: 'ci-e2e' })).id;
  const port = 4000 + Math.floor(Math.random() * 2000);
  api = spawn(process.execPath, [resolve(__dirname, '../dist/main.js')], {
   env: { ...process.env, PORT: String(port), OIDC_ISSUER: issuer, OIDC_AUDIENCE: 'ape-italia-api', OIDC_JWKS_URL: issuer + 'jwks.json',
    NODE_EXTRA_CA_CERTS: join(dir, 'c.pem'), EVIDENCE_STORAGE_DIR: join(dir, 'store'), EVIDENCE_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
    EVIDENCE_ALLOW_UNSCANNED: '1', RATE_LIMIT_PER_MINUTE: '1000', RATE_LIMIT_STORE: 'postgres' },
   stdio: ['ignore', 'inherit', 'inherit'],
  });
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
   try { if ((await fetch(base + '/health')).ok) return; } catch { /* starting */ }
   await new Promise(r => setTimeout(r, 250));
  }
  throw new Error('API did not start');
 }, 60_000);

 afterAll(async () => {
  api?.kill('SIGTERM');
  jwks?.close();
  if (!enabled) return;
  const fields = await db.extractedField.findMany({ where: { organizationId: org }, select: { id: true } });
  await db.extractedFieldRevision.deleteMany({ where: { extractedFieldId: { in: fields.map(f => f.id) } } });
  for (const t of ['certificate', 'extractedField', 'inspection', 'auditEvent', 'assignment', 'evidence', 'consent', 'apeCase', 'property', 'invitation', 'membership'] as const) {
   await (db[t] as unknown as { deleteMany(a: unknown): Promise<unknown> }).deleteMany({ where: { organizationId: org } });
  }
  await db.organization.deleteMany({ where: { id: org } });
  await db.certifier.deleteMany({ where: { id: certifierId } });
  await db.$disconnect();
 });

 it('rejects tokens from an unknown key via the real remote JWKS', async () => {
  const res = await fetch(base + '/v1/me', { headers: { Authorization: 'Bearer ' + (await tok(customer, rogue)) } });
  expect(res.status).toBe(401);
 });

 it('runs the whole journey', async () => {
  const me = await json(await call(customer, '/v1/me'));
  expect(me.memberships).toEqual([{ organizationId: org, organizationName: 'E2E Studio', role: 'owner' }]);

  const property = await json(await call(customer, '/v1/properties', { org: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: 'Via E2E 1', city: 'Comune E2E', region: REGION, floorAreaM2: 70 }) }));
  const apeCase = await json(await call(customer, '/v1/cases', { org: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: property.id }) }));
  const notices = await json(await call(customer, '/v1/notices', { org: true }));
  await json(await call(customer, `/v1/cases/${apeCase.id}/consents`, { org: true, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'evidence_processing', version: notices.evidence_processing }) }));

  const form = new FormData();
  form.append('kind', 'boiler');
  form.append('file', new Blob([new Uint8Array(jpegWithExif())], { type: 'image/jpeg' }), 'caldaia.jpg');
  const evidence = await json(await call(customer, `/v1/cases/${apeCase.id}/evidence`, { org: true, method: 'POST', body: form }));
  expect(evidence.mimeType).toBe('image/jpeg');

  expect((await json(await call(customer, `/v1/cases/${apeCase.id}/submit`, { org: true, method: 'POST' }))).status).toBe('SUBMITTED');

  const [offer] = await json(await call(certSub, '/v1/certifier/assignments'));
  expect(offer.property).toEqual({ city: 'Comune E2E', region: REGION });
  await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/accept`, { method: 'POST' }));

  const files = await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/evidence`));
  const download = await call(certSub, `/v1/certifier/assignments/${offer.id}/evidence/${files[0].id}/content`);
  expect(download.status).toBe(200);
  const bytes = Buffer.from(await download.arrayBuffer());
  expect(bytes.includes(Buffer.from('GPS 44.4949N'))).toBe(false);

  const when = new Date(Date.now() + 3600_000).toISOString();
  await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/inspection`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scheduledAt: when }) }));
  const view = await json(await call(customer, `/v1/cases/${apeCase.id}/inspection`, { org: true }));
  expect(view).toMatchObject({ caseStatus: 'INSPECTION_SCHEDULED', inspection: { certifierName: 'E2E Cert' } });

  const certForm = () => {
   const f = new FormData();
   f.append('regionalId', 'SYNTH-ER-0001');
   f.append('depositedAt', new Date(Date.now() - 60_000).toISOString());
   f.append('declaration', 'true');
   f.append('file', new Blob([new Uint8Array(pdfBytes())], { type: 'application/pdf' }), 'ape.pdf');
   return f;
  };
  expect((await call(certSub, `/v1/certifier/assignments/${offer.id}/certificate`, { method: 'POST', body: certForm() })).status).toBe(409); // before the report

  const report = { performedAt: new Date().toISOString(), attendees: 'Proprietario (sintetico)', declaration: true, findings: [
   { field: 'heating.generator.nominal_power_kw', status: 'verified', value: 24, source: 'photo', evidenceId: files[0].id, note: 'Targhetta confrontata sul posto' },
   { field: 'envelope.wall.insulation', status: 'undeterminable', source: 'inspection', note: 'Nessun saggio' },
  ] };
  expect((await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/inspection/report`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }))).summary).toEqual({ verified: 1, to_verify: 0, undeterminable: 1 });

  const doc = await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/export`));
  expect(doc).toMatchObject({ schema: 'ape-italia/case-export', case: { status: 'INSPECTION_DONE' } });
  expect(doc.inspection.findings[0].evidence.sha256).toBe(files[0].sha256);
  const csv = await call(certSub, `/v1/certifier/assignments/${offer.id}/export?format=csv`);
  expect(csv.headers.get('content-type')).toContain('text/csv');

  // Certificate signed and deposited by the certifier, then delivered to the customer.
  const jpegAsCert = certForm(); jpegAsCert.set('file', new Blob([new Uint8Array(jpegWithExif())], { type: 'application/pdf' }), 'fake.pdf');
  expect((await call(certSub, `/v1/certifier/assignments/${offer.id}/certificate`, { method: 'POST', body: jpegAsCert })).status).toBe(415);
  const uploaded = await json(await call(certSub, `/v1/certifier/assignments/${offer.id}/certificate`, { method: 'POST', body: certForm() }));
  expect(uploaded.regionalId).toBe('SYNTH-ER-0001');
  expect((await call(certSub, `/v1/certifier/assignments/${offer.id}/certificate`, { method: 'POST', body: certForm() })).status).toBe(409);
  const meta = await json(await call(customer, `/v1/cases/${apeCase.id}/certificate`, { org: true }));
  expect(meta.certificate).toMatchObject({ regionalId: 'SYNTH-ER-0001', deliveredAt: null });
  const pdf = await call(customer, `/v1/cases/${apeCase.id}/certificate/content`, { org: true });
  expect(pdf.status).toBe(200);
  expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
  expect((await json(await call(customer, `/v1/cases/${apeCase.id}/inspection`, { org: true }))).caseStatus).toBe('DELIVERED');

  const summaries = await json(await call(customer, '/v1/case-summaries', { org: true }));
  expect(summaries[0]).toMatchObject({ id: apeCase.id, status: 'DELIVERED', property: { city: 'Comune E2E' }, inspection: { status: 'DONE', certifierName: 'E2E Cert' }, certificate: { regionalId: 'SYNTH-ER-0001' } });

  // AI extraction stays disabled in this build.
  expect((await call(certSub, `/v1/certifier/assignments/${offer.id}/evidence/${files[0].id}/extract`, { method: 'POST' })).status).toBe(503);

  const actions = (await db.auditEvent.findMany({ where: { organizationId: org }, select: { action: true } })).map(a => a.action);
  for (const a of ['property.create', 'case.create', 'consent.accept', 'evidence.upload', 'case.submit', 'assignment.offer', 'assignment.accept', 'evidence.read', 'inspection.schedule', 'inspection.report', 'case.export', 'certificate.upload', 'certificate.deliver']) expect(actions).toContain(a);
 }, 60_000);

 it('keeps other tenants out over HTTP', async () => {
  const other = 'e2e-outsider-' + randomUUID();
  const res = await fetch(base + '/v1/properties', { headers: { Authorization: 'Bearer ' + (await tok(other)), 'x-organization-id': org } });
  expect(res.status).toBe(403);
 });
});
