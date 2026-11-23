import { NextResponse, type NextRequest } from 'next/server';
import { config, writeLogin } from '../../../lib/session';
import { createLogin, discover } from '../../../lib/oidc';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
 const cfg = config();
 if (!cfg) return NextResponse.json({ error: 'Authentication not configured' }, { status: 503 });
 const d = await discover(cfg.issuer, fetch);
 const { url, login } = createLogin(cfg, d, req.nextUrl.searchParams.get('returnTo'));
 await writeLogin(cfg, login);
 return NextResponse.redirect(url, { status: 302, headers: { 'Cache-Control': 'no-store' } });
}
