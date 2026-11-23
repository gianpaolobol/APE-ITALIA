import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { config, readSession } from './session';
import { apiJson, type MeView } from './api';

export const ORG_COOKIE = '__Host-ape_org';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the current organization from a preference cookie, validated against the memberships the
 * API returns for the verified user. The cookie is only a preference, never an authorization.
 */
export async function orgContext(returnTo: string) {
 const cfg = config();
 if (!cfg) return null;
 const s = await readSession(cfg);
 if (!s) redirect('/auth/login?returnTo=' + encodeURIComponent(returnTo));
 const me = await apiJson<MeView>(cfg, s, '/v1/me');
 const pref = (await cookies()).get(ORG_COOKIE)?.value;
 const chosen = me.memberships.find(m => m.organizationId === pref) ?? (me.memberships.length === 1 ? me.memberships[0] : undefined);
 return { cfg, s, me, membership: chosen };
}

export function isUuid(v: string): boolean {
 return UUID.test(v);
}
