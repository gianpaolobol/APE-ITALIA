import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isUuid, orgContext } from '../../../../lib/org';
import { ApiFailure, orgJson, type CaseView, type EvidenceView, type PropertyView } from '../../../../lib/api';
import { Notice, box } from '../../../ui';
import { STATUS_IT } from '../../../../lib/labels';

export const dynamic = 'force-dynamic';
type InspectionInfo = { caseStatus: string; inspection: { status: string; scheduledAt: string; performedAt: string | null; certifierName: string } | null };

export default async function OrgCase({ params }: { params: Promise<{ id: string }> }) {
 const { id } = await params;
 if (!isUuid(id)) notFound();
 const ctx = await orgContext(`/org/cases/${id}`);
 if (!ctx) return <Notice>Portale non configurato.</Notice>;
 if (!ctx.membership) return <Notice>Seleziona prima un'organizzazione dalla <Link href="/org">pagina iniziale</Link>.</Notice>;
 const { cfg, s } = ctx, org = ctx.membership.organizationId;
 let c: CaseView | undefined, p: PropertyView | undefined, info: InspectionInfo, evidence: EvidenceView[];
 try {
  const [cases, props] = await Promise.all([orgJson<CaseView[]>(cfg, s, org, '/v1/cases'), orgJson<PropertyView[]>(cfg, s, org, '/v1/properties')]);
  c = cases.find(x => x.id === id);
  if (!c) notFound();
  p = props.find(x => x.id === c!.propertyId);
  [info, evidence] = await Promise.all([orgJson<InspectionInfo>(cfg, s, org, `/v1/cases/${id}/inspection`), orgJson<EvidenceView[]>(cfg, s, org, `/v1/cases/${id}/evidence`)]);
 } catch (e) {
  if (e instanceof ApiFailure && (e.status === 404 || e.status === 403)) notFound();
  throw e;
 }
 const fmt = (d: string) => new Date(d).toLocaleString('it-IT', { timeZone: 'Europe/Rome', dateStyle: 'medium', timeStyle: 'short' });
 return <main>
  <p><Link href="/org">← Pratiche</Link></p>
  <h1>{p ? `${p.address}, ${p.city}` : 'Pratica'}</h1>
  <p>Stato: <strong>{STATUS_IT[info.caseStatus] ?? info.caseStatus}</strong></p>
  <section style={box}><h2>Sopralluogo</h2>{info.inspection
   ? <p>{info.inspection.status === 'DONE' ? `Eseguito il ${fmt(info.inspection.performedAt!)}` : `Programmato per il ${fmt(info.inspection.scheduledAt)}`} · certificatore: {info.inspection.certifierName}</p>
   : <p>Non ancora programmato.</p>}</section>
  <section style={box}><h2>Documenti e foto caricati ({evidence.length})</h2>
   <ul>{evidence.map(e => <li key={e.id}>{e.kind} · {e.mimeType} · {(e.sizeBytes / 1024).toFixed(0)} KB · caricato il {fmt(e.createdAt)}</li>)}</ul>
  </section>
  <Notice>L'APE viene redatto, firmato e depositato dal certificatore abilitato dopo il sopralluogo; questa pagina mostra solo l'avanzamento.</Notice>
 </main>;
}
