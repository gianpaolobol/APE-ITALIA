# APE Italia — Documento guida unico (MASTER PLAN)
Versione 1.0 · 23 novembre 2026 · Stato: baseline progettuale, non certificazione operativa.

> Questo documento è la fonte di riferimento per tutte le decisioni di prodotto, architettura, sviluppo e collaudo. Ogni variazione sostanziale deve aggiornare questo file nella stessa pull request. Non descrivere funzioni come operative finché non sono state testate.

## 1. Visione e perimetro
APE Italia è una piattaforma Android, iOS e web per richieste di Attestato di Prestazione Energetica (APE) e analisi preliminari assistite da AI. Due esperienze commerciali: privati e professionisti/agenzie. Terza esperienza operativa: certificatori abilitati. Modello ibrido: studio/rete di certificatori con assegnazione automatica.
Obiettivo UX: completare una richiesta iniziale in 5–10 minuti; obiettivo non garantito da validare con utenti.
Prima area di lancio: Emilia-Romagna (Bologna); estensione nazionale tramite adattatori regionali.

## 2. Regole non negoziabili
- Le fotografie NON sono sufficienti da sole per emettere un APE ufficiale. La stima preliminare va sempre distinta dall'APE depositato.
- Il certificatore abilitato verifica le evidenze, effettua il sopralluogo richiesto dalla disciplina applicabile, controlla il calcolo, firma e deposita l'APE secondo le regole regionali.
- Non inventare dati su trasmittanze, stratigrafie, impianti o geometrie; usare stato verificato / da verificare / non determinabile.
- Nessun rilascio senza checklist legale e professionale completata. Nessuna promessa di deposito automatico senza integrazione autorizzata.
- Proteggere documenti, immagini, dati catastali e personali; non inserire segreti nel repository pubblico.

## 3. Fonti e verifica normativa
Da verificare con consulente competente e fonti ufficiali prima del rilascio: D.Lgs. 192/2005, D.P.R. 75/2013, decreti 26/06/2015 e modifiche successive, normativa e requisiti Emilia-Romagna (SACE, CRITER), norme UNI/TS 11300 applicabili, GDPR. Mantenere matrice normativa versionata con fonte, data, regione, requisito, implementazione, test, responsabile.
Non assumere che SACE o altri portali offrano API pubbliche.

## 4. Flusso privato
Registrazione → dati immobile e unità → planimetria e dati catastali → foto caldaia/targhetta, distribuzione/emissione, serramenti, pareti/sezioni ove disponibili → verifica qualità foto/OCR → questionario dati mancanti → preventivo trasparente → pagamento → assegnazione certificatore → sopralluogo → controllo calcolo → firma/deposito → consegna attestato e ricevute.

## 5. Flusso professionista
Organizzazione con utenti e ruoli, portafoglio immobili, pratiche multiple, inviti ai clienti, stato lavori, preventivi e fatture, documenti, storico e esportazione. Separazione rigorosa dei dati tra organizzazioni.

