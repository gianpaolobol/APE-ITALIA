# APE Italia

<!-- inizio-riquadro-linee-guida -->
> **Linee guida v1.1.0** — Questo progetto segue le linee guida comuni dei progetti di Gian Paolo Franceschini: leggi prima [`LINEE_GUIDA.md`](LINEE_GUIDA.md), poi [`AGENTS.md`](AGENTS.md) e [`STATO.md`](STATO.md).
<!-- fine-riquadro-linee-guida -->


Piattaforma Android, iOS e web per richieste di attestati di prestazione energetica assistite da AI.

**Stato: prototipo funzionale non in produzione. Non emette APE ufficiali.** La piattaforma raccoglie richieste ed evidenze e coordina il certificatore abilitato, al quale competono sopralluogo, calcolo con software conforme, firma e deposito.

## Documento guida obbligatorio

**[MASTER PLAN — riferimento unico per lo sviluppo](docs/MASTER_PLAN.md)**. Ogni cambiamento sostanziale deve aggiornare il documento nella stessa PR.

Altri documenti: [Sprint](docs/SPRINTS.md) · [Sicurezza](docs/SECURITY.md).

## Handoff per agenti di sviluppo

**[Handoff operativo Claude](docs/HANDOFF_CLAUDE.md)** — istruzioni per leggere integralmente il MASTER PLAN, procedere per iterazioni, verificare CI e salvare codice e avanzamenti su questo repository. Il file [CLAUDE.md](CLAUDE.md) indirizza automaticamente Claude Code all'handoff.

## Monorepo

- `apps/mobile` — Expo / React Native: login OIDC + PKCE, richiesta in 5 passi con bozza, consenso e foto/documenti, invio, "Le mie pratiche", integrazioni richieste, download dell'APE
- `apps/web` — Next.js (BFF, token solo lato server): portale certificatori (offerte, evidenze, sopralluogo, verbale, revisione AI, esportazione, caricamento APE) e area organizzazioni (pratiche, membri, inviti)
- `services/api` — NestJS + Prisma/PostgreSQL: JWT/JWKS, tenant e ruoli, inviti, evidenze cifrate, matching certificatori, sopralluogo, esportazione, consegna APE, ciclo di vita, privacy; CLI operatore (`dist/admin/provision-cli.js`) e worker (`dist/worker.js`)
- `packages/shared` — tipi TypeScript condivisi

Stato dettagliato, blocchi e guida all'integrazione delle PR: [docs/CLAUDE_PROGRESS.md](docs/CLAUDE_PROGRESS.md). Specifiche: [indice API](docs/API.md) · [provisioning](docs/PROVISIONING.md) · [evidenze](docs/EVIDENCE_UPLOAD.md) · [certificatori](docs/CERTIFIER_WORKFLOW.md) · [AI](docs/AI_EXTRACTION.md) · [esportazione](docs/CALCULATION_EXPORT.md) · [portale](docs/WEB_PORTAL.md) · [privacy](docs/PRIVACY_OPERATIONS.md) · [sicurezza](docs/SECURITY.md).

## Avvio locale

Requisiti: Node.js 22+, npm, Docker (per PostgreSQL), un provider OIDC di sviluppo.

```
npm ci
docker compose up -d postgres
export DATABASE_URL="postgresql://ape:local_dev_only@localhost:5432/ape_italia?schema=public"
npm exec -w @ape/api -- prisma migrate deploy
npm run db:generate -w @ape/api
npm run build -w @ape/api
```

Configurazione tramite variabili d'ambiente (l'API non legge file `.env`; mai segreti nel repository; vedi `services/api/.env.example` e `docs/WEB_PORTAL.md`):

| Componente | Variabili principali |
|---|---|
| API | `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` (HTTPS), `EVIDENCE_STORAGE_DIR`, `EVIDENCE_ENCRYPTION_KEY`, `TRUST_PROXY` |
| Web | `OIDC_ISSUER`, `WEB_OIDC_CLIENT_ID`, `WEB_BASE_URL`, `API_BASE_URL` (HTTPS), `WEB_SESSION_KEY` |
| Mobile (build) | `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_CLIENT_ID`, `EXPO_PUBLIC_API_BASE_URL` |

Avvio: `node services/api/dist/main.js` (API), `npm run worker -w @ape/api` (attività periodiche), `npm run build -w @ape/web && npm start -w @ape/web` (portale) oppure `npm run web` in sviluppo, `npm run mobile` per Expo. Senza configurazione ogni componente resta chiuso (401/503 o modalità dimostrativa senza invii).

Primo accesso: l'operatore crea l'organizzazione e il primo titolare con `npm run admin -w @ape/api -- create-organization ...` e registra i certificatori verificati con `register-certifier` (vedi `docs/PROVISIONING.md` e `docs/CERTIFIER_WORKFLOW.md`).

## Verifiche automatiche

`npm ci`, scansione segreti, audit dipendenze, Prisma (migrazioni e controllo di deriva), typecheck e build, test unitari e d'integrazione PostgreSQL, E2E dell'API compilata con JWKS HTTPS, test mobile e bundle Android/iOS, test web ed E2E in Chrome (`.github/workflows/ci.yml`). **Non ancora eseguiti**: test su dispositivi reali, provider OIDC reale, ambiente di staging.

## Diritti

> **Copyright © 2026 Gian Paolo Franceschini** — Tutti i diritti riservati esclusivamente sui contributi originali di sua legittima titolarità, fatti salvi i diritti di terzi, le licenze applicabili e le concessioni preesistenti. Vedi [RIGHTS_NOTICE.md](RIGHTS_NOTICE.md) e [NOTICE](NOTICE).

Repository pubblico, codice proprietario. Consultare [NOTICE](NOTICE). Nessuna licenza open source concessa. Non caricare dati personali, segreti o immagini di immobili reali.
