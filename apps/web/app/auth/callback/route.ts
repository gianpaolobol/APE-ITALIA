import { NextResponse, type NextRequest } from 'next/server';
import { config, takeLogin, writeSession } from '../../../lib/session';
import { completeLogin, discover } from '../../../lib/oidc';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
 const cfg = config();
 if (!cfg) return NextResponse.json({ error: 'Authentication not configured' }, { status: 503 });
 const login = await takeLogin(cfg);
 try {
  const d = await discover(cfg.issuer, fetch);
  const session = await completeLogin(cfg, d, login, req.nextUrl.searchParams, { fetch });
  await writeSession(cfg, session);
  return NextResponse.redirect(cfg.baseUrl + (login?.returnTo ?? '/certifier'), { status: 303 });
 } catch {
  // No detail leaks to the browser; the user simply restarts the login.
  return NextResponse.redirect(cfg.baseUrl + '/?login=failed', { status: 303 });
 }
}
