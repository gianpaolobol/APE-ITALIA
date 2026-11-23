import { NextResponse } from 'next/server';
import { clearSession, config, readSession } from '../../../lib/session';
import { discover } from '../../../lib/oidc';

export const dynamic = 'force-dynamic';

/** POST only (form button): avoids logout CSRF via image tags; revocation is best effort. */
export async function POST() {
 const cfg = config();
 if (!cfg) return NextResponse.json({ error: 'Authentication not configured' }, { status: 503 });
 const s = await readSession(cfg).catch(() => null);
 await clearSession();
 if (s?.refreshToken) {
  try {
   const d = await discover(cfg.issuer, fetch);
   if (d.revocation_endpoint) {
    await fetch(d.revocation_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: s.refreshToken, token_type_hint: 'refresh_token', client_id: cfg.clientId }).toString() });
   }
  } catch { /* local logout already done */ }
 }
 return NextResponse.redirect(cfg.baseUrl + '/', { status: 303 });
}
