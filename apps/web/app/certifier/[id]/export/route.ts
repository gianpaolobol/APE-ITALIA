import { NextResponse, type NextRequest } from 'next/server';
import { config, readSession } from '../../../../lib/session';
import { ApiFailure, apiFetch } from '../../../../lib/api';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Proxies the calculation export (JSON or CSV) as a download. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 const format = req.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';
 if (!UUID.test(id)) return new NextResponse(null, { status: 404 });
 const cfg = config();
 if (!cfg) return new NextResponse(null, { status: 503 });
 const s = await readSession(cfg);
 if (!s) return new NextResponse(null, { status: 401 });
 try {
  const res = await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/export?format=${format}`);
  return new NextResponse(res.body, { status: 200, headers: {
   'Content-Type': format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8',
   'Content-Disposition': `attachment; filename="ape-italia-${id}.${format}"`,
   'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
  } });
 } catch (e) {
  return new NextResponse(null, { status: e instanceof ApiFailure && [401, 403, 404, 409].includes(e.status) ? e.status : 502 });
 }
}
