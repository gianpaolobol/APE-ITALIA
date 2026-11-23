# APE Italia — Piano esecutivo

## Sprint 0: fondazioni
- [x] Repository pubblico creato dall'utente
- [x] Documento guida MASTER_PLAN.md pubblicato
- [x] NOTICE proprietaria
- [ ] Scaffolding mobile/web/API completo
- [x] CI con typecheck e test
- [ ] Installazione e build verificata

## Sprint 1: dati persistenti
- [x] PostgreSQL e migrazioni (CI Run #81, nessuna deriva); seed sintetico solo nei test
- [x] Autorizzazioni per tenant e verifica JWT (test firmati + PostgreSQL); provider OIDC reale ancora da configurare
- [ ] CRUD immobili e pratiche (create/list fatti; update/dettaglio/cancellazione no)
- [x] Upload privato cifrato e metadati delle evidenze (API; scanner, storage cloud e UI mobile da fare)
- [x] Audit trail delle creazioni e delle modifiche di membership
- [ ] Test di integrazione e controlli sicurezza

## Sprint 2: interfacce
- [x] Richiesta privati in 5 step (bozza, evidenze, invio; non testata su dispositivo)
- [x] Portafoglio professionisti (web: pratiche, stati, membri, inviti; creazione pratiche via web da fare)
- [x] Dashboard certificatori web (offerte/incarichi/evidenze; sopralluogo e verbale da fare)
- [x] Sincronizzazione stati (app: scheda pratiche; web: area organizzazioni; aggiornamento manuale, nessuna notifica push)

## Sprint 3: AI documentale
- [ ] OCR targhette e documenti
- [x] Provenienza, confidenza e revisione (fornitore AI non attivo; test con test double)
- [ ] Test su dataset autorizzato

## Sprint 4: workflow APE
- [x] Matching certificatori (filtri obbligatori + fallback; distanza/costo/qualità non disponibili)
- [x] Agenda e verbale sopralluogo (API + portale web; annullamento/riassegnazione da fare)
- [x] Export neutro (JSON/CSV) verso software energetico conforme; adattatore specifico da fare
- [x] Gestione deposito e consegna (caricamento APE depositato dal certificatore, consegna al cliente; nessuna integrazione regionale)

Regola: non segnare completato ciò che non è stato effettivamente testato. Aggiornare MASTER_PLAN.md a ogni decisione significativa.
