import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Module, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { EVIDENCE_STORAGE, EvidenceController, MALWARE_SCANNER } from './evidence.controller';
import { EncryptedFileStorage } from './storage';
import { notConfiguredScanner, MAX_EVIDENCE_BYTES } from './file-policy';
import { CURRENT_NOTICES } from './consent-policy';
import { PrismaService } from '../prisma.service';
import { AuthService } from '../auth.service';
import { jpegWithExif, pdfBytes } from './fixtures';

/** Real Nest + multer over HTTP; database and identity are in-memory fakes, storage is real (encrypted temp dir). */
const ORG = randomUUID(), CASE = randomUUID(), OTHER_CASE = randomUUID();
const rows = { evidence: [] as Record<string, unknown>[], consent: [] as Record<string, unknown>[], audit: [] as Record<string, unknown>[] };
const roleBySubject: Record<string, string> = { writer: 'member', reader: 'viewer' };
const fakeDb = {
 apeCase: { findFirst: async ({ where }: any) => (where.id === CASE && where.organizationId === ORG ? { id: CASE, organizationId: ORG, status: 'DRAFT' } : null) },
 consent: {
  findUnique: async ({ where }: any) => rows.consent.find(c => c.caseId === where.caseId_subject_kind_version.caseId && c.subject === where.caseId_subject_kind_version.subject && c.kind === where.caseId_subject_kind_version.kind && c.version === where.caseId_subject_kind_version.version) ?? null,
  createMany: async ({ data, skipDuplicates }: any) => {
   const exists = rows.consent.some(c => c.caseId === data.caseId && c.subject === data.subject && c.kind === data.kind && c.version === data.version);
   if (exists && skipDuplicates) return { count: 0 };
   if (exists) throw new Error('Duplicate consent');
   rows.consent.push({ ...data, acceptedAt: new Date() });
   return { count: 1 };
  },
  findUniqueOrThrow: async ({ where }: any) => {
   const key = where.caseId_subject_kind_version;
   const row = rows.consent.find(c => c.caseId === key.caseId && c.subject === key.subject && c.kind === key.kind && c.version === key.version);
   if (!row) throw new Error('Consent not found');
   return row;
  },
 },
 evidence: {
  findUnique: async ({ where }: any) => rows.evidence.find(e => e.caseId === where.caseId_sha256.caseId && e.sha256 === where.caseId_sha256.sha256) ?? null,
  findFirst: async ({ where }: any) => rows.evidence.find(e => e.id === where.id && e.organizationId === where.organizationId) ?? null,
  findMany: async ({ where }: any) => rows.evidence.filter(e => e.caseId === where.caseId && e.organizationId === where.organizationId),
  create: async ({ data, select }: any) => {
   const row = { ...data, createdAt: new Date() }; rows.evidence.push(row);
   return select ? Object.fromEntries(Object.keys(select).map(k => [k, row[k]])) : row; // mimic Prisma select
  },
 },
 auditEvent: { create: async ({ data }: any) => { rows.audit.push(data); return data; } },
 $transaction: async (fn: (tx: unknown) => unknown) => fn(fakeDb),
};
const fakeAuth = {
 authorize: async (token?: string, org?: string) => {
  const subject = token?.slice(7) ?? '';
  if (!roleBySubject[subject]) { const { UnauthorizedException } = await import('@nestjs/common'); throw new UnauthorizedException(); }
  if (org !== ORG) { const { ForbiddenException } = await import('@nestjs/common'); throw new ForbiddenException(); }
  return { organizationId: ORG, actorId: subject, role: roleBySubject[subject] };
 },
};

let app: INestApplication, base = '', dir = '';
beforeAll(async () => {
 dir = await mkdtemp(join(tmpdir(), 'ape-http-'));
 @Module({
  controllers: [EvidenceController],
  providers: [
   { provide: PrismaService, useValue: fakeDb },
   { provide: AuthService, useValue: fakeAuth },
   { provide: EVIDENCE_STORAGE, useValue: new EncryptedFileStorage(dir, randomBytes(32)) },
   { provide: MALWARE_SCANNER, useValue: notConfiguredScanner },
  ],
 })
 class TestModule {}
 app = await NestFactory.create(TestModule, { logger: false, abortOnError: false });
 await app.listen(0, '127.0.0.1');
 base = (await app.getUrl()).replace('[::1]', '127.0.0.1');
});
afterAll(async () => { await app?.close(); delete process.env.EVIDENCE_ALLOW_UNSCANNED; });

