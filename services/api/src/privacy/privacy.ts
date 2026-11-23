import type { PrismaClient } from '@prisma/client';
import type { ObjectStorage } from '../evidence/storage';

/**
 * Data subject access/portability (GDPR art. 15 and 20) for an OIDC subject: everything the platform
 * links to that identifier. Operator-run; the response must be delivered through a verified channel.
 */
export async function exportSubjectData(db: PrismaClient, subject: string) {
 if (!/^[\x21-\x7e]{1,255}$/.test(subject)) throw new Error('Invalid subject');
 const [memberships, consents, evidence, certifier, audit, invitationsAccepted] = await Promise.all([
  db.membership.findMany({ where: { userSubject: subject }, select: { organizationId: true, role: true, active: true, createdAt: true, organization: { select: { name: true } } } }),
  db.consent.findMany({ where: { subject }, select: { caseId: true, kind: true, version: true, acceptedAt: true } }),
  db.evidence.findMany({ where: { uploadedBy: subject }, select: { id: true, caseId: true, kind: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true } }),
  db.certifier.findUnique({ where: { userSubject: subject }, select: { displayName: true, registrationId: true, regions: true, verifiedAt: true, createdAt: true } }),
  db.auditEvent.findMany({ where: { OR: [{ actorId: subject }, { actorId: `certifier:${subject}` }] }, select: { action: true, resourceId: true, occurredAt: true, organizationId: true }, orderBy: { occurredAt: 'asc' }, take: 10_000 }),
  db.invitation.findMany({ where: { acceptedBy: subject }, select: { organizationId: true, role: true, acceptedAt: true } }),
 ]);
 return {
  subject, generatedAt: new Date().toISOString(),
  memberships: memberships.map(m => ({ organizationId: m.organizationId, organizationName: m.organization.name, role: m.role, active: m.active, since: m.createdAt })),
  consents, uploadedEvidence: evidence, certifierProfile: certifier, invitationsAccepted, auditTrail: audit,
  note: 'Files are not embedded: they can be provided on request after identity verification. Case data of organizations is held by the organization as controller.',
 };
}

export type RetentionPolicy = { cancelledCaseEvidenceDays: number; closedCaseEvidenceDays: number };
/** Defaults are placeholders pending legal review (MASTER_PLAN §12): adjust via environment. */
export function retentionPolicyFromEnv(env = process.env): RetentionPolicy {
 const n = (v: string | undefined, d: number) => { const x = Number(v); return Number.isInteger(x) && x >= 30 ? x : d; };
 return { cancelledCaseEvidenceDays: n(env.RETENTION_CANCELLED_EVIDENCE_DAYS, 90), closedCaseEvidenceDays: n(env.RETENTION_DELIVERED_EVIDENCE_DAYS, 730) };
}

/**
 * Deletes evidence files and metadata past retention: cancelled cases after N days from last update,
 * delivered cases after M days. Certificates (the APE) and audit events are kept. Dry run by default.
 */
export async function purgeExpiredEvidence(db: PrismaClient, storage: ObjectStorage | null, policy: RetentionPolicy, opts: { now?: Date; apply?: boolean } = {}) {
 const now = opts.now ?? new Date();
 const day = 86400_000;
 const cases = await db.apeCase.findMany({
  where: { OR: [
   { status: 'CANCELLED', updatedAt: { lt: new Date(now.getTime() - policy.cancelledCaseEvidenceDays * day) } },
   { status: 'DELIVERED', updatedAt: { lt: new Date(now.getTime() - policy.closedCaseEvidenceDays * day) } },
  ] },
  select: { id: true, organizationId: true, status: true },
 });
 const report: { caseId: string; status: string; files: number }[] = [];
 for (const c of cases) {
  const files = await db.evidence.findMany({ where: { caseId: c.id }, select: { id: true, storageKey: true } });
  if (!files.length) continue;
  report.push({ caseId: c.id, status: c.status, files: files.length });
  if (!opts.apply) continue;
  if (!storage) throw new Error('Storage not configured: cannot delete objects');
  for (const f of files) await storage.delete(f.storageKey);
  await db.$transaction(async tx => {
   const ids = files.map(f => f.id);
   const fields = await tx.extractedField.findMany({ where: { evidenceId: { in: ids } }, select: { id: true } });
   await tx.extractedFieldRevision.deleteMany({ where: { extractedFieldId: { in: fields.map(f => f.id) } } });
   await tx.extractedField.deleteMany({ where: { evidenceId: { in: ids } } });
   await tx.evidence.deleteMany({ where: { id: { in: ids } } });
   await tx.auditEvent.create({ data: { organizationId: c.organizationId, actorId: 'system:retention', action: 'evidence.purge', resourceId: c.id } });
  });
 }
 return { applied: !!opts.apply, policy, cases: report };
}
