# Workflow certificatori — implementazione Sprint 4

## Anagrafica
I certificatori sono profili di piattaforma (non membri delle organizzazioni clienti). La registrazione come **verificato** avviene solo da CLI operatore, dopo il controllo umano sull'elenco regionale dei certificatori abilitati (per l'Emilia-Romagna, l'elenco gestito nel sistema regionale; da confermare con consulente):
```
npm run build -w @ape/api
npm run admin -w @ape/api -- register-certifier --subject "<sub OIDC>" --name "Nome Cognome" --registration-id "<n. iscrizione>" --regions "Emilia-Romagna" --operator "<id operatore>" [--max-active 5]
```
Il sistema registra chi ha verificato e quando; **non** interroga portali regionali (nessuna API pubblica assunta).

## Matching (MASTER_PLAN §6)
Filtri obbligatori, nell'ordine: attivo; verificato; regione della pratica tra quelle del certificatore; **indipendenza** (il certificatore non deve avere membership, attiva o revocata, nell'organizzazione richiedente); mai riproporre la stessa pratica allo stesso certificatore; capacità (incarichi accettati + offerte non scadute < massimo).
Ranking: carico relativo, poi carico assoluto, poi anzianità di verifica, poi id (deterministico). Distanza, costo e qualità non sono ancora disponibili.

## Ciclo di vita
1. `POST /v1/cases/:id/submit` (cliente) ⇒ `SUBMITTED` + offerta automatica al primo idoneo (48 h). Nessun idoneo ⇒ audit `assignment.no_candidate`, la pratica resta `SUBMITTED`.
2. `GET /v1/certifier/assignments`: per le offerte solo **comune e regione**; indirizzo e superficie solo dopo l'accettazione.
3. `POST /v1/certifier/assignments/:id/accept` ⇒ incarico `ACCEPTED`, pratica `ASSIGNED`, altre offerte `WITHDRAWN`.
4. `POST /v1/certifier/assignments/:id/decline {reason?}` ⇒ `DECLINED` e nuova offerta al successivo idoneo.
5. Offerte scadute: `npm run admin -w @ape/api -- expire-offers` le marca `EXPIRED` e ripropone la pratica. **Manca uno scheduler**: va eseguito periodicamente (cron/worker) finché non sarà introdotta la coda prevista dal MASTER PLAN.
6. Evidenze per il certificatore: `GET /v1/certifier/assignments/:id/evidence` e `.../evidence/:evidenceId/content`, solo con incarico accettato, stessi controlli di scansione, lettura auditata con attore `certifier:<sub>`.

Tutti gli eventi (`assignment.offer|decline|expire|accept|no_candidate`) sono registrati nell'audit dell'organizzazione richiedente.

## Non ancora implementato
- Agenda sopralluoghi, verbale, controllo calcolo, firma e deposito (le transizioni oltre `ASSIGNED` non hanno ancora endpoint).
- Dichiarazioni esplicite di conflitto d'interesse oltre all'appartenenza all'organizzazione (es. parentela, interesse sull'immobile): da raccogliere in onboarding.
- Due invii concorrenti possono superare di una unità la capacità di un certificatore (nessun lock sul conteggio): accettabile nel pilota, da rivedere.
- Portale web certificatori (prossima iterazione).

## Sopralluogo e verbale (iterazione 8)
- `POST /v1/certifier/assignments/:id/inspection {scheduledAt}`: solo con incarico accettato; tra 15 minuti e 90 giorni; prima programmazione ⇒ pratica `INSPECTION_SCHEDULED`; riprogrammazione consentita finché il verbale non è inviato (audit `inspection.schedule` / `inspection.reschedule`).
- `GET /v1/certifier/inspection-schema`: vocabolario controllato delle voci (generatore, potenza, anno, terminali, regolazione, ACS, raffrescamento, pareti, isolamenti, serramenti, superficie e volume, fotovoltaico). **Nessuna voce per classe energetica o indici di prestazione**: il calcolo resta nel software conforme.
- `POST /v1/certifier/assignments/:id/inspection/report`: verbale strutturato, **immutabile** dopo l'invio; ogni voce ha stato `verified` / `to_verify` / `undeterminable`, fonte (`inspection`/`document`/`photo`), eventuale evidenza della stessa pratica e nota. Regole: valori nei range con unità; `undeterminable` senza valore e con motivazione; un valore verificato proveniente da foto/documento richiede nota su come è stato confermato; dichiarazione di sopralluogo personale obbligatoria; data non futura. Pratica ⇒ `INSPECTION_DONE`; audit `inspection.report`.
- Cliente: `GET /v1/cases/:id/inspection` mostra stato, data e nome del certificatore, non il contenuto tecnico.
- Portale web: programmazione (ora di Roma) e modulo del verbale; visualizzazione in sola lettura dopo l'invio.

Resta da implementare: annullamento/riassegnazione dopo l'accettazione, controllo qualità, collegamento al software di calcolo, firma e deposito.

## Deposito e consegna dell'APE (iterazione 13)
- `POST /v1/certifier/assignments/:id/certificate` (multipart): PDF (verificato dal contenuto, ≤ 15 MB, scansione antivirus tramite porta), `regionalId` assegnato dal sistema regionale, `depositedAt` (passata), `validUntil` facoltativa, dichiarazione obbligatoria di firma e deposito. Solo con verbale inviato (`INSPECTION_DONE`), una sola volta; pratica ⇒ `DEPOSITED`; file cifrato come le evidenze; audit `certificate.upload`.
- Cliente: `GET /v1/cases/:id/certificate` (metadati e impronta SHA-256), `GET /v1/cases/:id/certificate/content` (download; il primo segna la consegna, pratica ⇒ `DELIVERED`, audit `certificate.deliver`, poi `certificate.read`).
- La piattaforma **non genera né modifica** l'APE e non effettua depositi: registra quanto dichiarato dal certificatore. Nessuna integrazione con portali regionali.
- Portale: modulo di caricamento per il certificatore; sezione APE con download nell'area organizzazioni.

## Integrazioni, annullamento e rinuncia (iterazione 15)
- **Richiesta di integrazioni** — `POST /v1/certifier/assignments/:id/evidence-requests {message, kinds[]}`: solo in `ASSIGNED`/`INSPECTION_SCHEDULED`; pratica ⇒ `AWAITING_EVIDENCE` (verbale bloccato). Il cliente vede le richieste (`GET /v1/cases/:id/evidence-requests`, contatore in `case-summaries`), carica i file e conferma con `POST .../evidence-requests/:rid/resolve` (member+); risolte tutte, la pratica torna allo stato precedente.
- **Annullamento del cliente** — `POST /v1/cases/:id/cancel {reason}` fino al verbale escluso: pratica `CANCELLED`, offerte e incarico `WITHDRAWN`, sopralluogo `CANCELLED`, richieste chiuse.
- **Rinuncia del certificatore** — `POST /v1/certifier/assignments/:id/withdraw {reason}` prima del verbale: incarico `WITHDRAWN`, sopralluogo annullato, pratica `SUBMITTED` e nuova offerta automatica (mai allo stesso certificatore).
- Tutte le transizioni sono aggiornamenti condizionali e auditati (`evidence_request.create|resolve`, `case.cancel`, `assignment.withdraw`).
- Interfacce: portale certificatore (richiesta e rinuncia), area organizzazioni (conferma integrazioni, annullamento), app (caricamento dei documenti richiesti dalla scheda pratiche).
