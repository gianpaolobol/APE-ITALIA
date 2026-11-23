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

### Aggiornamento iterazione 1
- CI Run #79 su `443c685`: **verde**. API 41 test superati (inclusi 8 PostgreSQL), mobile 72, bundle Expo Android (588 moduli) e iOS (592), build web.
- PR #7 marcata pronta per la review. **Merge in `main` non eseguito**: l'azione di merge è stata negata dai permessi della sessione Claude. Serve merge manuale dell'utente dopo review.
- Le iterazioni successive sono su branch impilati sopra `feat/sprint-3-auth-foundation` (PR con base quel branch), da riallineare a `main` dopo il merge di #7.

## Iterazione 2 — PR #8 `feat/sprint-4-provisioning` (base: `feat/sprint-3-auth-foundation`)
Implementato: CLI operatore per bootstrap organizzazione+owner, inviti monouso hashati, gestione membri con gerarchia di ruoli e guardia ultimo owner, controllo deriva schema/migrazioni in CI, build API in CI. Dettagli `docs/PROVISIONING.md`.
Test locali: API typecheck OK, 48 test superati + 16 saltati (DB); build `tsc -p tsconfig.build.json` OK; migrazione `20261123030000_invitations` applicata via psql.
CI Run #81 su `9c79388`: **verde**; API 64 test (16 PostgreSQL), mobile 72, "No difference detected" tra schema e migrazioni.
Aggiornati `QA_CHECKLIST.md` (voci spuntate solo con evidenza CI) e `SPRINTS.md`.

## Iterazione 3 — PR #9 `feat/sprint-4-evidence-upload` (base: `feat/sprint-4-provisioning`)
Implementato: upload evidenze con consenso versionato, sniffing contenuto, limite 15 MB, rimozione EXIF/GPS da JPEG, deduplica, cifratura AES-256-GCM su disco, download con blocco "non scansionato", audit di letture e caricamenti. Specifica `docs/EVIDENCE_UPLOAD.md`.
Test locali: API typecheck OK, 74 superati + 21 saltati (DB), di cui 11 HTTP reali con multer (413/415/403/404/409/423/200).
CI Run #83 su `0b55521`: **verde**; API 95 test (21 PostgreSQL), mobile 72, nessuna deriva schema/migrazioni.
Mancano: informativa definitiva, antivirus, storage cloud, UI mobile (iterazione 4).

## Iterazione 4 — PR #10 `feat/sprint-4-mobile-evidence` (base: `feat/sprint-4-evidence-upload`)
Implementato: `POST /v1/cases/:id/submit` (solo DRAFT→SUBMITTED, tenant, audit); client mobile per notices/consenso/upload multipart/lista/invio; componente `EvidenceStep` con fotocamera, galleria e documenti; permessi in `app.json`.
Test locali: API 76 superati + 22 saltati (DB); mobile typecheck OK, 82 test; `expo config` OK; bundle Android/iOS OK.
