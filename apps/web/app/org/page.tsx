import React from 'react';
import Link from 'next/link';
import { orgContext } from '../../lib/org';
import { orgJson, type CaseView, type PropertyView } from '../../lib/api';
import { chooseOrganization } from './actions';
import { LogoutButton, Notice, box, btn } from '../ui';
import { STATUS_IT } from '../../lib/labels';

export const dynamic = 'force-dynamic';


export default async function OrgHome() {
 const ctx = await orgContext('/org');
 if (!ctx) return <Notice>Portale non configurato.</Notice>;
 const { cfg, s, me, membership } = ctx;
 if (!me.memberships.length) return <><Notice>Il tuo account non appartiene ad alcuna organizzazione. Chiedi un codice d'invito al titolare.</Notice><LogoutButton /></>;
 if (!membership) return <main><h1>Scegli l'organizzazione</h1>{me.memberships.map(m => <form key={m.organizationId} action={chooseOrganization} style={box}><input type="hidden" name="organizationId" value={m.organizationId} /><strong>{m.organizationName}</strong> · {m.role} <button style={btn} type="submit">Apri</button></form>)}</main>;
 const org = membership.organizationId;
 const [properties, cases] = await Promise.all([
  orgJson<PropertyView[]>(cfg, s, org, '/v1/properties'),
  orgJson<CaseView[]>(cfg, s, org, '/v1/cases'),
 ]);
 const byId = new Map(properties.map(p => [p.id, p]));
 const counts = cases.reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {});
 return <main>
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
   <h1>{membership.organizationName}</h1>
   <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{membership.role !== 'viewer' ? <Link href="/org/new">Nuova pratica</Link> : null}{['owner', 'admin'].includes(membership.role) ? <Link href="/org/members">Membri e inviti</Link> : null}<LogoutButton /></div>
  </div>
  <p>Ruolo: {membership.role} · {properties.length} immobili · {cases.length} pratiche</p>
  <p>{Object.entries(counts).map(([k, v]) => `${STATUS_IT[k] ?? k}: ${v}`).join(' · ')}</p>
  <h2>Pratiche</h2>
  {cases.length === 0 ? <p>Nessuna pratica. Creane una con «Nuova pratica» o dall'app mobile.</p> : <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
   <thead><tr><th align="left">Immobile</th><th align="left">Stato</th><th align="left">Creata</th></tr></thead>
   <tbody>{cases.map(c => { const p = byId.get(c.propertyId); return <tr key={c.id} style={{ borderTop: '1px solid #e5ece8' }}>
    <td><Link href={`/org/cases/${c.id}`}>{p ? `${p.address}, ${p.city}` : c.propertyId}</Link></td>
    <td>{STATUS_IT[c.status] ?? c.status}</td>
    <td>{new Date(c.createdAt).toLocaleDateString('it-IT', { timeZone: 'Europe/Rome' })}</td>
   </tr>; })}</tbody>
  </table>}
 </main>;
}
