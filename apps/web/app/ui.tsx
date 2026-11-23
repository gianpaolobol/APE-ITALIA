import React from 'react';

export const box: React.CSSProperties = { border: '1px solid #cad8d0', borderRadius: 10, padding: 16, marginBottom: 12, background: '#fff' };
export const btn: React.CSSProperties = { padding: '8px 14px', borderRadius: 8, border: 0, background: '#176344', color: '#fff', fontWeight: 700, cursor: 'pointer' };
export const btnLight: React.CSSProperties = { ...btn, background: '#e5ece8', color: '#18352b' };

export function Notice({ children }: { children: React.ReactNode }) {
 return <p style={{ background: '#fff4d6', padding: 12, borderRadius: 8 }}>{children}</p>;
}

export function LogoutButton() {
 return <form action="/auth/logout" method="post" style={{ display: 'inline' }}><button style={btnLight} type="submit">Esci</button></form>;
}
