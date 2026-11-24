import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { CertificateController } from './certificate.controller';

const pdf = Buffer.from('%PDF-1.7\nsynthetic certificate');
const sha256 = createHash('sha256').update(pdf).digest('hex');
const cert = { id: 'certificate-id', storageKey: 'private-key', scanStatus: 'clean', sha256, sizeBytes: pdf.length };

function fixture(data: Buffer, row = cert) {
 vi.stubEnv('STRIPE_SECRET_KEY', '');
 const tx = {
  certificate: { updateMany: vi.fn(async () => ({ count: 1 })) },
  apeCase: { updateMany: vi.fn(async () => ({ count: 1 })) },
  auditEvent: { create: vi.fn(async () => ({})) },
 };
 const db = {
  certificate: { findFirst: vi.fn(async () => row) },
  $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
 };
 const storage = { get: vi.fn(async () => data), put: vi.fn(), delete: vi.fn() };
 const auth = { authorize: vi.fn(async () => ({ organizationId: 'tenant', actorId: 'user', role: 'owner' })) };
 const controller = new CertificateController(db as never, auth as never, storage);
 return { controller, db, tx, storage };
}

afterEach(() => vi.unstubAllEnvs());

describe('certificate download integrity', () => {
 it('refuses an altered object of the same length without recording delivery', async () => {
  const altered = Buffer.from(pdf); altered[altered.length - 1] ^= 1;
  const f = fixture(altered);
  await expect(f.controller.content('case', 'Bearer test', 'tenant')).rejects.toThrow('Stored document integrity check failed');
  expect(f.db.$transaction).not.toHaveBeenCalled();
 });
 it('refuses a truncated object without recording delivery', async () => {
  const f = fixture(pdf.subarray(0, pdf.length - 1));
  await expect(f.controller.content('case', 'Bearer test', 'tenant')).rejects.toThrow('Stored document integrity check failed');
  expect(f.db.$transaction).not.toHaveBeenCalled();
 });
 it('allows the exact deposited bytes and records the authorized retrieval', async () => {
  const f = fixture(pdf);
  const file = await f.controller.content('case', 'Bearer test', 'tenant');
  const chunks: Buffer[] = [];
  for await (const chunk of file.getStream()) chunks.push(Buffer.from(chunk));
  expect(Buffer.concat(chunks)).toEqual(pdf);
  expect(f.db.certificate.findFirst).toHaveBeenCalledWith({ where: { caseId: 'case', organizationId: 'tenant' } });
  expect(f.tx.certificate.updateMany).toHaveBeenCalledOnce();
  expect(f.tx.auditEvent.create).toHaveBeenCalledWith({ data: { organizationId: 'tenant', actorId: 'user', action: 'certificate.deliver', resourceId: cert.id } });
 });
});
