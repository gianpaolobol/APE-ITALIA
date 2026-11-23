# Security baseline

Repository pubblico: nessun segreto, dato personale, documento catastale reale, fotografia di clienti o credenziale.

- RBAC con isolamento per organizzazione e pratica
- Upload privato con controlli MIME, dimensione, malware e autorizzazione
- Audit log di accessi e modifiche
- Cifratura TLS e storage, backup e test restore
- MFA per certificatori e amministratori
- DPA, GDPR, retention e valutazione DPIA dove necessaria
- Non usare fotografie per addestramento senza base giuridica

Questa è una specifica, non una dichiarazione di controlli già implementati.

## Stato dei controlli (aggiornato da Claude, 23/11/2026)
| Controllo | Stato | Evidenza |
|---|---|---|
| Verifica JWT (firma JWKS, issuer, audience, exp, alg) | implementato | `auth.service.spec.ts`, CI |
| Isolamento tenant e RBAC owner/admin/member/viewer | implementato | integrazione PostgreSQL in CI |
| Provisioning senza endpoint pubblici, inviti monouso hashati | implementato | `docs/PROVISIONING.md` |
| Upload: tipo da contenuto, 15 MB, rimozione EXIF JPEG, cifratura AES-256-GCM | implementato | `docs/EVIDENCE_UPLOAD.md` |
| Scansione malware | ClamAV (`clamd`) fail-closed su upload, ri-scansione periodica, quarantena auditata | job CI `clamav` (EICAR), test protocollo |
| Audit log di creazioni, modifiche membership, letture evidenze, incarichi | implementato | test PostgreSQL |
| Rate limiting | implementato in memoria, per rotta e IP (120/min; accettazione inviti 10/min; upload 30/min) — **serve store condiviso con più istanze** | `rate-limit.http.spec.ts` |
| Header HTTP (helmet: CSP `default-src 'none'`, nosniff, no-referrer; niente `X-Powered-By`; CORS disattivato) | implementato | `app.http.spec.ts` |
| Portale web: token solo lato server, cookie cifrati `__Host-`, header di sicurezza | implementato | `docs/WEB_PORTAL.md` |
| Scansione segreti dei file tracciati | implementato (`scripts/check-secrets.mjs` in CI) | |
| Installazione riproducibile (`npm ci` con `package-lock.json`) | implementato | CI |
| Audit dipendenze | CI fallisce solo su vulnerabilità **critiche**; vedi rischio residuo | |
| MFA certificatori/amministratori | dipende dal provider OIDC (non scelto) | |
| Backup/restore | script provati in CI (dump + volume, hash, ripristino con conferma) | `docs/DEPLOYMENT.md` |
| DPIA, DPA | **non implementati** (attività legali) | |

### Rischio residuo dipendenze (npm audit, 23/11/2026)
`npm audit --omit=dev` segnala 18 avvisi (6 alti, 12 moderati), tutti in strumenti di build/CLI: catena `@expo/cli`/`@expo/config` (glob, minimatch, image-size), `prisma`/`@prisma/config` (effect, deepmerge-ts), `postcss` incluso in `next` per la compilazione CSS. `npm audit fix` non li risolve senza aggiornamenti major (Expo SDK 58, Next 16, Prisma 7), che richiedono una PR dedicata con verifica su dispositivi e test di regressione. Nessuno di questi pacchetti elabora input degli utenti a runtime nell'API.
