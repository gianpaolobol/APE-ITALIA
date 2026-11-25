# APE Italia — Handoff operativo Work V1.0 (25/11/2026)

## Ripresa e coordinamento

Leggere MASTER_PLAN.md, INDEPENDENT_QA.md, README.md, MOBILE_RELEASE.md, DEPLOYMENT.md, STORE_LISTING.md, i documenti di sicurezza e le PR aperte. Ultimo main verificato 124083aced64d25bb2ebcc0a29d1e200e06671af (#76); verificare nuovamente SHA e CI push. Backup immutabile backup/2026-11-25-stable = 53b9c11cef75a4c4486318e963e6a8b3352a8b31. Coordinare un solo writer tra Work e automazione prima di modificare il codice; nessuna sessione Work è stata confermata durante questa verifica. Riesaminare il branch audit/logout-persistence-handoff e i suoi test prima di integrarlo; nessun merge senza CI verde e base compatibile.

## Tre ambiti integrati

| Ambito | Gate di accettazione V1 |
|---|---|
| Mobile | Flusso cliente e professionista, sessioni isolate, acquisizione, consenso, bozze, cifratura autenticata e migrazione non distruttiva, invio, stato, consegna APE; prove offline/rete intermittente e aggiornamento su iOS/Android. |
| Web | Percorsi cliente, organizzazione, certificatore e amministrazione previsti dal piano; autorizzazioni, richieste integrazione, evidenze, sopralluogo, revisione AI, esportazione e consegna, test browser integrati. |
| API/AI/calcolo | PostgreSQL, OIDC, tenant, idempotenza, evidenze, ClamAV, backup/restore, matching, pagamenti solo test, estrazione AI con fonti e revisione, esportazione validata verso software energetico conforme. |

Il MASTER PLAN §7/11 distingue MVP (esportazione o integrazione autorizzata con software professionale conforme) da P2 (eventuale motore proprietario). Non promettere emissione automatica o certificazione CTI; un motore proprietario ufficiale richiede una decisione esplicita sul perimetro e validazione indipendente. Il certificatore resta responsabile di sopralluogo, calcolo, firma e deposito. Nessun dato cliente reale nella fase di test.

## Sequenza esecutiva

1. In parallelo: cifratura autenticata, collaudo incrociato dei ruoli, revisione dei flussi e audit a3550e0...a779385 e successivi. Per cifratura: npm accessibile, verificare API della versione esatta Expo 54/Hermes e libreria AEAD, aggiornare lock con npm, testare chiave/nonce, manomissione, perdita chiave, crash tra copie, downgrade, media e cache. Non usare primitive proprie o fallback in chiaro dopo migrazione. Test fisici necessari.
2. Consolidare i tre ambiti su main tramite PR verificate. Test sintetici almeno 10 clienti/10 certificatori e più organizzazioni, ruoli negativi, workflow completo e casi di riferimento energetici. Registrare quali prove sono state realmente eseguite; non inventare agenti o test.
3. Da main corrente con CI push verde sullo SHA esatto (verify, containers, keycloak-e2e, clamav), avviare workflow Mobile release in modalità build-only, piattaforma both. Verificare runner gratuiti e quota servizi esterni. Nessun costo deliberato. Registrare run e SHA, controllare log Android e iOS separatamente. Non modificare il gate per aggirare il mancato dispatch del connettore.
4. Verificare staging HTTPS separato, segreti e credenziali nei secret manager. Non stampare token o codici, non usare issue pubbliche per credenziali. Prove di rete e ruoli con dati sintetici. Quando cifratura, firma e autorizzazioni sono soddisfatte, distribuire lo stesso commit su TestFlight e Google Play internal (Firebase facoltativo). Eventuale primo AAB firmato solo in ambiente privato; nessun artifact firmato pubblico. Verificare processing, versione, gruppo tester e disponibilità effettiva sui portali. La sola CI verde non equivale a distribuzione.
5. Installare e collaudare entrambe le build dove disponibile, documentare test fisici residui, correggere difetti e ripetere. Release candidate dal main consolidato; nessuna produzione.
6. Dopo il consolidamento tecnico: materiali commerciali, screenshot dalle build reali, landing page, ASO, confronto concorrenti e prezzi verificati, modello economico originario (ipotesi, non prezzi definitivi), pilota Bologna/Emilia-Romagna, piano 30/60/90 giorni e KPI. Preparare solo bozze e materiali; niente campagne, contatti commerciali o spese senza specifica autorizzazione.

## Evidenze minime

Per ogni gate: stato (superato / fallito / non eseguito), SHA, PR, run, test, limite, responsabile dell'eventuale azione umana. V1.0 validata solo dopo soddisfacimento dei gate applicabili; distinguere beta tecnica da disponibilità commerciale e conformità professionale. Non aggirare permessi, non esporre segreti, non pubblicare in produzione. Conservare il backup storico.
