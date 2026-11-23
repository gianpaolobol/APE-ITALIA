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