const headers = (sub: string) => ({ Authorization: 'Bearer ' + sub, 'x-organization-id': ORG });
function form(kind: string, data: Buffer, name = 'photo.jpg', type = 'image/jpeg') {
 const f = new FormData();
 f.append('kind', kind);
 f.append('file', new Blob([new Uint8Array(data)], { type }), name);
 return f;
}
const upload = (sub: string, body: FormData, caseId = CASE) => fetch(`${base}/v1/cases/${caseId}/evidence`, { method: 'POST', headers: headers(sub), body });
const consent = (sub: string, version: string = CURRENT_NOTICES.evidence_processing) => fetch(`${base}/v1/cases/${CASE}/consents`, {
 method: 'POST', headers: { ...headers(sub), 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'evidence_processing', version }),
});

describe('evidence upload over HTTP', () => {
 it('requires consent to the current notice before accepting files', async () => {
  expect((await upload('writer', form('boiler', jpegWithExif()))).status).toBe(403);
  expect((await consent('writer', 'outdated')).status).toBe(400);
  const first = await consent('writer');
  expect(first.status).toBe(201);
  const replay = await consent('writer');
  expect(replay.status).toBe(201);
  expect((await replay.json()).id).toBe((await first.json()).id);
  expect(rows.audit.filter(a => a.action === 'consent.accept')).toHaveLength(1);
 });
 it('rejects viewers', async () => {
  expect((await consent('reader')).status).toBe(403);
  expect((await upload('reader', form('boiler', jpegWithExif()))).status).toBe(403);
 });
 it('rejects cases of other tenants with 404', async () => {
  expect((await upload('writer', form('boiler', jpegWithExif()), OTHER_CASE)).status).toBe(404);
 });
 it('rejects files whose content is not an allowed type, whatever the declared type', async () => {
  const res = await upload('writer', form('boiler', Buffer.from('<html><script>alert(1)</script>'), 'boiler.jpg', 'image/jpeg'));
  expect(res.status).toBe(415);
 });
 it('rejects PDF for photo evidence kinds', async () => {
  expect((await upload('writer', form('boiler', pdfBytes(), 'a.pdf', 'application/pdf'))).status).toBe(415);
 });
 it('rejects unknown evidence kinds', async () => {
  expect((await upload('writer', form('selfie', jpegWithExif()))).status).toBe(400);
 });
 it('rejects files over the size limit with 413', async () => {
  const big = Buffer.concat([jpegWithExif(), Buffer.alloc(MAX_EVIDENCE_BYTES)]);
  expect((await upload('writer', form('boiler', big))).status).toBe(413);
 });
 it('stores an encrypted, EXIF-free copy and records audit', async () => {
  const res = await upload('writer', form('boiler', jpegWithExif()));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body).toMatchObject({ kind: 'boiler', mimeType: 'image/jpeg', scanStatus: 'unscanned' });
  expect(body.storageKey).toBeUndefined();
  const files = await readdir(join(dir, 'org', ORG, 'case', CASE));
  const raw = await readFile(join(dir, 'org', ORG, 'case', CASE, files[0]));
  expect(raw.includes(Buffer.from('JFIF'))).toBe(false); // encrypted at rest
  expect(rows.audit.some(a => a.action === 'evidence.upload' && a.resourceId === body.id)).toBe(true);
 });
 it('detects duplicates within the case', async () => {
  expect((await upload('writer', form('boiler', jpegWithExif()))).status).toBe(409);
 });
 it('blocks download of unscanned files unless explicitly allowed, then serves decrypted EXIF-free content', async () => {
  const [ev] = (await (await fetch(`${base}/v1/cases/${CASE}/evidence`, { headers: headers('reader') })).json()) as { id: string }[];
  expect((await fetch(`${base}/v1/evidence/${ev.id}/content`, { headers: headers('reader') })).status).toBe(423);
  process.env.EVIDENCE_ALLOW_UNSCANNED = '1';
  const res = await fetch(`${base}/v1/evidence/${ev.id}/content`, { headers: headers('reader') });
  expect(res.status).toBe(200);
  expect(res.headers.get('content-type')).toBe('image/jpeg');
  expect(res.headers.get('x-content-type-options')).toBe('nosniff');
  expect(res.headers.get('cache-control')).toBe('no-store');
  expect(res.headers.get('content-disposition')).toMatch(/^attachment;/);
  const data = Buffer.from(await res.arrayBuffer());
  expect(data.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
  expect(data.includes(Buffer.from('GPS 44.4949N'))).toBe(false);
  expect(rows.audit.some(a => a.action === 'evidence.read' && a.actorId === 'reader')).toBe(true);
 });
 it('returns 401 without a token', async () => {
  expect((await fetch(`${base}/v1/cases/${CASE}/evidence`)).status).toBe(401);
 });
});
