import type { PrismaClient } from '@prisma/client';

/**
 * Quality metrics per field and model (MASTER_PLAN §10): share of candidates accepted, corrected and
 * rejected by certifiers. Aggregates only; no values or personal data are returned.
 */
export async function extractionMetrics(db: PrismaClient) {
 const rows = await db.extractedField.groupBy({ by: ['modelId', 'field', 'status'], _count: { _all: true } });
 const out = new Map<string, { modelId: string; field: string; accepted: number; corrected: number; rejected: number; pending: number; correctionRate: number | null }>();
 for (const r of rows) {
  const k = r.modelId + '|' + r.field;
  const m = out.get(k) ?? { modelId: r.modelId, field: r.field, accepted: 0, corrected: 0, rejected: 0, pending: 0, correctionRate: null };
  const n = r._count._all;
  if (r.status === 'accepted') m.accepted += n; else if (r.status === 'corrected') m.corrected += n; else if (r.status === 'rejected') m.rejected += n; else m.pending += n;
  out.set(k, m);
 }
 for (const m of out.values()) {
  const reviewed = m.accepted + m.corrected + m.rejected;
  m.correctionRate = reviewed ? (m.corrected + m.rejected) / reviewed : null;
 }
 return [...out.values()].sort((a, b) => a.modelId.localeCompare(b.modelId) || a.field.localeCompare(b.field));
}
