# Handoff operativo per Claude — APE Italia
Data: 23 novembre 2026. Repository canonico: `gianpaolobol/APE-ITALIA` (non creare un'altra repository denominata "App Italia").

## Istruzione iniziale vincolante
**Non usare questo file come sostituto del progetto.** Prima di modificare il codice, apri e leggi integralmente, nell'ordine:
1. [README.md](../README.md)
2. [docs/MASTER_PLAN.md](MASTER_PLAN.md) — fonte normativa/progettuale interna e baseline obbligatoria
3. [docs/SPRINTS.md](SPRINTS.md)
4. [docs/SECURITY.md](SECURITY.md)
5. [docs/OIDC_INTEGRATION.md](OIDC_INTEGRATION.md)
6. [docs/SPRINT_2_IMPLEMENTATION.md](SPRINT_2_IMPLEMENTATION.md)
7. [docs/SPRINT_3_AUTH.md](https://github.com/gianpaolobol/APE-ITALIA/blob/feat/sprint-3-auth-foundation/docs/SPRINT_3_AUTH.md)
8. [PR #7](https://github.com/gianpaolobol/APE-ITALIA/pull/7), [Issue #5](https://github.com/gianpaolobol/APE-ITALIA/issues/5), issues aperte, workflow CI e codice corrente.

Esamina anche la struttura del monorepo e i test, non affidarti soltanto alla documentazione. La documentazione può essere superata dal codice; annota e correggi le discrepanze.

## Mandato di esecuzione
Prosegui **per iterazioni autonome durante la sessione di lavoro notturna, se l'ambiente Claude resta effettivamente in esecuzione e dispone di autorizzazioni GitHub**. Non dichiarare lavoro notturno automatico se la sessione non è persistente. Scopo: avanzare verso il completamento dell'app APE Italia (Android, iOS, web, API) secondo il MASTER PLAN, non fermarsi alla sola pianificazione.

Per ogni iterazione:
1. Sincronizza `main`, verifica PR aperte e stato CI; non sovrascrivere lavoro concorrente.
2. Scegli il più piccolo incremento funzionale prioritario e verificabile; apri branch dedicato.
3. Implementa codice e test, con dati fittizi e senza segreti nel repo pubblico.
4. Esegui test, typecheck, build e verifiche di sicurezza pertinenti; correggi regressioni.
5. Aggiorna `docs/MASTER_PLAN.md` e il registro dello sprint **nella stessa PR**.
6. Esegui commit/push sulla repo canonica e apri/aggiorna PR con risultati e limiti reali.
7. Integra in `main` solo quando CI verde, review e condizioni di sicurezza sono soddisfatte; altrimenti lascia PR in bozza con blocchi espliciti.
8. Ripeti senza richiedere un nuovo "procedi" per ogni piccolo passo, finché la sessione e le autorizzazioni lo consentono.

## Priorità immediata
La PR #7 `feat/sprint-3-auth-foundation` contiene validazione OIDC e helper PKCE preparatori. Completare il flusso Authorization Code + PKCE S256 con RNG crittograficamente sicuro, challenge SHA-256, browser di sistema, callback con verifica state/nonce, token exchange, sessione in secure storage, scadenza/logout e test. **Non simulare un login come se fosse reale**. Se il provider o la configurazione richiedono intervento umano, implementare e testare tutto ciò che è possibile in isolamento, documentando precisamente il blocco.

Poi proseguire con provisioning sicuro di organizzazioni/membership, API end-to-end, caricamento documenti con storage protetto e consenso, workflow certificatori, UI web, assegnazione, moduli AI con supervisione professionale, pagamenti e collaudi secondo MASTER PLAN.

## Vincoli inderogabili
- L'APE ufficiale richiede verifiche, sopralluogo quando prescritto, firma e deposito del certificatore abilitato; non inventare attestati o conformità.
- Repository **pubblico ma codice proprietario**, vedere NOTICE. Non aggiungere licenza open source senza autorizzazione.
- Mai pubblicare chiavi, password, token, documenti di immobili o dati personali reali.
- Non effettuare deploy di produzione, invii esterni, spese o configurazioni account irreversibili senza autorizzazione specifica.
- Non dichiarare test su dispositivi o rilascio store senza prove verificabili.
- Se una verifica non è possibile, segnala il limite invece di attestare successo.

## Report di fine sessione
Salva `docs/CLAUDE_PROGRESS.md` con data, commit, PR, test effettivamente eseguiti, stato delle funzionalità, blocchi, prossime azioni. Aggiornalo durante la sessione; l'obiettivo è permettere la ripresa senza perdita di contesto. Invia all'utente un breve resoconto con link ai commit e alle PR.
