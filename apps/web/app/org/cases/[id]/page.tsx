import React from 'react';
import { CertificateDownload } from './CertificateDownload';
import { certificateBinding } from '../../../../lib/certificate-binding';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid, orgContext } from '../../../../lib/org';
import { ApiFailure, orgJson, type CaseView, type EvidenceView, type PropertyView } from '../../../../lib/api';
import { Notice, box } from '../../../ui';
import { STATUS_IT } from '../../../../lib/labels';
import { cancelCase, giveConsent, resolveEvidenceRequest, submitCase, uploadEvidence } from '../../actions';
type RequestInfo = { id: string; message: string; kinds: string[]; createdAt: string; resolvedAt: string | null };

export const dynamic = 'force-dynamic';
type CertificateInfo = { certificate: { regionalId: string; depositedAt: string; validUntil: string | null; sha256: string; sizeBytes: number; deliveredAt: string | null } | null };
type InspectionInfo = { caseStatus: string; inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null };

const MSG: Record<string, string> = { 'notice-updated': 'Informativa aggiornata: non è stato registrato alcun consenso. Riprova quando il portale sarà aggiornato.', 'consent-error': 'Registrazione del consenso non riuscita.', consent: 'Consenso registrato: ora puoi caricare foto e documenti.', 'upload-ok': 'File caricato.', 'upload-missing': 'Scegli la voce e il file.', 'upload-403': 'Serve il consenso all\'informativa prima del caricamento.', 'upload-409': 'File già caricato o pratica chiusa.', 'upload-413': 'File oltre 15 MB.', 'upload-415': 'Formato non accettato (JPEG, PNG, HEIC; PDF solo per planimetrie e documenti).', 'upload-422': 'File non valido.', submitted: 'Richiesta inviata: verrà proposta a un certificatore abilitato.', 'submit-error': 'Invio non riuscito.' };
const KIND_IT: Record<string, string> = { boiler: 'Caldaia e targhetta', heating: 'Terminali', envelope: 'Pareti e sezioni', window: 'Serramenti', floorplan: 'Planimetria', document: 'Documento' };

export default async function OrgCase({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string }> }) {
 const { id } = await params;
 const { msg } = await searchParams;
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
  {msg && MSG[msg] ? <Notice>{MSG[msg]}</Notice> : null}
  {['DRAFT', 'AWAITING_EVIDENCE'].includes(info.caseStatus) && ctx.membership!.role !== 'viewer' ? <section style={box}>
   <h2>Foto e documenti</h2>
   <form action={giveConsent}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="noticeVersion" value="2026-11-23-draft" /><p style={{ fontSize: 14 }}>Le immagini e i documenti servono al certificatore abilitato; sono conservati cifrati e accessibili alla tua organizzazione e al certificatore incaricato; i dati di posizione delle foto JPEG vengono rimossi. Informativa in bozza, in attesa di revisione legale.</p><button type="submit">Ho letto e acconsento</button></form>
   <form action={uploadEvidence} encType="multipart/form-data" style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center' }}><input type="hidden" name="caseId" value={id} />
    <select name="kind" required defaultValue=""><option value="" disabled>Voce…</option>{Object.entries(KIND_IT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    <input type="file" name="file" required accept="image/jpeg,image/png,image/heic,application/pdf" /><button type="submit">Carica</button></form>
   {info.caseStatus === 'DRAFT' ? <form action={submitCase} style={{ marginTop: 12 }}><input type="hidden" name="caseId" value={id} /><button type="submit">Invia la richiesta</button></form> : null}
  </section> : null}
  {requests.filter(r => !r.resolvedAt).map(r => <section key={r.id} style={{ ...box, borderColor: '#d9a400' }}><h2>Integrazioni richieste dal certificatore</h2>
   <p>{r.message}</p><p>Voci: {r.kinds.join(', ')}. Carica i file dall'app mobile, poi conferma.</p>
   {ctx.membership!.role !== 'viewer' ? <form action={resolveEvidenceRequest}><input type="hidden" name="caseId" value={id} /><input type="hidden" name="requestId" value={r.id} /><button type="submit">Ho caricato quanto richiesto</button></form> : null}
  </section>)}
  <section style={box}><h2>Sopralluogo</h2>{info.inspection
   ? <p>{info.inspection.status === 'DONE' ? `Eseguito il ${fmt(info.inspection.performedAt!)}` : `Programmato per il ${fmt(info.inspection.scheduledAt)}`} · certificatore: {info.inspection.certifierName}</p>
   : <p>Non ancora programmato.</p>}</section>
  {cert.certificate ? <section style={box}><h2>Attestato di prestazione energetica</h2>
   <p>Identificativo regionale <strong>{cert.certificate.regionalId}</strong> · depositato il {fmt(cert.certificate.depositedAt)}{cert.certificate.validUntil ? ` · valido fino al ${new Date(cert.certificate.validUntil).toLocaleDateString('it-IT')}` : ''}</p>
   <p><CertificateDownload id={id} org={org} binding={certificateBinding(cfg.sessionKey, s, org, id)} sha256={cert.certificate.sha256} sizeBytes={cert.certificate.sizeBytes} /> · impronta SHA-256 <code>{cert.certificate.sha256.slice(0, 16)}…</code></p>
   <p>{cert.certificate.deliveredAt ? 'Ricezione registrata il ' + fmt(cert.certificate.deliveredAt) : 'Ricezione non ancora confermata.'}</p>
   <p style={{ fontSize: 13 }}>Documento caricato dal certificatore che lo ha firmato e depositato; la piattaforma non ne modifica il contenuto.</p>
  </section> : null}
  <section style={box}><h2>Documenti e foto caricati ({evidence.length})</h2>
   <ul>{evidence.map(e => <li key={e.id}>{e.kind} · {e.mimeType} · {(e.sizeBytes / 1024).toFixed(0)} KB · caricato il {fmt(e.createdAt)}</li>)}</ul>
  </section>
  {['DRAFT', 'SUBMITTED', 'ASSIGNED', 'INSPECTION_SCHEDULED', 'AWAITING_EVIDENCE'].includes(info.caseStatus) && ctx.membership!.role !== 'viewer' ? <form action={cancelCase} style={box}><input type="hidden" name="caseId" value={id} /><h2>Annulla la richiesta</h2><input name="reason" required minLength={3} placeholder="Motivo" size={40} /> <button type="submit">Annulla pratica</button></form> : null}
  <Notice>L'APE viene redatto, firmato e depositato dal certificatore abilitato dopo il sopralluogo; questa pagina mostra solo l'avanzamento.</Notice>
 </main>;
}
