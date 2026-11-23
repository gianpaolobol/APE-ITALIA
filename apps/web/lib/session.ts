import 'server-only';
import { cookies } from 'next/headers';
import { loadWebConfig, type WebConfig } from './config';
import { seal, unseal } from './seal';
import type { LoginState, WebSession } from './oidc';

export const SESSION_COOKIE = '__Host-ape_session';
export const LOGIN_COOKIE = '__Host-ape_login';
const SESSION_TTL = 8 * 3600;
const LOGIN_TTL = 600;
const cookieBase = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };
/**
 * Browsers ignore a Set-Cookie for a __Host- cookie unless it carries Secure and Path=/, so deletion must
 * repeat those attributes (cookies().delete(name) alone silently fails). Found by the browser E2E test.
 */
async function expire(name: string) {
 (await cookies()).set(name, '', { ...cookieBase, maxAge: 0, expires: new Date(0) });
}

export function config(): WebConfig | null {
 return loadWebConfig();
}

export async function readSession(cfg: WebConfig): Promise<WebSession | null> {
 const s = unseal<WebSession>(cfg.sessionKey, 'session', (await cookies()).get(SESSION_COOKIE)?.value);
 if (!s || s.expiresAt <= Math.floor(Date.now() / 1000) + 15) return null; // expired access token: log in again
 return s;
}

export async function writeSession(cfg: WebConfig, s: WebSession) {
 (await cookies()).set(SESSION_COOKIE, seal(cfg.sessionKey, 'session', s, SESSION_TTL), { ...cookieBase, maxAge: SESSION_TTL });
}
export async function clearSession() {
 await expire(SESSION_COOKIE);
}
export async function writeLogin(cfg: WebConfig, l: LoginState) {
 (await cookies()).set(LOGIN_COOKIE, seal(cfg.sessionKey, 'login', l, LOGIN_TTL), { ...cookieBase, maxAge: LOGIN_TTL });
}
export async function takeLogin(cfg: WebConfig): Promise<LoginState | null> {
 const jar = await cookies();
 const l = unseal<LoginState>(cfg.sessionKey, 'login', jar.get(LOGIN_COOKIE)?.value);
 await expire(LOGIN_COOKIE); // single use
 return l;
}
