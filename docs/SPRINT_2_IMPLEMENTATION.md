# Sprint 2 — Interfacce e API
Branch: `feat/sprint-2-mobile-api`.

## Implementato
- Client API mobile TypeScript con chiamate GET/POST immobili e pratiche.
- Token e organizzazione passati da sessione autenticata, mai da costanti di demo.
- Solo URL HTTPS; errori 401/403 distinti.
- Definizione condivisa dei cinque passaggi di acquisizione e validazione minima dati immobile.

## Non ancora implementato
- Provider OIDC effettivo e login mobile.
- Persistenza sicura della sessione su dispositivo.
- Integrazione del client nelle schermate Expo; al momento la demo mobile non salva i dati.
- Caricamento foto, OCR, workflow certificatori e pagamenti.
- Test dispositivo iOS/Android e test API end-to-end.

## Gate
Non inserire token nel codice o nel repository pubblico. Non utilizzare dati personali reali fino alla validazione privacy e sicurezza. La nuova API client non va considerata collegata all'interfaccia finché non viene effettivamente usata dalle schermate.

## Iterazione mobile — 23/11/2026
Schermata Expo collegata alla funzione di invio richieste e al client API, con validazione dei campi immobile, gestione degli errori e blocco invio ripetuto. **La sessione verificata restituisce volutamente null** fino all'integrazione OIDC/PKCE: pertanto la demo non effettua chiamate remote né crea pratiche reali. Aggiunti due test per validazione e mancata sessione, oltre a typecheck/test mobile in CI. Queste modifiche richiedono ancora verifica della pipeline e test sui dispositivi.

## CI Run #64 — correzione TypeScript
Run 45091423666 fallita al comando `npm run typecheck -w @ape/mobile` perché la cartella mobile non conteneva `tsconfig.json`; `tsc` stampava la guida ed usciva con codice non zero. Aggiunto `apps/mobile/tsconfig.json` basato su `expo/tsconfig.base`. Correzione ancora da confermare tramite nuova CI. La sessione OIDC rimane intenzionalmente non operativa.

## Iterazione trasporto API — 23/11/2026
Aggiunti quattro test unitari del client mobile per rifiuto HTTP non cifrato, intestazioni bearer/organizzazione, gestione 401 e invio del payload immobile. Si usano fetch mock e credenziali sintetiche, nessun servizio remoto. Il commit `d9b46fb` è in attesa di esito CI; la Run #66 del commit precedente era ancora in corso all'ultima lettura. Nessun login reale attivato.

## Iterazione flusso richieste — 23/11/2026
Aggiunti due test con fetch simulato: creazione immobile seguita dalla creazione della pratica con ID corretto; interruzione del flusso quando la creazione dell'immobile restituisce 403. Non costituiscono test con provider OIDC o database reale e non rendono attivo l'invio dall'app, poiché `getVerifiedSession` restituisce null. Il codice attende esito CI del commit e review.

## Iterazione Claude 23/11 — wizard collegato a bozza, evidenze e invio
- Passo 1: con utente autenticato e organizzazione confermata, "Crea bozza" crea immobile e pratica `DRAFT` (i campi diventano non modificabili).
- Passi 2–4: informativa in bozza con consenso esplicito per pratica, poi per ogni voce (caldaia/targhetta, terminali, pareti, serramenti, planimetria, documenti) "Scatta foto" o "Dalla galleria"/"Scegli file", con pre-controllo di formato e dimensione lato app; il server resta l'unica autorità.
- Passo 5: "Invia richiesta" porta la pratica da `DRAFT` a `SUBMITTED` (`POST /v1/cases/:id/submit`, auditato).
- Permessi fotocamera/galleria dichiarati in `app.json` (plugin `expo-image-picker`), EXIF non richiesto al picker.
- **Non verificato su dispositivo**: solo typecheck, 82 test unitari e bundle Hermes Android/iOS.

## Iterazione Claude 23/11 — "Le mie pratiche" nell'app
Scheda "Le mie pratiche" (dopo l'accesso): per ogni pratica indirizzo, stato in italiano, barra di avanzamento (bozza → consegna), data e certificatore del sopralluogo, estremi dell'APE depositato. Dati da un'unica chiamata `GET /v1/case-summaries` (nessun N+1). Il download dell'APE avviene dal portale web; il download sul dispositivo richiede `expo-file-system`/condivisione e test su dispositivo, non ancora fatti.

## Iterazione Claude 23/11 — download dell'APE nell'app
Nella scheda pratiche, "Scarica l'APE (PDF)": scaricamento con le stesse intestazioni della sessione verificata nella cache privata dell'app (`expo-file-system`, non la galleria condivisa) e apertura del foglio di condivisione/anteprima (`expo-sharing`). Il primo download segna la consegna. Logica testata (3 test); adattatori nativi verificati solo da typecheck e bundle. Nota tecnica: i file con suffisso `.native.ts` vengono preferiti da Metro rispetto a `.ts` omonimi, perciò l'adattatore si chiama `certificate-download-native.ts`.
