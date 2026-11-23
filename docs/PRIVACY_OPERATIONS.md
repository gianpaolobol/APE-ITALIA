# Operazioni privacy: diritti degli interessati e conservazione

Strumenti per l'operatore (CLI, shell fidata). Non sostituiscono valutazioni legali: informativa, basi giuridiche, tempi di conservazione e DPIA vanno definiti con il consulente privacy (MASTER_PLAN §12).

## Accesso e portabilità (art. 15 e 20 GDPR)
```
npm run admin -w @ape/api -- export-subject-data --subject "<sub OIDC>"
```
JSON con membership, consensi (versione e data), metadati dei file caricati, profilo certificatore, inviti accettati, traccia di audit in cui il soggetto è attore (max 10.000 eventi). I file non sono inclusi: si forniscono su richiesta dopo verifica d'identità. I dati delle pratiche delle organizzazioni restano nella titolarità dell'organizzazione.

## Conservazione delle evidenze
```
npm run admin -w @ape/api -- purge-expired-evidence            # simulazione (predefinita)
npm run admin -w @ape/api -- purge-expired-evidence --apply yes # cancellazione effettiva
```
- Pratiche `CANCELLED` da più di `RETENTION_CANCELLED_EVIDENCE_DAYS` giorni (predefinito 90) e `DELIVERED` da più di `RETENTION_DELIVERED_EVIDENCE_DAYS` (predefinito 730): eliminati file cifrati, metadati ed eventuali proposte AI collegate; evento `evidence.purge` in audit.
- **Conservati**: l'APE consegnato, il verbale, i consensi e l'audit (obblighi di prova e responsabilità del certificatore: durate da validare).
- Valori minimi accettati: 30 giorni. I predefiniti sono **segnaposto** in attesa di decisione legale.
- Da pianificare come attività periodica insieme a `expire-offers` (manca uno scheduler).

## Non ancora coperto
Cancellazione completa di un soggetto (art. 17) con gestione dei vincoli di conservazione, rettifica dei dati dell'immobile dopo la bozza, registro dei trattamenti, procedura di data breach, backup/restore testati.

## Worker per le attività periodiche (iterazione 18)
`npm run worker -w @ape/api` (cioè `node dist/worker.js`): ogni `WORKER_EXPIRE_EVERY_MIN` minuti (15) marca scadute le offerte e ripropone le pratiche; ogni `WORKER_RETENTION_EVERY_MIN` minuti (1440) esegue la conservazione **in simulazione** a meno di `RETENTION_APPLY=1`. Più istanze possono convivere: ogni lavoro prende un lock consultivo PostgreSQL di transazione (`pg_try_advisory_xact_lock`), le altre saltano il giro. I log riportano solo conteggi e nome dell'errore, mai dati.
