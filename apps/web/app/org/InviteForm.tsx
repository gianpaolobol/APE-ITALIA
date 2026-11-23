'use client';
import React, { useActionState } from 'react';
import { createInvitation, type InviteState } from './actions';

export function InviteForm({ roles }: { roles: string[] }) {
 const [state, action, pending] = useActionState<InviteState, FormData>(createInvitation, {});
 return <div>
  <form action={action} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
   <label>Ruolo <select name="role" defaultValue="member">{roles.map(r => <option key={r} value={r}>{r}</option>)}</select></label>
   <label>Validità <select name="ttlHours" defaultValue="72"><option value="24">24 ore</option><option value="72">3 giorni</option><option value="168">7 giorni</option></select></label>
   <button type="submit" disabled={pending}>{pending ? 'Creazione…' : 'Crea invito'}</button>
  </form>
  {state.code ? <p style={{ background: '#e8f5ee', padding: 12, borderRadius: 8 }}>
   Codice invito (mostrato <strong>una sola volta</strong>, scade il {new Date(state.expiresAt!).toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}):<br />
   <code style={{ fontSize: 16, userSelect: 'all' }}>{state.code}</code><br />
   Consegnalo alla persona invitata attraverso un canale sicuro; la piattaforma non invia email.
  </p> : null}
  {state.error ? <p style={{ color: '#a33' }}>{state.error}</p> : null}
 </div>;
}
