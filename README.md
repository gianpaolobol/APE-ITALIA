# APE Italia

Piattaforma Android, iOS e web per richieste di attestati di prestazione energetica assistite da AI.

**Stato: starter dimostrativo. Non emette APE ufficiali.** Il sopralluogo, il controllo tecnico, la firma e il deposito competono al certificatore abilitato secondo le regole applicabili.

## Documento guida obbligatorio

**[MASTER PLAN — riferimento unico per lo sviluppo](docs/MASTER_PLAN.md)**. Ogni cambiamento sostanziale deve aggiornare il documento nella stessa PR.

Altri documenti: [Sprint](docs/SPRINTS.md) · [Sicurezza](docs/SECURITY.md).

## Monorepo

- `apps/mobile` — Expo / React Native, percorsi privati e professionisti (demo locale)
- `apps/web` — Next.js, portale certificatori (scaffold)
- `services/api` — NestJS, endpoint GET /health (scaffold)
- `packages/shared` — tipi TypeScript condivisi

## Avvio locale (non ancora verificato in CI)

Node.js 22+ e npm: `npm install`; `npm run mobile`, `npm run web` o `npm run api`.

## Diritti

Repository pubblico, codice proprietario. Consultare [NOTICE](NOTICE). Nessuna licenza open source concessa. Non caricare dati personali, segreti o immagini di immobili reali.
