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
export async function api<T>(path: string, init: { method?: string; body?: unknown; org?: boolean; form?: FormData; timeoutMs?: number } = {}): Promise<T> {
 const s = await freshSession();
 if (!s) throw new ServerError(401, 'Accedi per continuare');
 const headers: Record<string, string> = { Authorization: `Bearer ${s.accessToken}` };
 if (init.org) { if (!s.organizationId) throw new ServerError(403, 'Account senza organizzazione'); headers['x-organization-id'] = s.organizationId; }
 let body: BodyInit | undefined;
 if (init.form) body = init.form;
 else if (init.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(init.body); }
 return raw<T>(path, { method: init.method ?? (body ? 'POST' : 'GET'), headers, ...(body ? { body } : {}) }, init.timeoutMs);
}

/** Downloads an authenticated file (evidence, certificate) into the app cache and returns its local URI. */
export async function download(path: string, name: string): Promise<string> {
 const s = await freshSession();
 if (!s) throw new ServerError(401, 'Accedi per continuare');
 const dir = new Directory(Paths.cache, 'remote');
 if (!dir.exists) dir.create({ intermediates: true });
 const dest = new File(dir, name);
 if (dest.exists) return dest.uri;
 const f = await File.downloadFileAsync(`${API_BASE}${path}`, dest, { headers: { Authorization: `Bearer ${s.accessToken}` } });
 return f.uri;
}

export async function deleteAccount(): Promise<void> {
 await api('/v1/auth/account', { method: 'DELETE' });
 cached = null;
 await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
}
