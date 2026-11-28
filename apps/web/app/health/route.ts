import { readFileSync } from 'node:fs';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Read only the immutable image marker; never expose configuration or request data.
export function GET() {
 let revision = '';
 try { revision = readFileSync('/app/ape-build-revision', 'utf8').trim(); } catch { /* Fail closed outside a revisioned image. */ }
 const ok = /^[a-f0-9]{40}$/.test(revision);
 return Response.json({ status: ok ? 'ok' : 'error', service: 'ape-italia-web', ...(ok ? { revision } : {}) }, {
  status: ok ? 200 : 503,
  headers: { 'Cache-Control': 'no-store' },
 });
}
