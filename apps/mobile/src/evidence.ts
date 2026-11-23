import type { RequestStep } from './workflow';

export type EvidenceKind = 'boiler' | 'heating' | 'envelope' | 'window' | 'floorplan' | 'document' | 'video';
export type PickedFile = { uri: string; name: string; mimeType: string; size?: number };
export type EvidenceRecord = { id: string; caseId: string; kind: EvidenceKind; mimeType: string; sizeBytes: number; scanStatus: string; createdAt: string };

export const STEP_EVIDENCE: Partial<Record<RequestStep, EvidenceKind[]>> = {
 heating: ['boiler', 'heating'],
 envelope: ['envelope', 'window'],
 documents: ['floorplan', 'document'],
};
export const KIND_LABELS: Record<EvidenceKind, string> = {
 boiler: 'Caldaia e targhetta',
 heating: 'Radiatori / terminali',
 envelope: 'Pareti e sezioni',
 window: 'Serramenti',
 floorplan: 'Planimetria',
 document: 'Libretto impianto / altri documenti',
 video: 'Video dell’immobile',
};
/** Kinds that accept PDF (mirrors the server policy; the server remains authoritative). */
export const PDF_KINDS: EvidenceKind[] = ['floorplan', 'document'];
export const CLIENT_MAX_BYTES = 15 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/heic', 'image/heif'];

/** Fast client-side pre-check to give immediate feedback; never a substitute for server validation. */
export function precheckFile(kind: EvidenceKind, f: PickedFile): string | null {
 if (f.size !== undefined && f.size > CLIENT_MAX_BYTES) return 'Il file supera 15 MB.';
 const mime = f.mimeType.toLowerCase();
 if (mime === 'application/pdf') return PDF_KINDS.includes(kind) ? null : 'Per questa voce servono fotografie, non PDF.';
 if (!IMAGE_TYPES.includes(mime)) return 'Formato non supportato: usa JPEG, PNG, HEIC o PDF.';
 return null;
}

export function countByKind(items: EvidenceRecord[]): Partial<Record<EvidenceKind, number>> {
 const out: Partial<Record<EvidenceKind, number>> = {};
 for (const i of items) out[i.kind] = (out[i.kind] ?? 0) + 1;
 return out;
}
