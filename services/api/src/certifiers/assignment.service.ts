import type { Prisma } from '@prisma/client';
import { OFFER_TTL_HOURS, rankCandidates, type Candidate } from './matching';

type Tx = Prisma.TransactionClient;
export const MATCHING_ACTOR = 'system:matching';

/**
 * Offers the case to the best eligible certifier (inside the caller's transaction).
 * Returns the assignment id, or null when no certifier is eligible (the case stays SUBMITTED).
 */
export async function offerNext(tx: Tx, caseId: string, now = new Date()): Promise<string | null> {
 const apeCase = await tx.apeCase.findUniqueOrThrow({ where: { id: caseId }, include: { property: { select: { region: true } } } });
 const [members, previous, certifiers] = await Promise.all([
  tx.membership.findMany({ where: { organizationId: apeCase.organizationId }, select: { userSubject: true } }),
  tx.assignment.findMany({ where: { caseId }, select: { certifierId: true } }),
  tx.certifier.findMany({ where: { active: true, verifiedAt: { not: null } } }),
 ]);
 const load = await tx.assignment.groupBy({
  by: ['certifierId'],
  where: { certifierId: { in: certifiers.map(c => c.id) }, OR: [{ status: 'ACCEPTED' }, { status: 'OFFERED', expiresAt: { gt: now } }] },
  _count: { _all: true },
 });
 const loadBy = new Map(load.map(l => [l.certifierId, l._count._all]));
 const candidates: Candidate[] = certifiers.map(c => ({ ...c, activeAssignments: loadBy.get(c.id) ?? 0 }));
 const [best] = rankCandidates(candidates, {
  region: apeCase.property.region,
  requesterSubjects: new Set(members.map(m => m.userSubject)),
  previouslyOffered: new Set(previous.map(p => p.certifierId)),
 });
 if (!best) {
  await tx.auditEvent.create({ data: { organizationId: apeCase.organizationId, actorId: MATCHING_ACTOR, action: 'assignment.no_candidate', resourceId: caseId } });
  return null;
 }
 const a = await tx.assignment.create({
  data: { caseId, certifierId: best.id, organizationId: apeCase.organizationId, expiresAt: new Date(now.getTime() + OFFER_TTL_HOURS * 3600_000) },
 });
 await tx.auditEvent.create({ data: { organizationId: apeCase.organizationId, actorId: MATCHING_ACTOR, action: 'assignment.offer', resourceId: a.id } });
 return a.id;
}

/** Marks stale offers as EXPIRED and re-offers each affected case (fallback to next eligible). */
export async function expireStaleOffers(tx: Tx, now = new Date()): Promise<number> {
 const stale = await tx.assignment.findMany({ where: { status: 'OFFERED', expiresAt: { lte: now } }, select: { id: true, caseId: true, organizationId: true } });
 for (const s of stale) {
  const res = await tx.assignment.updateMany({ where: { id: s.id, status: 'OFFERED' }, data: { status: 'EXPIRED', respondedAt: now } });
  if (res.count !== 1) continue;
  await tx.auditEvent.create({ data: { organizationId: s.organizationId, actorId: MATCHING_ACTOR, action: 'assignment.expire', resourceId: s.id } });
  const open = await tx.assignment.count({ where: { caseId: s.caseId, OR: [{ status: 'ACCEPTED' }, { status: 'OFFERED', expiresAt: { gt: now } }] } });
  if (open === 0) await offerNext(tx, s.caseId, now);
 }
 return stale.length;
}
