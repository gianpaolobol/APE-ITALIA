'use client';
import React, { useState } from 'react';
import { confirmCertificateReceipt } from '../../actions';

export function CertificateDownload({ id, org, binding, sha256, sizeBytes }: { id: string; org: string; binding: string; sha256: string; sizeBytes: number }) {
 const [busy, setBusy] = useState(false);
 const [message, setMessage] = useState('');
 async function retrieve() {
  if (busy) return;
  setBusy(true); setMessage('');
  try {
   if (!/^[a-f0-9]{64}$/.test(sha256) || !Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > 15 * 1024 * 1024) throw new Error('Metadati non validi');
   const res = await fetch(`/org/cases/${id}/certificate`, { cache: 'no-store', redirect: 'error', headers: { 'x-ape-certificate-binding': binding } });
   if (!res.ok || res.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error('Download non disponibile');
   const bytes = await res.arrayBuffer();
   if (bytes.byteLength !== sizeBytes) throw new Error('Documento incompleto');
   const digest = await crypto.subtle.digest('SHA-256', bytes);
   const hash = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
   if (hash !== sha256) throw new Error('Documento alterato');
   await confirmCertificateReceipt(id, org, binding, hash, bytes.byteLength);
   const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
   try {
    const link = document.createElement('a'); link.href = url; link.download = `APE-${id}.pdf`;
    document.body.append(link); link.click(); link.remove();
   } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
   setMessage('Ricezione verificata. Salva il PDF nel browser.');
  } catch { setMessage('Download o conferma non riusciti. Riprova.'); }
  finally { setBusy(false); }
 }
 return <><button type="button" onClick={retrieve} disabled={busy}>{busy ? 'Verifica in corso…' : "Scarica l’APE (PDF)"}</button>{message ? <span role="status"> {message}</span> : null}</>;
}
