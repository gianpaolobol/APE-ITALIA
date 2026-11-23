import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { config, readSession } from '../../lib/session';
import { ApiFailure, apiJson, type AssignmentView } from '../../lib/api';
import { acceptAssignment, declineAssignment } from './actions';
import { LogoutButton, Notice, box, btn, btnLight } from '../ui';

export const dynamic = 'force-dynamic';

export default async function CertifierHome() {
 const cfg = config();
 if (!cfg) return <Notice>Portale non configurato: impostare provider OIDC, URL API e chiave di sessione (vedi docs/WEB_PORTAL.md).</Notice>;
 const s = await readSession(cfg);
 if (!s) redirect('/auth/login?returnTo=/certifier');
 let items: AssignmentView[];
 try {
  items = await apiJson<AssignmentView[]>(cfg, s, '/v1/certifier/assignments');
 } catch (e) {
  if (e instanceof ApiFailure && e.status === 403) return <><Notice>Il tuo account non ha un profilo certificatore verificato. La verifica è eseguita da un operatore sull'elenco regionale dei certificatori abilitati.</Notice><LogoutButton /></>;
  if (e instanceof ApiFailure && e.status === 401) redirect('/auth/login?returnTo=/certifier');
  throw e;
 }
 const offers = items.filter(i => i.status === 'OFFERED');
 const accepted = items.filter(i => i.status === 'ACCEPTED');
 return <main>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h1>Incarichi</h1><LogoutButton /></div>
  <h2>Offerte ({offers.length})</h2>
  {offers.length === 0 ? <p>Nessuna offerta in attesa.</p> : offers.map(o => <section key={o.id} style={box}>
   <strong>{o.property.city} ({o.property.region})</strong>
   <p>Offerta valida fino al {new Date(o.expiresAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}. L'indirizzo e le evidenze sono visibili dopo l'accettazione.</p>
   <div style={{ display: 'flex', gap: 8 }}>
    <form action={acceptAssignment}><input type="hidden" name="id" value={o.id} /><button style={btn} type="submit">Accetta</button></form>
    <form action={declineAssignment} style={{ display: 'flex', gap: 8 }}><input type="hidden" name="id" value={o.id} /><input name="reason" placeholder="Motivo (facoltativo)" maxLength={500} /><button style={btnLight} type="submit">Rifiuta</button></form>
   </div>
  </section>)}
  <h2>Incarichi accettati ({accepted.length})</h2>
  {accepted.length === 0 ? <p>Nessun incarico accettato.</p> : accepted.map(a => <section key={a.id} style={box}>
   <Link href={`/certifier/${a.id}`}><strong>{a.property.address}, {a.property.city}</strong></Link>
   <p>Stato pratica: {a.caseStatus}</p>
  </section>)}
 </main>;
}
