# [Codex] Lifecycle chiave media — 26/11/2026 (iterazione 51)

## Evidenze di ripresa
- Main iniziale `295fc3f464d10a3a7a184702a99600459b9b4135`, run push [45735799619](https://github.com/gianpaolobol/APE-ITALIA/actions/runs/45735799619): quattro job success. Backup `backup/2026-11-25-stable` verificato esatto `53b9c11cef75a4c4486318e963e6a8b3352a8b31`, nessuna scrittura.
- PR #94 head `62c6607df87efc2f79ebf8ddef0f4e3fbd23a4dd`, CI [45735958614](https://github.com/gianpaolobol/APE-ITALIA/actions/runs/45735958614) completed/success, quattro job verdi, log verify 139629154756: media-envelope.spec.ts 10 test passati, typecheck mobile verde. Riletta patch, integrabile, ancora non cablata. Richiesta revisione incrociata effettiva nel commento 7180803064; non dichiararla eseguita.
- PR #93 head a15b13841d01bcec4bfa63103e88e6bd8d87828f, CI starter 45738933732 e linee guida 45738933400 verdi. STATO.md ancora obsoleto (#88 già integrata, CI non ferma al controllo). Il registro centrale è accessibile per LINEE_GUIDA.md (main v1.0.0 contro v1.1.0 in #93); mappa e diario restituiscono 404. Commento 7180803540, nessuna modifica al branch Claude.
- Nessun writer Work concorrente confermato, nessun agente distinto avviato. Letti MASTER_PLAN e WORK_V1_HANDOFF. Branch separato senza file condivisi con #94 o #93.

## Implementazione
- Chiave media distinta dalla chiave snapshot, CSPRNG Expo, SecureStore con WHEN_UNLOCKED_THIS_DEVICE_ONLY (iOS), verifica rilettura. Nessuna nuova dipendenza, nessuna modifica dei flussi utente.
- Creazione serializzata in un runtime; non sostituire chiave mancante se esiste qualsiasi evidenza cifrata o dopo precedente osservazione/tentativo di scrittura nello stesso processo. Rifiuto record malformati, errori di scansione e sessioni invalidate. Azzeramento best-effort delle copie temporanee Uint8Array; non equivale a cancellazione garantita in memoria JS o nativa.
- Nove test sintetici predisposti: concorrenza, riavvio simulato, perdita chiave, scansione fallita, record invalido, scrittura non confermata, evidenza sopravvenuta, invalidazione, pulizia buffer. CI non ancora eseguita per questo branch.

## Limiti e prossimi gate
- Il chiamante deve scansionare tutti gli envelope durevoli, staging, journal e orfani; incertezza = errore. Un solo writer nativo/JS, niente concorrenza multiprocesso. Non protegge da rollback del record SecureStore o intero manifest, né da un processo già compromesso.
- Chiave per dispositivo, non per tenant: vincolare manifest autenticato e identità non riutilizzabile a pratica/account, preservare isolamento e cancellazione. Nessun fallback in chiaro. Il modulo non è collegato alla UI.
- Restano adapter FileHandle, pubblicazione atomica e recovery, migrazione non distruttiva, manifest anti-replay, preview/share/upload temporanei, test su device bloccato e su file grandi.
- Non attribuire a questo ramo nuove build native, staging, distribuzione o test fisici. Ultime build dimostrative f5ecc9a4. Non confermate quote né host gratuito, nessuna spesa deliberata. V1.0 non validata.
