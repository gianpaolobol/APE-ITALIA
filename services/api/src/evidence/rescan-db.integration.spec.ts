import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { EncryptedFileStorage, evidenceStorageKey } from './storage';
import { rescanPending } from './rescan';

const enabled = process.env.RUN_DB_INTEGRATION === '1';
describe.skipIf(!enabled)('PostgreSQL: rescan of files stored before the scanner existed', () => {
 const db = enabled ? new PrismaClient() : (null as unknown as PrismaClient);
 const org = randomUUID();
 afterAll(async () => {
  await db.auditEvent.deleteMany({ where: { organizationId: org } });
  await db.evidence.deleteMany({ where: { organizationId: org } });
  await db.apeCase.deleteMany({ where: { organizationId: org } });
  await db.property.deleteMany({ where: { organizationId: org } });
  await db.organization.deleteMany({ where: { id: org } });
  await db.$disconnect();
 });
 it('marks clean and infected files and quarantines with audit', async () => {
  const storage = new EncryptedFileStorage(await mkdtemp(join(tmpdir(), 'ape-rescan-')), randomBytes(32));
  await db.organization.create({ data: { id: org, name: 'Rescan tenant' } });
  const p = await db.property.create({ data: { organizationId: org, address: 'Via Scan', city: 'Bologna', region: 'Regione-Rescan' } });
  const c = await db.apeCase.create({ data: { organizationId: org, propertyId: p.id } });
  const ids: string[] = [];
  for (const content of ['clean-content', 'SYNTHETIC-MALWARE']) {
   const id = randomUUID(); ids.push(id);
   const key = evidenceStorageKey(org, c.id, id);
   await storage.put(key, Buffer.from(content));
   await db.evidence.create({ data: { id, caseId: c.id, organizationId: org, kind: 'document', storageKey: key, mimeType: 'application/pdf', sizeBytes: content.length, sha256: id, uploadedBy: 'u' } });
  }
  const scanner = { scan: async (b: Buffer) => (b.includes(Buffer.from('SYNTHETIC-MALWARE')) ? 'infected' as const : 'clean' as const) };
  const r = await rescanPending(db, storage, scanner, 1000, { organizationId: org });
  expect(r).toEqual({ clean: 1, infected: 1 });
  const rows = await db.evidence.findMany({ where: { id: { in: ids } }, orderBy: { sizeBytes: 'asc' } });
  expect(rows.map(x => x.scanStatus).sort()).toEqual(['clean', 'infected']);
  expect(await db.auditEvent.count({ where: { organizationId: org, action: 'evidence.quarantine' } })).toBe(1);
 });
});
