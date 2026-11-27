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
| Rate limiting | per rotta e IP (120/min; inviti 10/min; upload 30/min); con `RATE_LIMIT_STORE=postgres` contatori condivisi tra istanze (upsert atomico), attivo nel compose di staging | `rate-limit.http.spec.ts`, test PostgreSQL, E2E |
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


### Verifica inventario 26/11/2026 — issue #98
La CI diagnostica [45891535675](https://github.com/gianpaolobol/APE-ITALIA/actions/runs/45891535675), head 819d8e2, ha rilevato manifest di deepmerge-ts 7.1.5, effect 3.21.0, glob 13.0.6, minimatch 3.1.5/10.2.6 e postcss 8.5.33 nelle immagini API/worker; web standalone contiene postcss 8.4.31 e copie incorporate Next di glob e image-size con versione non verificabile. La descrizione storica sopra non dimostra assenza di dipendenze vulnerabili nelle immagini. La separazione del job migrazione e l'installazione di sole dipendenze di produzione per API/worker sono una mitigazione da convalidare nella CI del nuovo SHA. Non risolvono automaticamente il web o l'audit del lockfile; restano necessarie verifica di raggiungibilità, versioni e aggiornamenti compatibili. Nessuna accettazione del rischio implicita.


### Candidato cumulativo 27/11/2026 — #102 / #98
CI [45917164108](https://github.com/gianpaolobol/APE-ITALIA/actions/runs/45917164108) associata a `bfebf663098ee9ecf1147aa13a5297bd1d6e4e2a`: tutti i quattro job verdi; audit npm ancora 6 alti/12 moderati. L'inventario finale API e worker non rileva manifest di deepmerge-ts, effect, image-size o postcss; non prova l'assenza di codice incorporato. Web standalone contiene postcss 8.4.31 e image-size incorporato (versione non verificabile). Per ridurre la superficie di parsing on-demand si imposta `images.unoptimized=true` e si richiede HTTP 404 all'endpoint di ottimizzazione nel container reale di CI. Questo non aggiorna le librerie, non prova assenza di altri percorsi raggiungibili, non modifica il flusso autorizzato di download, non costituisce accettazione degli avvisi alti. Le prove nuove non sono ancora eseguite. Resta necessaria l'analisi delle pipeline CSS e dei parser, l'aggiornamento compatibile e la revisione indipendente. Riferimento: https://nextjs.org/docs/15/app/api-reference/components/image#unoptimized .
