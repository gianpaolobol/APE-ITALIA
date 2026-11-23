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
