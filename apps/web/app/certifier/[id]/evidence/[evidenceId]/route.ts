import { NextResponse } from 'next/server';
import { config, readSession } from '../../../../../lib/session';
import { ApiFailure, apiFetch } from '../../../../../lib/api';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Proxies the download so the access token never reaches the browser. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; evidenceId: string }> }) {
 const { id, evidenceId } = await params;
 if (!UUID.test(id) || !UUID.test(evidenceId)) return new NextResponse(null, { status: 404 });
 const cfg = config();
 if (!cfg) return new NextResponse(null, { status: 503 });
 const s = await readSession(cfg);
 if (!s) return new NextResponse(null, { status: 401 });
 try {
  const res = await apiFetch(cfg, s, `/v1/certifier/assignments/${id}/evidence/${evidenceId}/content`);
  return new NextResponse(res.body, { status: 200, headers: {
   'Content-Type': res.headers.get('content-type') ?? 'application/octet-stream',
   'Content-Disposition': res.headers.get('content-disposition') ?? 'attachment',
   'X-Content-Type-Options': 'nosniff',
   'Cache-Control': 'no-store',
  } });
 } catch (e) {
  const status = e instanceof ApiFailure && [401, 403, 404, 410, 423].includes(e.status) ? e.status : 502;
  return new NextResponse(status === 423 ? 'File in attesa di scansione antivirus' : null, { status });
 }
}
