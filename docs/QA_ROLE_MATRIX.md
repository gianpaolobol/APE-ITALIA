# V1.0 — matrice di accettazione HTTP

25 novembre 2026. Baseline main `2050d0417ca94af5effbca84a222dfbbab25a1f0`, CI push [#258](https://github.com/gianpaolobol/APE-ITALIA/actions/runs/45645954711), quattro job verdi. Backup stabile `53b9c11cef75a4c4486318e963e6a8b3352a8b31` invariato. Macroblocco indipendente dalla [PR #80](https://github.com/gianpaolobol/APE-ITALIA/pull/80) sulla cifratura degli snapshot.

## Copertura proposta

`services/api/e2e/full-flow.e2e.spec.ts`: 10 clienti, 10 certificatori, 10 organizzazioni isolate, 10 amministratori di organizzazione e 10 viewer sintetici. API compilata, database PostgreSQL e token di test RS256/JWKS. Creazione pratiche, consenso prima di survey/invio, allegati, offerta e assegnazione, evidenze, verbale, esportazione, PDF sintetico depositato, download e ricevuta ripetuta senza duplicare l'audit; verifica di 10 pratiche DELIVERED. Controlli negativi incrociati di tenant, ruoli e certificatori.

## Gate

Implementazione del test completata; esito da verificare sullo SHA della PR con CI reale. Nessuna affermazione di successo prima dei log. Non equivale a collaudo web/mobile su dispositivi fisici, amministratore di piattaforma, login reale di produzione, firma/deposito ufficiale, software energetico conforme o distribuzione agli store. Il ClamAV live e Keycloak browser rimangono job separati della CI. Nessun dato personale, costo o pubblicazione in produzione.
