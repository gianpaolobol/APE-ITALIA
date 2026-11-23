# Registro di avanzamento Claude — APE Italia

Sessione avviata: 23/11/2026, ~02:55 (Europe/Rome). Ambiente: container cloud Claude con accesso push alla repo `gianpaolobol/APE-ITALIA`. La sessione **non è garantita persistente**: il lavoro procede finché resta attiva; ogni iterazione è salvata su GitHub.

## Limiti dell'ambiente (valgono per tutte le iterazioni)
- `binaries.prisma.sh` è bloccato dal proxy: il motore Prisma non è scaricabile qui. Localmente il client è generato con `prisma generate --no-engine` (solo tipi): typecheck e test unitari sì, **test PostgreSQL no** (girano solo in GitHub Actions).
- La migrazione SQL è stata comunque applicata con `psql` a un PostgreSQL 16 locale pulito: esito OK.
- Nessun dispositivo iOS/Android: verificato solo il bundle Hermes con `expo export`.
- Nessun provider OIDC reale: test con provider fittizio in memoria e chiavi RSA generate al volo.

## Iterazione 1 — PR #7 `feat/sprint-3-auth-foundation`
Base: `main` 849a546 unito nel branch (nessun conflitto).

Verifica baseline prima delle modifiche (locale): typecheck API OK, test API 10 superati + 3 saltati (DB), typecheck mobile OK, test mobile 17 superati, build Next.js OK.

Implementato: flusso Authorization Code + PKCE S256 completo lato codice (dettaglio in `docs/SPRINT_3_AUTH.md`), `GET /v1/me`, verifica JWT con JWKS in cache, test JWT firmati, test HTTP Nest, test integrazione DB firma+membership, controllo bundle Expo in CI.

Test eseguiti localmente in questa sessione:
- `npm run typecheck -w @ape/mobile` — OK
- `npm test -w @ape/mobile` — 72 superati (7 file)
- `npx expo export --platform android` / `--platform ios` — bundle Hermes generati
- `npm run typecheck -w @ape/api` — OK
- `npm test -w @ape/api` — 33 superati, 8 saltati (integrazione PostgreSQL, richiedono CI)
- `npm run build -w @ape/web` — OK (baseline)

Esito CI: vedere sezione aggiornamenti sotto.

Blocchi umani: scelta e configurazione provider OIDC, registrazione redirect URI, variabili pubbliche, test su dispositivi.
