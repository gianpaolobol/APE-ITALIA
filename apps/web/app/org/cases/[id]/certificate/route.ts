import { NextResponse } from 'next/server';
import { isUuid, orgContext } from '../../../../../lib/org';
import { ApiFailure, orgFetch } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';

/** Proxies the APE download; receipt is a separate client action. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!isUuid(id)) return new NextResponse(null, { status: 404 });
 const ctx = await orgContext(`/org/cases/${id}`);
 if (!ctx?.membership) return new NextResponse(null, { status: 403 });
 try {
  const res = await orgFetch(ctx.cfg, ctx.s, ctx.membership.organizationId, `/v1/cases/${id}/certificate/content`);
  return new NextResponse(res.body, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="APE-${id}.pdf"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
 } catch (e) {
  const st = e instanceof ApiFailure && [401, 402, 403, 404, 410, 423].includes(e.status) ? e.status : 502;
  return new NextResponse(st === 423 ? 'Documento in attesa di controllo antivirus' : null, { status: st });
 }
}
