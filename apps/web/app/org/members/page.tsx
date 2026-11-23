import React from 'react';
import Link from 'next/link';
import { orgContext } from '../../../lib/org';
import { orgJson, type InvitationView, type MemberView } from '../../../lib/api';
import { revokeInvitation, updateMember } from '../actions';
import { InviteForm } from '../InviteForm';
import { Notice, box, btnLight } from '../../ui';

export const dynamic = 'force-dynamic';
const RESULT: Record<string, string> = { ok: 'Modifica salvata.', 'last-owner': "Operazione negata: l'organizzazione deve mantenere almeno un titolare attivo.", forbidden: 'Non hai i permessi per questa modifica.', error: 'Modifica non riuscita.' };

export default async function Members({ searchParams }: { searchParams: Promise<{ result?: string }> }) {
 const { result } = await searchParams;
 const ctx = await orgContext('/org/members');
 if (!ctx) return <Notice>Portale non configurato.</Notice>;
 if (!ctx.membership || !['owner', 'admin'].includes(ctx.membership.role)) return <Notice>Solo titolari e amministratori gestiscono i membri. <Link href="/org">Torna alle pratiche</Link>.</Notice>;
 const { cfg, s } = ctx, org = ctx.membership.organizationId, isOwner = ctx.membership.role === 'owner';
 const [members, invitations] = await Promise.all([orgJson<MemberView[]>(cfg, s, org, '/v1/members'), orgJson<InvitationView[]>(cfg, s, org, '/v1/invitations')]);
 const grantable = isOwner ? ['owner', 'admin', 'member', 'viewer'] : ['member', 'viewer'];
 return <main>
  <p><Link href="/org">← Pratiche</Link></p>
  <h1>Membri di {ctx.membership.organizationName}</h1>
  {result && RESULT[result] ? <Notice>{RESULT[result]}</Notice> : null}
  <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}><thead><tr><th align="left">Identificativo</th><th align="left">Ruolo</th><th align="left">Stato</th><th></th></tr></thead>
   <tbody>{members.map(m => { const editable = isOwner || ['member', 'viewer'].includes(m.role); return <tr key={m.id} style={{ borderTop: '1px solid #e5ece8' }}>
    <td><code>{m.userSubject === s.sub ? 'tu' : m.userSubject.slice(0, 18) + (m.userSubject.length > 18 ? '…' : '')}</code></td>
    <td>{editable ? <form action={updateMember} style={{ display: 'flex', gap: 4 }}><input type="hidden" name="id" value={m.id} /><select name="role" defaultValue={m.role}>{grantable.map(r => <option key={r}>{r}</option>)}</select><button style={btnLight} type="submit">Salva</button></form> : m.role}</td>
    <td>{m.active ? 'attivo' : 'revocato'}</td>
    <td>{editable ? <form action={updateMember}><input type="hidden" name="id" value={m.id} /><input type="hidden" name="active" value={m.active ? 'false' : 'true'} /><button style={btnLight} type="submit">{m.active ? 'Revoca accesso' : 'Riattiva'}</button></form> : null}</td>
   </tr>; })}</tbody></table>
  <section style={box}><h2>Invita</h2><InviteForm roles={grantable} /></section>
  <section style={box}><h2>Inviti in attesa ({invitations.length})</h2>
   {invitations.map(i => <form key={i.id} action={revokeInvitation} style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="hidden" name="id" value={i.id} />{i.role} · scade il {new Date(i.expiresAt).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}<button style={btnLight} type="submit">Revoca</button></form>)}
  </section>
 </main>;
}