## 6. Flusso certificatore
Onboarding con verifica requisiti e ambito territoriale → disponibilità → accettazione incarico → controllo evidenze e richieste integrazione → sopralluogo fisico e verbale → compilazione software di calcolo conforme → controllo qualità → firma/deposito → caricamento APE e identificativi regionali → consegna.
Matching: filtri obbligatori (abilitazione, regione, conflitti d'interesse, capacità); ranking su disponibilità, distanza, costo e qualità. Fallback a successivo idoneo.

## 7. MVP P0
- Login, ruoli e organizzazioni
- Immobili e pratiche con stati persistenti
- Caricamento sicuro di foto/documenti e metadati
- OCR e estrazione AI con fonte, confidenza e revisione umana
- Checklist documentale, notifiche e richieste integrazione
- Preventivo, accettazione, pagamento (solo dopo contratti e compliance)
- Certificatori, matching, agenda sopralluoghi, verbale
- Interfaccia per esportare dati verso software energetico conforme
- Audit log, consenso/informativa, consegna APE e ricevuta
P1: stima energetica gratuita e suggerimenti migliorativi, CRM, integrazioni. P2: espansione nazionale e possibile motore energetico proprietario.

## 8. Stack tecnico
Monorepo npm workspaces; mobile Expo/React Native/TypeScript; web Next.js; API NestJS/TypeScript; PostgreSQL; object storage privato cifrato; queue/worker; OCR + modelli multimodali; monitoraggio; test unitari, integrazione ed end-to-end. Moduli: auth, organizations, properties, cases, evidence, ai-extraction, certifiers, matching, inspections, calculations, certificates, payments, audit.
Preferire monolite modulare. Isolare con interfacce i fornitori AI, pagamento e calcolo.

## 9. Modello dati minimo
users, organizations, memberships, properties, property_units, cases, evidence, extracted_fields, building_envelopes, heating_systems, certifiers, assignments, inspections, energy_models, calculation_runs, certificates, payments, audit_events.
Ogni campo estratto: valore, unità, fonte/evidence_id, confidenza, stato verifica, versione modello, autore e timestamp. Conservare storico delle correzioni.

## 10. AI e qualità del dato
Pipeline: acquisizione guidata → controlli qualità/duplicati → OCR/vision → normalizzazione → confronto con fonti tecniche → identificazione lacune → validazione certificatore. Misurare precision/recall e tasso di correzione per tipo di campo. Non usare punteggi di confidenza come sostituti delle prove. Foto di sezioni murarie non provano da sole spessori e conducibilità.

## 11. Calcolo
MVP: esportazione strutturata o integrazione autorizzata con software professionale conforme, previa verifica di licenze e compatibilità. Non calcolare né dichiarare una classe energetica ufficiale con un modello linguistico. Motore proprietario solo in fase successiva, con validazione tecnica/normativa indipendente.

## 12. Privacy, sicurezza e proprietà intellettuale
GDPR e privacy by design; ruoli/RBAC e isolamento tenant; MFA professionisti; cifratura in transito e a riposo; log, backup e restore testati; retention; gestione diritti; DPIA se necessaria; contratti con responsabili; segreti solo in secret manager. Repo pubblico ma codice proprietario: in assenza di licenza esplicita non è concessa autorizzazione generale a riuso/modifica/distribuzione. Non pubblicare dati clienti, credenziali o foto reali.

## 13. Business model (ipotesi da validare)
Privati: prezzo indicativo da testare €129 per pratica standard, variabile per complessità/territorio; professionisti: abbonamento indicativo €39/mese, eventuali volumi. Costi operativi includono certificatore, sopralluogo, acquisizione cliente, AI, pagamenti, assistenza, software e depositi. Simulazioni NON sono previsioni. Nessuna pubblicità nazionale prima del pilota economico.

## 14. Roadmap indicativa (24 settimane, non impegno di consegna)
F0 settimane 1–3: requisiti, normativa, UX, fornitori, backlog.
F1 settimane 4–7: monorepo, auth, dati, upload, dashboard.
F2 settimane 8–11: AI documentale e revisione.
F3 settimane 12–16: matching, pagamenti, sopralluoghi, calcolo esterno.
F4 settimane 17–20: QA, sicurezza, pilota.
F5 settimane 21–24: lancio regionale subordinato ai gate.

## 15. Sprint iniziale
S0: repository pubblico, README, MASTER_PLAN, LICENSE/NOTICE proprietaria, gitignore, scaffolding mobile/web/API/shared, istruzioni avvio, CI minima.
S1: PostgreSQL/migrazioni, CRUD immobili/pratiche, validazione, autorizzazioni, test API, upload privato. Niente dati reali in demo.
S2: flusso mobile completo con persistenza e portale.
S3: AI OCR e revisione umana.
S4: matching e workflow certificatore.
Ogni sprint: issue, branch, PR, review, test, aggiornamento master plan e changelog.

## 16. Gate di rilascio
Nessun bug critico; controllo accessi e isolamento tenant; tracciabilità; test Android/iOS; confronto casi energetici con certificatori; sopralluogo obbligatorio e approvazione professionale; procedure firma/deposito conformi; backup/restore e incident response. Vietato descrivere un mock come sistema operativo.

## 17. Team e controllo
Gruppi: prodotto/UX, sviluppo, AI/energia, revisione normativa/sicurezza, QA. Dieci iterazioni di revisione e controlli incrociati come obiettivo di processo, con risultati documentati e non simulati come eseguiti.

## 18. Stato e decisioni aperte
Confermato: nome APE Italia; repository GitHub pubblico; Android/iOS; privati + professionisti; rete ibrida; Emilia-Romagna iniziale; software energetico esterno MVP.
Da decidere/verificare: fornitore di calcolo, accordi certificatori, condizioni economiche, accesso a portali regionali, requisiti normativi aggiornati, provider cloud, DPA e branding.
Stato iniziale: starter software, non prodotto funzionante; nessuna certificazione ufficiale emessa.

## 19. Disciplina degli aggiornamenti
Il file `docs/MASTER_PLAN.md` è la fonte primaria. Ogni PR deve riportare: obiettivo, file modificati, test realmente eseguiti, rischio, impatto su normativa/privacy, decisioni nuove, stato P0/P1/P2 e aggiornamento di questo documento quando necessario.

## 20. Avanzamento 23/11/2026 — Sprint 1
Branch di lavoro `feat/sprint-1-persistence`: schema Prisma, Docker PostgreSQL locale, servizio database, endpoint API volutamente bloccati (403) in attesa di autenticazione. Nessun CRUD funzionante o migrazione verificata. Dettagli: `docs/SPRINT_1_IMPLEMENTATION.md`. Il rilascio richiede test reali e controllo isolamento tenant.

## 21. Avanzamento Sprint 2 — 23/11/2026
La PR #4 dello Sprint 1 è stata integrata in main (commit `aa0d6b2`) dopo CI verde Run #56. Resta aperta la issue #5 per autenticazione reale e hardening prima della produzione. Il branch `feat/sprint-2-mobile-api` introduce un client API TypeScript per immobili/pratiche, controlli HTTPS e gestione errori, oltre a validazione iniziale del workflow. **Non è ancora collegato alla UI Expo** e non esiste login OIDC operativo. Stato dettagliato: `docs/SPRINT_2_IMPLEMENTATION.md`.

## 22. Sprint 2 — wizard mobile e limite di autenticazione
Il wizard Expo ora utilizza la funzione `submitApeRequest` che valida i dati e prepara chiamate API immobili/pratiche. La funzione `getVerifiedSession()` restituisce null fino all'integrazione OIDC PKCE: **nessun invio reale è possibile**. Sono stati aggiunti test e controllo TypeScript mobile in CI. Restano da verificare build e test su iOS/Android, sessione sicura, upload, dati persistenti via app.

## 23. Contratto autenticazione OIDC/PKCE
Aggiunto `docs/OIDC_INTEGRATION.md`: autorizzazione mobile via browser di sistema, PKCE S256, token verificati, archiviazione sicura, provisioning membership e test negativi obbligatori. Nessun provider è stato ancora scelto o attivato. I dati reali restano vietati fino al completamento dei controlli.

## 24. Sprint 2 integrato; Sprint 3 avviato
La Run #72 è terminata con successo (PostgreSQL/Prisma, test API, typecheck/test mobile, build web); PR #6 integrata in `main` con commit `b6254bb`. Lo Sprint 3 si concentra sull'autenticazione OIDC/PKCE: creato il validatore della configurazione pubblica con test, ma **nessun login effettivo ancora attivo**. Riferimento `docs/SPRINT_3_AUTH.md`. Non utilizzare dati reali fino al completamento dei gate di sicurezza.

## 25. Sprint 3 — Authorization Code + PKCE implementato nel codice (Claude, 23/11/2026)
Flusso mobile completo a livello di codice e test: discovery, PKCE S256 con CSPRNG e SHA-256, browser di sistema, callback con verifica state/iss, scambio codice, validazione ID token con nonce, sessione con solo refresh token in secure storage, refresh, scadenza, revoca e logout. API: verifica JWT con JWKS in cache e `GET /v1/me`; test con token RS256 firmati e JWKS fixture; test HTTP reale del modulo Nest; test integrazione PostgreSQL di firma + membership (eseguiti in CI). **Nessun provider OIDC reale configurato e nessun test su dispositivo**: il login resta inattivo nelle build finché non si completano i passi in `docs/SPRINT_3_AUTH.md` §Blocchi. Registro operativo: `docs/CLAUDE_PROGRESS.md`.

## 26. Sprint 4 (parziale) — provisioning sicuro organizzazioni/membership (Claude, 23/11/2026)
PR #8 (impilata su #7). Nessuna creazione pubblica di organizzazioni: bootstrap con CLI operatore (`npm run admin:create-org`) auditata; inviti monouso a 256 bit con solo hash SHA-256 a riposo e scadenza ≤ 7 giorni; gestione membri con gerarchia owner > admin > member > viewer e protezione dell'ultimo owner (lock di riga). Specifica: `docs/PROVISIONING.md`. CI Run #81 verde con 16 test PostgreSQL e controllo di deriva schema/migrazioni. Mancano rate limiting, MFA (dipende dal provider) e UI di gestione.

## 27. Sprint 4 (parziale) — caricamento evidenze protetto e consenso (Claude, 23/11/2026)
PR #9 (impilata su #8). Upload multipart con verifica del tipo dal contenuto, limite 15 MB, rimozione EXIF/GPS dai JPEG, deduplica SHA-256, cifratura AES-256-GCM a riposo con chiave legata all'oggetto, consenso versionato obbligatorio per pratica, download auditato e bloccato finché il file non è scansionato. Specifica e limiti: `docs/EVIDENCE_UPLOAD.md`. **Informativa privacy in bozza, nessuno scanner antivirus e nessuno storage cloud configurati.**

## 28. Sprint 2/4 — wizard mobile collegato a bozza, evidenze e invio (Claude, 23/11/2026)
PR #10 (impilata su #9). Il wizard crea la pratica in bozza dopo il login, raccoglie consenso e fotografie/documenti per voce e invia la pratica (`DRAFT → SUBMITTED`, nuovo endpoint auditato). Le transizioni successive restano riservate al workflow certificatori (da implementare). Nessun test su dispositivo reale.

## 29. Sprint 4 — matching e workflow certificatori (Claude, 23/11/2026)
PR #11 (impilata su #10). Profili certificatore verificati solo da operatore (CLI, verifica umana sull'elenco regionale), matching con filtri obbligatori (attivo, verificato, regione, indipendenza dall'organizzazione richiedente, nessuna riproposta, capacità) e ranking per carico/anzianità, offerta automatica all'invio con scadenza 48 h, accettazione/rifiuto con fallback, minimizzazione dei dati prima dell'accettazione, accesso alle evidenze solo con incarico accettato. Dettagli: `docs/CERTIFIER_WORKFLOW.md`. Sopralluogo, verbale, firma e deposito non ancora implementati.

## 30. Portale web certificatori (Claude, 23/11/2026)
PR #12 (impilata su #11). Next.js con login OIDC + PKCE lato server (BFF), sessione in cookie cifrato HttpOnly, verifica firma ID token con JWKS, proxy per API e download, Server Actions per accettare/rifiutare incarichi, header di sicurezza, portale chiuso senza configurazione. Dettagli e limiti: `docs/WEB_PORTAL.md`.

## 31. Hardening sicurezza (Claude, 23/11/2026)
PR #13 (impilata su #12). Rate limiting, header helmet e CORS disattivato sull'API, `package-lock.json` versionato e `npm ci` in CI, scansione segreti dei file tracciati, audit dipendenze bloccante sulle critiche. Tabella stato controlli e rischio residuo in `docs/SECURITY.md`. Aggiornamenti major (Expo 58, Next 16, Prisma 7) rinviati a PR dedicate.

## 32. Sopralluogo e verbale strutturato (Claude, 23/11/2026)
PR #14 (impilata su #13). Programmazione/riprogrammazione del sopralluogo da parte del certificatore con incarico accettato, verbale immutabile con vocabolario controllato e stato di verifica per voce (verificato / da verificare / non determinabile), nessun campo di classe energetica, collegamento facoltativo a evidenze della stessa pratica, stati pratica `INSPECTION_SCHEDULED` → `INSPECTION_DONE`, vista cliente limitata, moduli nel portale web. Dettagli in `docs/CERTIFIER_WORKFLOW.md`.

## 33. AI documentale con revisione professionale (Claude, 23/11/2026)
PR #15 (impilata su #14). Porta `ExtractionProvider` isolata e **disattivata** (nessun fornitore autorizzato), proposte con provenienza/modello/confidenza in stato `needs_review`, revisione obbligatoria del certificatore (accetta/correggi/respingi) con storico append-only, scarto degli output fuori vocabolario (nessuna classe energetica), blocco dell'invio di file non scansionati, metriche di correzione per campo e modello, pannello di revisione nel portale. Dettagli: `docs/AI_EXTRACTION.md`.

## 34. Esportazione per il calcolo (Claude, 23/11/2026)
PR #16 (impilata su #15). Documento JSON versionato `ape-italia/case-export` v1.0 e CSV dei rilievi, disponibili al certificatore solo dopo il verbale; provenienza (hash evidenze), stato di verifica per voce, completezza sul vocabolario, nessuna classe energetica. Adattatore al software scelto da realizzare quando il fornitore sarà deciso. Dettagli: `docs/CALCULATION_EXPORT.md`.

## 35. Portale web organizzazioni (Claude, 23/11/2026)
PR #17 (impilata su #16). Area `/org` per privati, professionisti e agenzie: portafoglio pratiche con stato, dettaglio pratica con sopralluogo ed evidenze, gestione membri e inviti per owner/admin (codice monouso mostrato una volta). Le pratiche si creano ancora solo da app mobile. Dettagli in `docs/WEB_PORTAL.md`.

## 36. Test end-to-end API in CI (Claude, 23/11/2026)
PR #18 (impilata su #17). `services/api/e2e/full-flow.e2e.spec.ts` avvia `dist/main.js` con configurazione reale contro PostgreSQL e un JWKS remoto HTTPS (CA autofirmata) e percorre l'intero flusso su HTTP. Superato in CI Run #95. Restano da fare E2E del portale web (browser) e test su dispositivi.

## 37. Caricamento e consegna dell'APE depositato (Claude, 23/11/2026)
PR #19 (impilata su #18). Il certificatore carica il PDF dell'APE firmato e depositato con l'identificativo regionale e la data di deposito (dichiarazione obbligatoria); la pratica passa a `DEPOSITED`; il primo download del cliente la porta a `DELIVERED`. Nessuna generazione o deposito automatico. Coperto dal test E2E. Dettagli in `docs/CERTIFIER_WORKFLOW.md`.

## 38. Stato pratiche nell'app mobile (Claude, 23/11/2026)
PR #20 (impilata su #19). Nuova scheda "Le mie pratiche" con stato e avanzamento, sopralluogo ed estremi dell'APE; endpoint aggregato `GET /v1/case-summaries` (verificato nell'E2E). Download dell'APE sul dispositivo non ancora implementato.

## 39. Ciclo di vita: integrazioni, annullamento, rinuncia (Claude, 23/11/2026)
PR #21 (impilata su #20). Richieste di integrazione del certificatore con sospensione della pratica e ripresa alla conferma del cliente; annullamento del cliente prima del verbale; rinuncia del certificatore con riassegnazione automatica. Interfacce web e mobile. Dettagli in `docs/CERTIFIER_WORKFLOW.md`.

## 40. Diritti degli interessati e conservazione (Claude, 23/11/2026)
PR #22 (impilata su #21). CLI operatore per esportare i dati collegati a un soggetto (art. 15/20) e per la purga delle evidenze scadute (simulazione predefinita; APE, verbale, consensi e audit conservati). Tempi di conservazione predefiniti da validare legalmente. Dettagli: `docs/PRIVACY_OPERATIONS.md`.

## 41. Test in browser del portale e correzione logout (Claude, 23/11/2026)
PR #23 (impilata su #22). E2E in Chrome reale del login BFF con provider OIDC fittizio che verifica PKCE; ha rivelato che i cookie `__Host-` non venivano cancellati (stato di login riutilizzabile, logout inefficace): corretto e coperto dal test, eseguito anche in CI.

## 42. Worker per attività periodiche (Claude, 23/11/2026)
PR #24 (impilata su #23). Processo `dist/worker.js` con pianificazione senza sovrapposizioni per scadenza offerte e conservazione (simulazione salvo `RETENTION_APPLY=1`), lock consultivi PostgreSQL per istanze multiple, log senza dati personali. Sostituisce l'esecuzione manuale dei comandi CLI; una coda dedicata resta un'evoluzione possibile.

## 43. Download dell'APE nell'app (Claude, 23/11/2026)
PR #26 (impilata su #25). Il cliente scarica l'APE consegnato nella cache privata dell'app e lo apre con il foglio di sistema. Non verificato su dispositivo.

## 44. Chiusura sessione notturna Claude (23/11/2026, ~05:00)
21 iterazioni nelle PR #7–#27, tutte con CI verde, **non integrate** in `main` (merge non consentito alla sessione). Stato, blocchi umani e ordine di integrazione: `docs/CLAUDE_PROGRESS.md`. Restano esclusi: pagamenti, notifiche, integrazioni regionali, fornitore AI, test su dispositivi e provider OIDC reale.

## 45. Integrazione in main e container per lo staging (Claude, 23/11/2026)
Su autorizzazione del titolare, `main` è stato portato con fast-forward a `a3550e0` (PR #7 risultata integrata, #8–#27 chiuse con riferimento). Aggiunte immagini Docker per API/worker/migrazione e portale (Next standalone), compose di staging e job CI di smoke test. Dettagli: `docs/DEPLOYMENT.md`.

## 46. Creazione pratiche dal web (Claude, 23/11/2026)
Professionisti e agenzie creano, documentano e inviano le pratiche anche dal portale web (`/org/new` e pagina pratica), con gli stessi controlli di consenso e file dell'app. Verificato con E2E in Chrome.

## 47. Backup e ripristino provati (Claude, 23/11/2026)
Script `deploy/backup.sh` e `deploy/restore.sh` (dump PostgreSQL + volume evidenze cifrate, hash di integrità, ripristino solo con conferma esplicita), verificati in CI con distruzione e ricostruzione dello stack. Contribuisce al gate §16 "backup/restore"; restano da definire frequenza, conservazione e cifratura dei backup fuori sede.

## 48. CRUD bozze e indice API generato (Claude, 23/11/2026)
Dettaglio di immobili e pratiche, modifica dei dati dichiarati finché nessuna pratica dell'immobile è stata inviata, eliminazione solo di bozze vuote e di immobili senza pratiche (altrimenti annullamento, per conservare la traccia). `docs/API.md` generato dai metadati dei controller (47 rotte, classe di accesso, limiti); un test fallisce se non è aggiornato e garantisce che solo `/health` e `/v1/notices` siano pubbliche.

## 49. Preparazione build su dispositivi (Claude, 23/11/2026)
`eas.json` con profili preview/production, bundle identifier iOS allineato al package Android (`it.apeitalia.app`), permessi Android minimi, icona provvisoria, verifica con `expo prebuild`. Guida e checklist manuale in `docs/DEVICE_BUILDS.md`. Le build richiedono account Expo/Apple del titolare.

## 50. Verifica con provider OIDC reale (Claude, 23/11/2026)
Realm Keycloak di riferimento versionato (`deploy/keycloak/`) e job CI che esegue login reale in Chrome, BFF, API compilata con JWKS del provider e PostgreSQL. Decisione sul provider di produzione e MFA restano al titolare. Dettagli: `docs/OIDC_KEYCLOAK.md`.
