import type { ApeApi } from './api';

export const STATUS_LABELS: Record<string, string> = {
 DRAFT: 'Bozza', SUBMITTED: 'Inviata, in attesa di certificatore', AWAITING_EVIDENCE: 'Integrazioni richieste', ASSIGNED: 'Certificatore assegnato',
 INSPECTION_SCHEDULED: 'Sopralluogo programmato', INSPECTION_DONE: 'Sopralluogo eseguito', UNDER_REVIEW: 'In verifica',
 DEPOSITED: 'APE depositato: disponibile', DELIVERED: 'APE consegnato', CANCELLED: 'Annullata',
};
/** Ordered progress steps shown to customers; the last ones depend on the certifier. */
export const PROGRESS = ['DRAFT', 'SUBMITTED', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'INSPECTION_DONE', 'DEPOSITED', 'DELIVERED'] as const;

export type CaseSummaryRecord = {
 id: string; status: string; createdAt: string;
 property: { address: string; city: string; region: string };
 inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null;
 certificate: { regionalId: string; depositedAt: string; deliveredAt: string | null } | null;
 openEvidenceRequests: number;
};
export type CaseSummary = CaseSummaryRecord & { label: string; step: number };

export function progressStep(status: string): number {
 const i = (PROGRESS as readonly string[]).indexOf(status);
 return i === -1 ? 0 : i;
}

/** Single API call (no N+1): the server joins property, inspection and certificate. */
export async function loadCaseSummaries(api: ApeApi): Promise<CaseSummary[]> {
 const rows = await api.caseSummaries();
 return rows.map(r => ({ ...r, label: STATUS_LABELS[r.status] ?? r.status, step: progressStep(r.status) }));
}
