import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid, orgContext } from '../../../../lib/org';
import { ApiFailure, orgJson, type CaseView, type EvidenceView, type PropertyView } from '../../../../lib/api';
import { Notice, box } from '../../../ui';
import { STATUS_IT } from '../../../../lib/labels';
import { cancelCase, resolveEvidenceRequest } from '../../actions';
type RequestInfo = { id: string; message: string; kinds: string[]; createdAt: string; resolvedAt: string | null };

export const dynamic = 'force-dynamic';
type CertificateInfo = { certificate: { regionalId: string; depositedAt: string; validUntil: string | null; sha256: string; deliveredAt: string | null } | null };
type InspectionInfo = { caseStatus: string; inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null };

export default async function OrgCase({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!isUuid(id)) notFound();
 const ctx = await orgContext(`/org/cases/${id}`);
 if (!ctx) return <Notice>Portale non configurato.</Notice>;
 if (!ctx.membership) return <Notice>Seleziona prima un'organizzazione dalla <Link href="/org">pagina iniziale</Link>.</Notice>;
 const { cfg, s } = ctx, org = ctx.membership.organizationId;
 let c: CaseView | undefined, p: PropertyView | undefined, info: InspectionInfo, evidence: EvidenceView[], cert: CertificateInfo, requests: RequestInfo[];
 try {
  const [cases, props] = await Promise.all([orgJson<CaseView[]>(cfg, s, org, '/v1/cases'), orgJson<PropertyView[]>(cfg, s, org, '/v1/properties')]);
  c = cases.find(x => x.id === id);
  if (!c) notFound();
  p = props.find(x => x.id === c!.propertyId);
  [info, evidence, cert, requests] = await Promise.all([orgJson<InspectionInfo>(cfg, s, org, `/v1/cases/${id}/inspection`), orgJson<EvidenceView[]>(cfg, s, org, `/v1/cases/${id}/evidence`), orgJson<CertificateInfo>(cfg, s, org, `/v1/cases/${id}/certificate`), orgJson<RequestInfo[]>(cfg, s, org, `/v1/cases/${id}/evidence-requests`)]);
 } catch (e) {
  if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) notFound();
  throw e;
 }
 const fmt = (d: string) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });
 return <main>
  <p><Link href="/org">← Pratiche</Link></p>
  <h1>{p ? `${p.address}, ${p.city}` : 'Pratica'}</h1>
  <p>Stato: <strong>{STATUS_IT[info.caseStatus] ?? info.caseStatus}</strong></p>
  {requests.filter(r => !r.resolvedAt).map(r => <section key={r.id} style={{ ...box, borderColor: '#d9a400' }}><h2>Integrazioni richieste dal certificatore</h2>
   <p>{r.message}</p><p>Voci: {r.kinds.join(', ')}. Carica i file dall'app mobile, poi conferma.</p>
   {ctx.membership!.role !== 'viewer' ? <form action={resolveEvidenceRequest}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="requestId" value={r.id} /><button type="submit">Ho caricato quanto richiesto</button></form> : null}
  </section>)}
  <section style={box}><h2>Sopralluogo</h2>{info.inspection
   ? <p>{info.inspection.status === 'DONE' ? `Eseguito il ${fmt(info.inspection.performedAt!)}` : `Programmato per il ${fmt(info.inspection.scheduledAt)}`} · certificatore: {info.inspection.certifierName}</p>
   : <p>Non ancora programmato.</p>}</section>
  {cert.certificate ? <section style={box}><h2>Attestato di prestazione energetica</h2>
   <p>Identificativo regionale <strong>{cert.certificate.regionalId}</strong> · depositato il {fmt(cert.certificate.depositedAt)}{cert.certificate.validUntil ? ` · valido fino al ${new Date(cert.certificate.validUntil).toLocaleDateString('it-IT')}` : ''}</p>
   <p><a href={`/org/cases/${id}/certificate`}>Scarica l'APE (PDF)</a> · impronta SHA-256 <code>{cert.certificate.sha256.slice(0, 16)}…</code></p>
   <p style={{ fontSize: 13 }}>Documento caricato dal certificatore che lo ha firmato e depositato; la piattaforma non ne modifica il contenuto.</p>
  </section> : null}
  <section style={box}><h2>Documenti e foto caricati ({evidence.length})</h2>
   <ul>{evidence.map(e => <li key={e.id}>{e.kind} · {e.mimeType} · {(e.sizeBytes / 1024).toFixed(0)} KB · caricato il {fmt(e.createdAt)}</li>)}</ul>
  </section>
  {['DRAFT', 'SUBMITTED', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'AWAITING_EVIDENCE'].includes(info.caseStatus) && ctx.membership!.role !== 'viewer' ? <form action={cancelCase} style={box}><input type="hidden" name="caseId" value={id} /><h2>Annulla la richiesta</h2><input name="reason" required minLength={3} placeholder="Motivo" size={40} /> <button type="submit">Annulla pratica</button></form> : null}
  <Notice>L'APE viene redatto, firmato e depositato dal certificatore abilitato dopo il sopralluogo; questa pagina mostra solo l'avanzamento.</Notice>
 </main>;
}
