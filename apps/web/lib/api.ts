import 'server-only';
import type { WebConfig } from './config';
import type { WebSession } from './oidc';

export class ApiFailure extends Error { constructor(public status: number) { super('API ' + status); } }

export async function apiFetch(cfg: WebConfig, s: WebSession, path: string, init: RequestInit = {}): Promise<Response> {
 const res = await fetch(cfg.apiBaseUrl + path, {
  ...init,
  cache: 'no-store',
  headers: { ...(init.headers as Record<string, string> | undefined), Authorization: 'Bearer ' + s.accessToken, Accept: 'application/json' },
 });
 if (!res.ok) throw new ApiFailure(res.status);
 return res;
}
export async function apiJson<T>(cfg: WebConfig, s: WebSession, path: string, init: RequestInit = {}): Promise<T> {
 return (await apiFetch(cfg, s, path, init)).json() as Promise<T>;
}

export type AssignmentView = {
 id: string; status: 'OFFERED' | 'ACCEPTED'; offeredAt: string; expiresAt: string; caseId: string; caseStatus: string;
 property: { city: string; region: string; address?: string; floorAreaM2?: number | null };
};
export type EvidenceView = { id: string; kind: string; mimeType: string; sizeBytes: number; scanStatus: string; createdAt: string };
export type FieldSpec = { label: string; kind: 'enum'; values: string[] } | { label: string; kind: 'number'; unit: string; min: number; max: number; integer?: boolean };
export type InspectionSchema = { fields: Record<string, FieldSpec>; statuses: string[]; sources: string[] };
export type InspectionView = { id: string; status: 'SCHEDULED' | 'DONE' | 'CANCELLED'; scheduledAt: string; performedAt: string | null; report: { findings: { field: string; status: string; value?: string | number; source: string; note?: string }[]; attendees: string; generalNotes?: string } | null };
export type ExtractedFieldView = { id: string; evidenceId: string; field: string; value: string | number; unit: string | null; confidence: number | null; status: 'needs_review' | 'accepted' | 'corrected' | 'rejected'; modelId: string; reviewedBy: string | null };
