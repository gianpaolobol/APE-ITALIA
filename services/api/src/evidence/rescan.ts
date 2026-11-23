import type { PrismaClient } from '@prisma/client';
import type { MalwareScanner } from './file-policy';
import type { ObjectStorage } from './storage';

/**
 * Scans files stored while no scanner was available. Infected files become "infected" (download 410)
 * and are recorded in the audit trail; scanner errors stop the batch and leave files unscanned.
 */
export async function rescanPending(db: PrismaClient, storage: ObjectStorage, scanner: MalwareScanner, batch = 50, scope: { organizationId?: string } = {}) {
 const result = { clean: 0, infected: 0 };
 const evidence = await db.evidence.findMany({ where: { scanStatus: 'unscanned', ...scope }, select: { id: true, storageKey: true, organizationId: true }, take: batch, orderBy: { createdAt: 'asc' } });
 const certs = await db.certificate.findMany({ where: { scanStatus: 'unscanned', ...scope }, select: { id: true, storageKey: true, organizationId: true }, take: batch, orderBy: { uploadedAt: 'asc' } });
 for (const [kind, rows] of [['evidence', evidence], ['certificate', certs]] as const) {
  for (const r of rows) {
   const status = await scanner.scan(await storage.get(r.storageKey));
   if (status === 'unscanned') return result; // scanner not configured
   if (kind === 'evidence') await db.evidence.updateMany({ where: { id: r.id, scanStatus: 'unscanned' }, data: { scanStatus: status } });
   else await db.certificate.updateMany({ where: { id: r.id, scanStatus: 'unscanned' }, data: { scanStatus: status } });
   if (status === 'infected') await db.auditEvent.create({ data: { organizationId: r.organizationId, actorId: 'system:antivirus', action: `${kind}.quarantine`, resourceId: r.id } });
   result[status]++;
  }
 }
 return result;
}
