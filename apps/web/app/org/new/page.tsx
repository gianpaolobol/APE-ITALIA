import React from 'react';
import Link from 'next/link';
import { orgContext } from '../../../lib/org';
import { createCase } from '../actions';
import { Notice, box, btn } from '../../ui';

export const dynamic = 'force-dynamic';

export default async function NewCase({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
 const { error } = await searchParams;
 const ctx = await orgContext('/org/new');
 if (!ctx) return <Notice>Portale non configurato.</Notice>;
 if (!ctx.membership || ctx.membership.role === 'viewer') return <Notice>Serve un ruolo con permesso di scrittura. <Link href="/org">Torna alle pratiche</Link>.</Notice>;
 return <main>
  <p><Link href="/org">← Pratiche</Link></p>
  <h1>Nuova richiesta APE · {ctx.membership.organizationName}</h1>
  {error ? <Notice>{error === 'invalid' ? 'Controlla i dati: indirizzo, comune e regione sono obbligatori, la superficie deve essere positiva.' : 'Pratica non creata. Riprova.'}</Notice> : null}
  <form action={createCase} style={box}>
   <p><label>Indirizzo * <input name="address" required maxLength={200} size={40} /></label></p>
   <p><label>Comune * <input name="city" required maxLength={100} /></label> <label>Regione * <input name="region" required defaultValue="Emilia-Romagna" maxLength={60} /></label></p>
   <p><label>Superficie indicativa (m²) <input name="floorAreaM2" inputMode="decimal" size={8} /></label></p>
   <p style={{ fontSize: 13 }}>Dati dichiarati dal richiedente: il certificatore li verificherà al sopralluogo.</p>
   <button style={btn} type="submit">Crea bozza</button>
  </form>
 </main>;
}
