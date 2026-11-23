# Sprint 1 — Persistenza e autenticazione (work in progress)

Branch: `feat/sprint-1-persistence` · PR #4 (draft)

## Implementato nel codice
- Prisma schema: organizzazioni, membership, immobili, pratiche, evidenze, audit.
- PostgreSQL locale via Docker Compose.
- NestJS PrismaService e DTO con validazione.
- Verifica OIDC RS256 via JWKS remoto (issuer/audience configurabili), nessun token di test incorporato.
- Autorizzazione per organizzazione tramite membership verificata in database.
- GET/POST `/v1/properties` e `/v1/cases` filtrati per organizzazione; creazione pratica vincolata a immobile della stessa organizzazione.
- Audit delle creazioni in transazione.
- Fail closed se OIDC non configurato o token invalido.

## Non ancora completato / verificato
- Provider OIDC reale e provisioning sicuro delle membership (nessun endpoint pubblico per creazione membership).
- Migrazioni Prisma generate ed eseguite; test automatici di integrazione e tenant isolation.
- Installazione dipendenze, typecheck, build, runtime test.
- Upload documentale, collegamento app mobile, autorizzazioni granulari per ruolo.
- Controlli rate limit, CORS, sicurezza upload, logging privacy-safe e hardening.

## Avvio locale previsto
1. `docker compose up -d postgres`
2. Configurare `DATABASE_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL` nell'ambiente privato.
3. `npm install`, `npm run db:generate -w @ape/api`, `npm run db:migrate -w @ape/api`.
4. Provisioning membership tramite procedura amministrativa sicura da implementare.

**Non utilizzare in produzione né unire la PR prima del collaudo.**
