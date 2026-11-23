import { FINDING_FIELDS, validateFieldValue } from '../inspections/report';

/**
 * Isolated AI/OCR provider port (MASTER_PLAN §8). No provider is enabled: sending property photos to a
 * third party requires a data processing agreement, a privacy assessment and explicit authorization.
 */
export type ExtractionInput = { kind: string; mimeType: string; data: Buffer };
export type RawCandidate = { field: unknown; value: unknown; confidence?: unknown };
export interface ExtractionProvider {
 /** Stable identifier including model version, recorded on every candidate (e.g. "vendor/model@2026-11"). */
 readonly modelId: string;
 extract(input: ExtractionInput): Promise<RawCandidate[]>;
}
export const EXTRACTION_PROVIDER = Symbol('EXTRACTION_PROVIDER');

export type Candidate = { field: string; value: string | number; unit: string | null; confidence: number | null };

/**
 * Provider output is untrusted: only vocabulary fields with valid values survive; confidences are
 * clamped to [0,1]; duplicates keep the first occurrence. Rejected items are counted, never stored.
 */
export function sanitizeCandidates(raw: unknown): { accepted: Candidate[]; rejected: number } {
 const list = Array.isArray(raw) ? raw.slice(0, 100) : [];
 const seen = new Set<string>();
 const accepted: Candidate[] = [];
 let rejected = Array.isArray(raw) ? Math.max(0, raw.length - 100) : 1;
 for (const item of list) {
  const c = item as RawCandidate;
  if (!c || typeof c.field !== 'string' || seen.has(c.field) || validateFieldValue(c.field, c.value) !== null) { rejected++; continue; }
  seen.add(c.field);
  const spec = FINDING_FIELDS[c.field];
  const conf = typeof c.confidence === 'number' && Number.isFinite(c.confidence) ? Math.min(1, Math.max(0, c.confidence)) : null;
  accepted.push({ field: c.field, value: c.value as string | number, unit: spec.kind === 'number' ? spec.unit : null, confidence: conf });
 }
 return { accepted, rejected };
}
