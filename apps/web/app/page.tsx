import React from 'react';
import Link from 'next/link';

export default async function Home({ searchParams }: { searchParams: Promise<{ login?: string }> }) {
 const { login } = await searchParams;
 return <main>
  <h1>APE Italia · Portale certificatori</h1>
  <p>Area riservata ai certificatori energetici abilitati e verificati. La piattaforma non emette APE: sopralluogo, calcolo, firma e deposito restano responsabilità del certificatore.</p>
  {login === 'failed' ? <p style={{ color: '#a33' }}>Accesso non riuscito. Riprova.</p> : null}
  <p><Link href="/auth/login?returnTo=/certifier">Accedi</Link></p>
 </main>;
}
