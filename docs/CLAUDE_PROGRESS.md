# Registro di avanzamento Claude — APE Italia

## Riepilogo consolidato (aggiornato alle 05:00 del 23/11/2026)
**Stato**: 21 iterazioni, PR #7–#27 aperte e **impilate** (ognuna ha come base la precedente). Tutte con CI verde sull'ultimo commit verificato. **Nessuna è stata integrata in `main`**: il merge è stato negato dai permessi della sessione Claude.

### Come integrare
1. Rivedere e unire **#7** in `main` (squash o merge).
2. Per ciascuna successiva (#8, #9, … #27) cambiare la base in `main` (GitHub lo fa da solo se si elimina il branch della PR appena unita), attendere la CI e unire.
In alternativa si può rivedere il diff complessivo `main...docs/readme-status` e unire le PR in sequenza senza review intermedie.
**Attenzione**: #12 (portale) ha un difetto sul logout corretto in #23: integrare il portale solo insieme a #23.

### Funzionalità (codice + test; nulla è in produzione)
| Area | Stato | Prove |
|---|---|---|
| Login OIDC + PKCE mobile | completo nel codice | 72→84 test mobile, bundle Hermes; **nessun provider/dispositivo reale** |
| Login web (BFF) | completo | 19 unit + 3 E2E in Chrome (CI) |
| JWT API, tenant, ruoli, provisioning, inviti | completo | unit + PostgreSQL + E2E |
| Upload evidenze (cifratura, EXIF, consenso) | completo; antivirus non configurato | HTTP multer + PostgreSQL + E2E |
| Matching certificatori, offerte, rinuncia, riassegnazione | completo | PostgreSQL + E2E |
| Sopralluogo e verbale strutturato | completo | PostgreSQL + E2E |
| Estrazione AI con revisione | infrastruttura; **fornitore disattivato** | PostgreSQL (test double) |
| Esportazione per il calcolo | formato neutro JSON/CSV | unit + E2E |
| Caricamento/consegna APE | completo (nessuna integrazione regionale) | E2E |
| Integrazioni, annullamento | completo | PostgreSQL |
| Portale certificatori e organizzazioni | completo | build + 4 E2E in Chrome (CI) |
| App: richiesta, evidenze, pratiche, download APE | completo nel codice | 87 test + bundle; **non provata su dispositivo** |
| Privacy: export soggetto, purga; worker periodico con lock | CLI + worker | PostgreSQL |
| Hardening (rate limit, helmet, npm ci, secret scan, audit) | completo | CI |
| Pagamenti, notifiche, preventivi | **non iniziati** (richiedono contratti/compliance e autorizzazione a invii esterni) | — |

### Blocchi che richiedono decisioni o azioni umane
1. Merge delle PR (permesso negato alla sessione).
2. Provider OIDC: scelta, tenant, client mobile e web, redirect URI, MFA per certificatori.
3. Ambiente di deploy: database gestito, storage privato, chiavi in secret manager, dominio HTTPS.
4. Antivirus per gli upload; fornitore AI (con DPA/DPIA) se desiderato.
5. Testi legali: informativa (oggi in bozza), tempi di conservazione, contratti con certificatori.
6. Software di calcolo conforme da integrare; eventuale accesso a portali regionali.
7. Test su iPhone/Android reali (build EAS o Xcode/Android Studio).

### Prossime azioni suggerite
Creazione pratiche dal web per professionisti; notifiche (dopo autorizzazione); preventivi e pagamenti (dopo contratti e compliance); aggiornamenti major (Expo 58, Next 16, Prisma 7) in PR dedicate; build EAS e prove su dispositivi; ambiente di staging.

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
CI Run #85 su `d489a81` (PR #10): **verde**; API 98 test, mobile 82.

## Iterazione 5 — PR #11 `feat/sprint-4-certifier-workflow` (base: `feat/sprint-4-mobile-evidence`)
Implementato: modelli `Certifier`/`Assignment`, matching puro con filtri obbligatori e ranking, offerta automatica all'invio, endpoint certificatore (me, lista, accetta, rifiuta, evidenze), sweep scadenze via CLI, CLI `register-certifier`, refactor download evidenze condiviso. Dettagli `docs/CERTIFIER_WORKFLOW.md`.
Test locali: API typecheck OK; 84 superati + 30 saltati (DB, inclusi 8 nuovi del ciclo certificatore).
CI Run #86 su `2a075f4` (PR #11): **verde**; API 114 test (30 PostgreSQL), nessuna deriva (tipo `TEXT[]` confermato).

## Iterazione 6 — PR #12 `feat/web-certifier-portal` (base: `feat/sprint-4-certifier-workflow`)
Implementato: portale Next.js BFF con OIDC/PKCE lato server, cookie cifrati, pagine incarichi ed evidenze, proxy download, header di sicurezza. `apps/web/tsconfig.json` ora versionato con `strict: true`. Dettagli `docs/WEB_PORTAL.md`.
Test locali: web 15 test; `next build` OK; smoke `next start` senza configurazione: `/` 200, `/certifier` "non configurato", `/auth/login` 503, logout GET 405, header presenti.
CI Run #88 su `d6dd888` (PR #12): **verde**; API 114, mobile 82, web 15, build Next.

## Iterazione 7 — PR #13 `feat/security-hardening` (base: `feat/web-certifier-portal`)
Implementato: `@nestjs/throttler` globale (per rotta e IP), limiti stretti su accettazione inviti e upload, `helmet` con CSP restrittiva, `TRUST_PROXY`, CORS disattivato; `package-lock.json` versionato e `npm ci`; `scripts/check-secrets.mjs`; audit dipendenze in CI (fallisce su critiche).
Test locali: `npm ci` da zero OK; API 86 + 30 saltati (incl. test 429 e header); mobile 82; web 15; scansione segreti OK e verificata con un falso positivo intenzionale (file temporaneo non committato).
CI Run #89 su `69112b9` (PR #13): **verde**; `npm ci`, scansione segreti (117 file), audit (nessuna critica), API 116, mobile 82, web 15.

## Iterazione 8 — PR #14 `feat/inspections` (base: `feat/security-hardening`)
Implementato: modello `Inspection`, validazione verbale con vocabolario controllato, endpoint certificatore (schema, lettura, programmazione, verbale), vista cliente, pannello web di programmazione e verbale, conversione ora di Roma.
Test locali: API typecheck OK, 97 superati + 37 saltati (DB, inclusi 7 nuovi del sopralluogo); web 19 test, `next build` OK.
CI Run #90 su `4dc0a0a` (PR #14): **verde**; API 134 test (37 PostgreSQL), mobile 82, web 19.

## Iterazione 9 — PR #15 `feat/ai-extraction-review` (base: `feat/inspections`)
Implementato: `ExtractedField` + `ExtractedFieldRevision`, porta fornitore disattivata, sanificazione output, estrazione/revisione per certificatore, metriche CLI, pannello web. Refactor `validateFieldValue` condiviso con il verbale.
Test locali: API typecheck e build OK, 100 superati + 43 saltati (DB, inclusi 6 nuovi); web typecheck e `next build` OK.
CI Run #91 su `0c4765e` (PR #15): **verde**; API 143 test (43 PostgreSQL), mobile 82, web 19.

## Iterazione 10 — PR #16 `feat/calculation-export` (base: `feat/ai-extraction-review`)
Implementato: builder puro dell'esportazione, CSV con protezione formula injection, endpoint certificatore con audit, proxy e link nel portale.
Test locali: API 105 superati + 45 saltati (5 unitari export, 2 nuovi casi DB); web typecheck e build OK.
CI Run #92 su `2ee6414` (PR #16): **verde**.

## Iterazione 11 — PR #17 `feat/web-org-portal` (base: `feat/calculation-export`)
Implementato: area web organizzazioni (portafoglio, dettaglio pratica, membri/inviti) sopra le API esistenti.
Test locali: web typecheck e `next build` OK; smoke `next start` senza configurazione: `/` 200 con i due accessi, `/org` e `/org/members` 200 "Portale non configurato", `/certifier` 200, `/auth/login` 503. (Un primo tentativo aveva interrogato un processo `next-server` rimasto da un test precedente e restituito 404: processo terminato e test ripetuto.) Nessun test end-to-end con provider reale.
CI Run #94 su `c6991a5` (PR #17): **verde**.

## Iterazione 12 — PR #18 `test/api-e2e` (base: `feat/web-org-portal`)
Test E2E sul server compilato. Non eseguibile localmente (motore Prisma non scaricabile). CI Run #95 su `7699591`: **verde**; E2E 3/3 (1,3 s), API 150 + 3 E2E, mobile 82, web 19.

## Iterazione 13 — PR #19 `feat/certificate-delivery` (base: `test/api-e2e`)
Implementato: modello `Certificate`, caricamento APE (certificatore), metadati e download con consegna (cliente), moduli nel portale, limite Server Actions 16 MB. E2E esteso (409 prima del verbale, 415 non-PDF, 409 doppio caricamento, consegna ⇒ `DELIVERED`).
Test locali: API typecheck OK, 105 + 48 saltati; web typecheck e build OK. Esito E2E: vedi CI.
CI Run #97 su `6e9a453` (PR #19): **verde**; E2E 3/3 inclusa consegna APE.

## Iterazione 14 — PR #20 `feat/mobile-case-status` (base: `feat/certificate-delivery`)
Implementato: `GET /v1/case-summaries`, scheda "Le mie pratiche" nell'app con avanzamento. E2E esteso.
Test locali: API typecheck OK; mobile typecheck, 84 test, bundle Android/iOS OK.
CI Run #99 su `9c814ba` (PR #20): **verde**.

## Iterazione 15 — PR #21 `feat/case-lifecycle` (base: `feat/mobile-case-status`)
Implementato: `EvidenceRequest`, `LifecycleController` (richiesta/risoluzione integrazioni, annullamento, rinuncia con nuova offerta), controllo di stato anticipato nel verbale, contatore richieste aperte in `case-summaries`, interfacce web e mobile.
Test locali: API typecheck OK, 105 + 51 saltati (3 nuovi test PostgreSQL); web build OK; mobile typecheck, 84 test, bundle OK.
CI Run #101 su `2580d32` (PR #21): **verde**; API 153 + E2E 3, mobile 84.

## Iterazione 16 — PR #22 `feat/gdpr-retention` (base: `feat/case-lifecycle`)
Implementato: `exportSubjectData`, `purgeExpiredEvidence` (dry run predefinito), policy da ambiente, comandi CLI.
Test locali: API typecheck OK, 106 + 54 saltati (1 unitario, 3 PostgreSQL nuovi).
CI Run #103 su `a6dcd07` (PR #22): **verde**.

## Iterazione 17 — PR #23 `test/web-browser-e2e` (base: `feat/gdpr-retention`)
E2E del portale in Chrome reale. **Bug reale trovato**: cancellazione dei cookie `__Host-` inefficace (login state riutilizzabile, logout senza effetto) — corretto in `lib/session.ts`.
Test locali: E2E browser 3/3 (prima della correzione 1 fallito, dopo 3/3); web unit 19.
CI Run #105 su `b692bf1` (PR #23): **verde**; API 157 + E2E API 3, mobile 84, web 19 + E2E browser 3.

## Iterazione 18 — PR #24 `feat/worker` (base: `test/web-browser-e2e`)
Worker con scheduler senza sovrapposizioni e lock consultivi. Test locali: API 109 + 55 saltati (3 unitari nuovi; 1 PostgreSQL sul lock in CI). Lock verificato anche via psql locale.
CI Run #107 su `789e14e` (PR #24): **verde**.

## Iterazione 19 — PR #25 `test/web-org-e2e` (base: `feat/worker`)
E2E browser esteso all'area organizzazioni (4/4 test, eseguito 3 volte consecutive senza errori). Sincronizzazione corretta con `waitFor` al posto di `isVisible`.

## Iterazione 20 — PR #26 `feat/mobile-certificate-download` (base: `test/web-org-e2e`)
Download APE su dispositivo (`expo-file-system` `File.downloadFileAsync` con intestazioni, `expo-sharing`). Test locali: mobile typecheck, 87 test, bundle Android/iOS. Evitato il conflitto Metro `.native.ts`.
CI Run #109 su `ce9ca40` (PR #25): **verde**; E2E browser 4/4.
CI Run #110 su `1341e60` (PR #26): **verde**; API 161 + E2E 3, mobile 87, web 19 + E2E browser 4.

## Iterazione 21 — PR #27 `docs/readme-status` (base: `feat/mobile-certificate-download`)
README aggiornato allo stato reale (componenti, avvio locale, configurazione, verifiche automatiche e limiti); script `start` per il web. Scansione segreti: 168 file, nessun riscontro.

## Fine sessione notturna
Sessione chiusa da Claude alle ~05:00 dopo 21 iterazioni. Nulla è stato distribuito in produzione, nessun invio esterno, nessuna spesa, nessuna configurazione di account. Riprendere dalla sezione "Come integrare" in cima a questo file.

## Ripresa 23/11 ore 10:20 — integrazione e iterazione 22
- Merge via API ancora negato dalla sessione; il titolare ha poi **autorizzato esplicitamente il push diretto su `main`**. Integrato `main` aggiornato (avviso diritti) in cima alla pila (CI Run #114 verde su `a3550e0`), poi fast-forward di `main` da `7c1b008` a `a3550e0`. PR #7 risultata *merged*; #8–#27 chiuse con commento (commit già in `main`; GitHub non consente di ritargettarle).
- Nuovo flusso: branch → PR → CI verde → fast-forward di `main`.
- Iterazione 22 (`ops/containers`): Dockerfile API e web, `.dockerignore`, `deploy/docker-compose.staging.yml`, `deploy/.env.example`, job CI `containers`. Localmente: build `standalone` di Next avviata e verificata (`/` 200, `/auth/login` 503); il demone Docker non è disponibile qui, immagini verificate solo in CI.
- Iterazione 23 (`feat/web-case-creation`): creazione/consenso/caricamento/invio pratiche dal web; E2E browser 5/5 locale.
- Iterazione 24 (`ops/backup-restore`): script backup/ripristino, ciclo completo provato nel job CI `containers`.
- Iterazione 25 (`feat/crud-and-api-index`): CRUD bozze, `docs/API.md` generato e verificato da test; API 113 test locali + 59 saltati.
- Iterazione 26 (`mobile/eas-builds`): eas.json, bundle id iOS, permessi minimi verificati con prebuild, icona provvisoria, guida `docs/DEVICE_BUILDS.md`.
- Iterazione 27 (`test/keycloak-e2e`): E2E con Keycloak reale in CI (Run #130 verde); corretto il realm (scope predefiniti) grazie al test.
- Iterazione 28 (`feat/clamav`): antivirus ClamAV fail-closed, rescan nel worker, job CI `clamav` con EICAR.
- Iterazione 29 (`feat/shared-rate-limit`): rate limit condiviso su PostgreSQL; SQL verificato anche via psql locale.
