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
- [ ] Upload privato e metadati delle evidenze
- [x] Audit trail delle creazioni e delle modifiche di membership
- [ ] Test di integrazione e controlli sicurezza

## Sprint 2: interfacce
- [ ] Richiesta privati in 5 step
- [ ] Portafoglio professionisti
- [ ] Dashboard certificatori
- [ ] Sincronizzazione stati

## Sprint 3: AI documentale
- [ ] OCR targhette e documenti
- [ ] Provenienza, confidenza e revisione
- [ ] Test su dataset autorizzato

## Sprint 4: workflow APE
- [ ] Matching certificatori
- [ ] Agenda e verbale sopralluogo
- [ ] Export verso software energetico conforme
- [ ] Gestione deposito e consegna

Regola: non segnare completato ciò che non è stato effettivamente testato. Aggiornare MASTER_PLAN.md a ogni decisione significativa.
