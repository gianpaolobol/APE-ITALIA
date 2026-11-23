import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { config, readSession } from '../../../lib/session';
import { ApiFailure, apiJson, type AssignmentView, type EvidenceView } from '../../../lib/api';
import { Notice, box } from '../../ui';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS: Record<string, string> = { boiler: 'Caldaia e targhetta', heating: 'Terminali', envelope: 'Pareti e sezioni', window: 'Serramenti', floorplan: 'Planimetria', document: 'Documento' };

export default async function AssignmentPage({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!UUID.test(id)) notFound();
 const cfg = config();
 if (!cfg) return <Notice>Portale non configurato.</Notice>;
 const s = await readSession(cfg);
 if (!s) redirect(`/auth/login?returnTo=/certifier/${id}`);
 let assignment: AssignmentView | undefined, evidence: EvidenceView[] = [];
 try {
  assignment = (await apiJson<AssignmentView[]>(cfg, s, '/v1/certifier/assignments')).find(a => a.id === id && a.status === 'ACCEPTED');
  if (!assignment) notFound();
  evidence = await apiJson<EvidenceView[]>(cfg, s, `/v1/certifier/assignments/${id}/evidence`);
 } catch (e) {
  if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) notFound();
  throw e;
 }
 return <main>
  <p><Link href="/certifier">← Incarichi</Link></p>
  <h1>{assignment.property.address}, {assignment.property.city}</h1>
  <p>Regione {assignment.property.region}{assignment.property.floorAreaM2 ? ` · superficie dichiarata ${assignment.property.floorAreaM2} m² (da verificare)` : ''} · stato pratica {assignment.caseStatus}</p>
  <Notice>Le evidenze del richiedente non sostituiscono il sopralluogo: dati di involucro e impianto vanno verificati sul posto prima del calcolo, della firma e del deposito.</Notice>
  <h2>Evidenze ({evidence.length})</h2>
  {evidence.length === 0 ? <p>Nessun file caricato.</p> : <ul style={{ listStyle: 'none', padding: 0 }}>{evidence.map(e => <li key={e.id} style={box}>
   <strong>{LABELS[e.kind] ?? e.kind}</strong> · {e.mimeType} · {(e.sizeBytes / 1024).toFixed(0)} KB · scansione: {e.scanStatus}
   {' '}<a href={`/certifier/${id}/evidence/${e.id}`}>Scarica</a>
  </li>)}</ul>}
 </main>;
}
