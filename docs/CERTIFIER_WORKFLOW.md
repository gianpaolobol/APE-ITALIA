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
