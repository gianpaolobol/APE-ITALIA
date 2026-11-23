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
