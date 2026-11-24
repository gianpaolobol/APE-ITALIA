/**
 * APE Italia server client: email-code login, session refresh and authenticated calls. Active only when
 * the build sets EXPO_PUBLIC_API_BASE_URL (https); otherwise the app runs in local demo mode.
 */
import * as SecureStore from 'expo-secure-store';
import { Directory, File, Paths } from 'expo-file-system';

export const API_BASE = (process.env.EXPO_PUBLIC_API_BASE_URL ?? '').replace(/\/$/, '');
export const serverEnabled = (): boolean => /^https:\/\//.test(API_BASE);

export type Session = { accessToken: string; expiresAt: number; refreshToken: string; email: string; subject: string; organizationId: string | null; isCertifier: boolean };
const KEY = 'ape.session.v1';
let cached: Session | null | undefined;

export class ServerError extends Error { constructor(public status: number, message: string) { super(message); } }

async function raw<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000): Promise<T> {
 const ctl = new AbortController();
 const t = setTimeout(() => ctl.abort(), timeoutMs);
 try {
  const res = await fetch(`${API_BASE}${path}`, { ...init, signal: ctl.signal });
  if (!res.ok) {
   let msg = `Errore ${res.status}`;
   try { const b = (await res.json()) as { message?: unknown }; if (typeof b.message === 'string') msg = b.message; else if (Array.isArray(b.message)) msg = b.message.join(', '); } catch { /* not JSON */ }
   throw new ServerError(res.status, msg);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
 } finally { clearTimeout(t); }
}

type AuthResponse = { accessToken: string; expiresIn: number; refreshToken: string; user: { subject: string; email: string }; organizationId: string | null; isCertifier: boolean };
async function store(r: AuthResponse): Promise<Session> {
 const s: Session = { accessToken: r.accessToken, expiresAt: Date.now() + (r.expiresIn - 60) * 1000, refreshToken: r.refreshToken, email: r.user.email, subject: r.user.subject, organizationId: r.organizationId, isCertifier: r.isCertifier };
 await SecureStore.setItemAsync(KEY, JSON.stringify(s));
 cached = s;
 return s;
}

export async function getSession(): Promise<Session | null> {
 if (cached !== undefined) return cached;
 try { const v = await SecureStore.getItemAsync(KEY); cached = v ? (JSON.parse(v) as Session) : null; } catch { cached = null; }
 return cached;
}

export async function startLogin(email: string): Promise<void> {
 await raw('/v1/auth/email/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
}

export async function verifyLogin(email: string, code: string): Promise<Session> {
 return store(await raw<AuthResponse>('/v1/auth/email/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) }));
}

export async function logout(): Promise<void> {
 const s = await getSession();
 cached = null;
 clearRemoteCache();
 await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
 if (s) await raw('/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) }).catch(() => undefined);
}

let refreshing: Promise<Session | null> | null = null;
/** Valid access token, refreshed transparently (single flight). Null when logged out. */
export async function freshSession(): Promise<Session | null> {
 const s = await getSession();
 if (!s) return null;
 if (s.expiresAt > Date.now()) return s;
 refreshing ??= (async () => {
  try { return await store(await raw<AuthResponse>('/v1/auth/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refreshToken: s.refreshToken }) })); }
  catch (e) { if (e instanceof ServerError && e.status === 401) { cached = null; await SecureStore.deleteItemAsync(KEY).catch(() => undefined); return null; } throw e; }
  finally { refreshing = null; }
 })();
 return refreshing;
}

/** Authenticated JSON call. `org` adds the organization header for customer routes. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; org?: boolean; form?: FormData; text?: string; timeoutMs?: number } = {}): Promise<T> {
 const s = await freshSession();
 if (!s) throw new ServerError(401, 'Accedi per continuare');
 const headers: Record<string, string> = { Authorization: `Bearer ${s.accessToken}` };
 if (init.org) { if (!s.organizationId) throw new ServerError(403, 'Account senza organizzazione'); headers['x-organization-id'] = s.organizationId; }
 let body: BodyInit | undefined;
 if (init.form) body = init.form;
 else if (init.text !== undefined) { headers['Content-Type'] = 'text/plain'; body = init.text; }
 else if (init.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.body); }
 return raw<T>(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, ...(body ? { body } : {}) }, init.timeoutMs);
}

let downloadSequence = 0;
function clearRemoteCache(): void {
 try { const dir = new Directory(Paths.cache, 'remote'); if (dir.exists) dir.delete(); } catch { /* best effort */ }
}

/** Always re-authorize at the server; never reuse a cached document from an earlier request/account. */
export async function download(path: string, name: string, org = false): Promise<string> {
 const s = await freshSession();
 if (!s) throw new ServerError(401, 'Accedi per continuare');
 const headers: Record<string, string> = { Authorization: `Bearer ${s.accessToken}` };
 if (org) {
  if (!s.organizationId) throw new ServerError(403, 'Account senza organizzazione');
  headers['x-organization-id'] = s.organizationId;
 }
 const dir = new Directory(Paths.cache, 'remote', `download-${Date.now()}-${++downloadSequence}`);
 dir.create({ intermediates: true });
 const dest = new File(dir, name);
 try {
  const f = await File.downloadFileAsync(`${API_BASE}${path}`, dest, { headers });
  const current = await getSession();
  if (!current || current.subject !== s.subject || current.organizationId !== s.organizationId) throw new ServerError(401, 'Sessione cambiata');
  return f.uri;
 } catch (e) {
  try { if (dir.exists) dir.delete(); } catch { /* best effort */ }
  throw e;
 }
}

export async function deleteAccount(): Promise<void> {
 await api('/v1/auth/account', { method: 'DELETE' });
 cached = null;
 clearRemoteCache();
 await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function toBase64(bytes: Uint8Array): string {
 let out = '';
 for (let i = 0; i < bytes.length; i += 3) {
  const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
  out += B64[a >> 2] + B64[((a & 3) << 4) | ((b ?? 0) >> 4)] + (b === undefined ? '=' : B64[((b & 15) << 2) | ((c ?? 0) >> 6)]) + (c === undefined ? '=' : B64[c & 63]);
 }
 return out;
}

/**
 * Resumable upload of a large local file (walkthrough video) in 4 MiB parts: already received parts are
 * skipped, so a retry after a dropped connection continues where it stopped.
 */
export async function uploadResumable(caseId: string, kind: string, uri: string, onProgress: (ratio: number) => void, existing?: string): Promise<{ id: string; uploadId: string }> {
 const file = new File(uri);
 const total = file.size ?? 0;
 if (!total) throw new ServerError(400, 'File vuoto');
 let uploadId = existing, partSize = 4 * 1024 * 1024, received: number[] = [];
 if (uploadId) {
  try { const st = await api<{ receivedParts: number[]; completed: boolean; evidenceId: string | null }>(`/v1/cases/${caseId}/uploads/${uploadId}`, { org: true }); received = st.receivedParts; if (st.completed && st.evidenceId) return { id: st.evidenceId, uploadId }; }
  catch { uploadId = undefined; }
 }
 if (!uploadId) { const st = await api<{ uploadId: string; partSize: number }>(`/v1/cases/${caseId}/uploads`, { org: true, body: { kind, totalBytes: total } }); uploadId = st.uploadId; partSize = st.partSize; }
 const parts = Math.ceil(total / partSize);
 const h = file.open();
 try {
  for (let n = 0; n < parts; n++) {
   if (received.includes(n)) { onProgress((n + 1) / parts); continue; }
   h.offset = n * partSize;
   const bytes = h.readBytes(Math.min(partSize, total - n * partSize));
   for (let attempt = 0; ; attempt++) {
    try { await api(`/v1/cases/${caseId}/uploads/${uploadId}/parts/${n}`, { org: true, text: toBase64(bytes), timeoutMs: 120_000 }); break; }
    catch (e) { if (attempt >= 3 || (e instanceof ServerError && e.status < 500 && e.status !== 429)) throw e; await new Promise(r => setTimeout(r, 2000 * (attempt + 1))); }
   }
   onProgress((n + 1) / parts);
  }
 } finally { h.close(); }
 const ev = await api<{ id: string }>(`/v1/cases/${caseId}/uploads/${uploadId}/complete`, { org: true, body: {}, timeoutMs: 10 * 60_000 });
 return { id: ev.id, uploadId };
}
