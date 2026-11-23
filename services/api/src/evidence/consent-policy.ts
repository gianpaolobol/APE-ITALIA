/**
 * Versioned notices. The texts are DRAFTS pending legal review (GDPR art. 13): a new version
 * requires fresh consent before further uploads.
 */
export const CURRENT_NOTICES = {
 evidence_processing: '2026-11-23-draft',
} as const;
export type ConsentKind = keyof typeof CURRENT_NOTICES;
export function isCurrentNotice(kind: unknown, version: unknown): kind is ConsentKind {
 return typeof kind === 'string' && Object.hasOwn(CURRENT_NOTICES, kind) && typeof version === 'string' && CURRENT_NOTICES[kind as ConsentKind] === version;
}
/** Case states in which new evidence may still be added. */
export const UPLOAD_OPEN_STATUSES = ['DRAFT', 'SUBMITTED', 'AWAITING_EVIDENCE', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'INSPECTION_DONE', 'UNDER_REVIEW'] as const;
