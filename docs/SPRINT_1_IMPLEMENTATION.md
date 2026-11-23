# Sprint 1 — Persistenza (work in progress)
Branch: `feat/sprint-1-persistence`.

## Implementato nel codice
- Schema Prisma: organizzazioni, immobili, pratiche, evidenze, audit.
- PostgreSQL locale via Docker Compose (password dimostrativa esclusivamente locale).
- PrismaService NestJS.
- Endpoint segnaposto protetti: rispondono 403 finché non esiste autenticazione server-side.
- DTO validati per future operazioni.

## Non implementato
- Autenticazione e autorizzazione reale.
- CRUD e persistenza via endpoint.
- Upload documentale, migrazioni generate, test automatici.
- Integrazione mobile con API.

## Sequenza successiva
1. Integrare provider di autenticazione e membership organizzazioni.
2. Derivare l'organizzazione esclusivamente dalla sessione verificata.
3. Implementare CRUD e query sempre filtrate per organizzazione.
4. Generare migrazioni, seed sintetici e test d'isolamento tenant.
5. Eseguire installazione, typecheck, test e build in CI.

Non usare in produzione finché i gate non sono superati.
