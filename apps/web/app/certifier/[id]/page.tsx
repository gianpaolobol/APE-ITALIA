import React from 'react';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { config, readSession } from '../../../lib/session';
import { ApiFailure, apiJson, type AssignmentView, type EvidenceView, type ExtractedFieldView, type InspectionSchema, type InspectionView } from '../../../lib/api';
import { ExtractionPanel } from '../ExtractionPanel';
import { extractEvidence } from '../actions';
import { InspectionPanel } from '../InspectionPanel';
import { Notice, box } from '../../ui';

export const dynamic = 'force-dynamic';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABELS: Record<string, string> = { boiler: 'Caldaia e targhetta', heating: 'Terminali', envelope: 'Pareti e sezioni', window: 'Serramenti', floorplan: 'Planimetria', document: 'Documento' };

const EXTRACT_MSG: Record<string, string> = { ok: 'Estrazione completata: verifica i valori proposti.', 'ai-off': 'Estrazione automatica non attiva: nessun fornitore AI è autorizzato in questo ambiente.', unscanned: 'Il file non è ancora stato controllato dall\'antivirus: non può essere inviato al servizio di estrazione.', done: 'File già elaborato con questo modello.', error: 'Estrazione non riuscita.' };

export default async function AssignmentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ extract?: string }> }) {
 const { id } = await params;
 const { extract } = await searchParams;
 if (!UUID.test(id)) notFound();
 const cfg = config();
 if (!cfg) return <Notice>Portale non configurato.</Notice>;
 const s = await readSession(cfg);
 if (!s) redirect(`/auth/login?returnTo=/certifier/${id}`);
 let assignment: AssignmentView | undefined, evidence: EvidenceView[] = [], inspection: InspectionView | null = null, schema: InspectionSchema | null = null, extracted: ExtractedFieldView[] = [];
 try {
  assignment = (await apiJson<AssignmentView[]>(cfg, s, '/v1/certifier/assignments')).find(a => a.id === id && a.status === 'ACCEPTED');
  if (!assignment) notFound();
  [evidence, inspection, schema, extracted] = await Promise.all([
   apiJson<EvidenceView[]>(cfg, s, `/v1/certifier/assignments/${id}/evidence`),
   apiJson<{ inspection: InspectionView | null }>(cfg, s, `/v1/certifier/assignments/${id}/inspection`).then(r => r.inspection),
   apiJson<InspectionSchema>(cfg, s, '/v1/certifier/inspection-schema'),
   apiJson<ExtractedFieldView[]>(cfg, s, `/v1/certifier/assignments/${id}/extracted-fields`),
  ]);
 } catch (e) {
  if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) notFound();
  throw e;
 }
 return <main>
  <p><Link href="/certifier">← Incarichi</Link></p>
  <h1>{assignment.property.address}, {assignment.property.city}</h1>
  <p>Regione {assignment.property.region}{assignment.property.floorAreaM2 ? ` · superficie dichiarata ${assignment.property.floorAreaM2} m² (da verificare)` : ''} · stato pratica {assignment.caseStatus}</p>
  <Notice>Le evidenze del richiedente non sostituiscono il sopralluogo: dati di involucro e impianto vanno verificati sul posto prima del calcolo, della firma e del deposito.</Notice>
  {extract && EXTRACT_MSG[extract] ? <Notice>{EXTRACT_MSG[extract]}</Notice> : null}
  <h2>Evidenze ({evidence.length})</h2>
  {evidence.length === 0 ? <p>Nessun file caricato.</p> : <ul style={{ listStyle: 'none', padding: 0 }}>{evidence.map(e => <li key={e.id} style={box}>
   <strong>{LABELS[e.kind] ?? e.kind}</strong> · {e.mimeType} · {(e.sizeBytes / 1024).toFixed(0)} KB · scansione: {e.scanStatus}
   {' '}<a href={`/certifier/${id}/evidence/${e.id}`}>Scarica</a>
   {' '}<form action={extractEvidence} style={{ display: 'inline' }}><input type="hidden" name="id" value={id} /><input type="hidden" name="evidenceId" value={e.id} /><button type="submit">Proponi valori (AI)</button></form>
  </li>)}</ul>}
  {schema ? <ExtractionPanel assignmentId={id} fields={extracted} schema={schema} /> : null}
  {schema ? <InspectionPanel assignmentId={id} inspection={inspection} schema={schema} /> : null}
 </main>;
}
