import React from 'react';
import Link from 'next/link';

export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
 const { login } = await searchParams;
 return <main>
  <h1>APE Italia · Portale web</h1>
  <p>La piattaforma non emette APE: sopralluogo, calcolo, firma e deposito restano responsabilità del certificatore abilitato.</p>
  {login === 'failed' ? <p style={{ color: '#a33' }}>Accesso non riuscito. Riprova.</p> : null}
  <p><Link href="/auth/login?returnTo=/org">Accedi come privato, professionista o agenzia</Link></p>
  <p><Link href="/auth/login?returnTo=/certifier">Accedi come certificatore</Link></p>
 </main>;
}
