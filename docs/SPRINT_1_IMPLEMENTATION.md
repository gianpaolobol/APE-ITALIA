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

## Iterazione sicurezza e QA — 23/11/2026
Aggiunta policy di isolamento tenant e autorizzazione scrittura per ruoli owner/admin/member; viewer in sola lettura. Sei test unitari Vitest definiti per membership, revoca e ruoli; workflow CI configurato per eseguirli. **Non ancora eseguiti con esito verificato**: nessun risultato CI disponibile all'ultimo controllo. La sola policy applicativa non sostituisce test di integrazione su database reale.

## Iterazione migrazioni e CI — 23/11/2026
Aggiunta migrazione SQL iniziale `20261123010000_init/migration.sql` (redatta manualmente da schema Prisma; **da confrontare con Prisma migrate diff**). La pipeline GitHub Actions avvia PostgreSQL 16, valida schema Prisma, genera client, applica migrazione, esegue typecheck API, test unitari e build web. Alla verifica del commit `3acda4c` non risultavano workflow PR restituiti dal connettore: **nessun test di CI attestato**. Non eseguire merge prima di confermare tutti i gate, verificare compatibilità Prisma e correggere gli eventuali errori.

## Iterazione successiva — 23/11/2026
Corretto il controllo di nullabilità della membership nell'autenticazione e aggiunti quattro test unitari del controller per filtro tenant, permessi viewer e rifiuto di immobili non appartenenti all'organizzazione. Il totale dei casi unitari definiti sale a dieci. Sono test con mock, **non** prove end-to-end di isolamento su PostgreSQL. Il controllo workflow sul commit `670d5b8` non ha restituito esecuzioni: esito CI ancora non verificato. Rimangono da fare migrazione effettiva, provider OIDC, test DB reale, verifica build e controlli su dati reali.

## Iterazione 23/11/2026 — test database reali
Aggiunti tre test d'integrazione PostgreSQL con due organizzazioni sintetiche: visibilità isolata degli immobili, divieto di usare un immobile di un'altra organizzazione, creazione pratica con audit. La CI è configurata con `RUN_DB_INTEGRATION=1` dopo `prisma migrate deploy`. Corretto il formato dell'enum Prisma nello schema. Questi test **non verificano il provider OIDC** (la sessione è simulata); occorrono inoltre test di autenticazione reali. Il connettore non restituisce workflow associati ai commit verificati, quindi nessun esito verde è attestato. L'ambiente container di questa sessione non riesce a raggiungere GitHub via DNS; non è stata eseguita una build locale del repository.

## Iterazione CI — 23/11/2026
Corrette le dichiarazioni Prisma generator/datasource in blocchi multilinea. Aggiunto trigger `workflow_dispatch` per avvio manuale di GitHub Actions e controllo `prisma migrate status` dopo `migrate deploy`. Il test PostgreSQL non inizializza PrismaClient quando non è abilitato. **Queste correzioni sono commit, non attestazioni di esecuzione:** nessuna CI verde o build verificata in questa sessione. Non unire la PR finché GitHub Actions non riporta esito positivo e non sono verificati i controlli di sicurezza.
