# Caricamento evidenze — specifica implementata (Sprint 4)

## Endpoint (tutti autenticati; `x-organization-id` obbligatorio)
| Metodo | Percorso | Ruoli | Note |
|---|---|---|---|
| GET | `/v1/notices` | qualsiasi | versioni correnti delle informative |
| POST | `/v1/cases/:caseId/consents` | owner/admin/member | `{kind:"evidence_processing", version}`; idempotente, auditato |
| POST | `/v1/cases/:caseId/evidence` | owner/admin/member | multipart: `kind` + `file` |
| GET | `/v1/cases/:caseId/evidence` | tutti i membri | solo metadati |
| GET | `/v1/evidence/:id/content` | tutti i membri | download, auditato |

## Controlli all'upload (in ordine)
1. Token verificato e membership attiva; viewer esclusi.
2. Storage configurato, altrimenti 503 (fail closed).
3. `kind` ∈ boiler, heating, envelope, window, floorplan, document.
4. Pratica dell'organizzazione (altrimenti 404) e in uno stato che accetta evidenze (altrimenti 409).
5. Consenso del caricatore all'informativa **corrente** per quella pratica (altrimenti 403).
6. Dimensione ≤ 15 MB (413 da multer, file solo in memoria).
7. Tipo determinato dal **contenuto** (JPEG, PNG, HEIC, PDF): Content-Type e nome file ignorati (415). PDF solo per planimetrie e documenti.
8. JPEG: rimozione segmenti APP1 (EXIF/XMP, inclusa posizione GPS) e APP13 (IPTC); struttura non valida ⇒ 422. *PNG/HEIC/PDF non vengono ancora ripuliti dai metadati.*
9. SHA-256 del contenuto ripulito; duplicato nella stessa pratica ⇒ 409.
10. Scansione malware: con `CLAMAV_HOST` impostato l'API interroga ClamAV (`clamd`, protocollo INSTREAM); `infected` ⇒ 422; scanner configurato ma irraggiungibile o risposta anomala ⇒ **503 e nessun salvataggio** (fail closed). Senza `CLAMAV_HOST` il file è salvato come `unscanned` e il worker lo scansiona appena lo scanner è disponibile (`rescan`, ogni 5 minuti): i file infetti diventano `infected` (download 410) con evento `evidence.quarantine`.
11. Cifratura AES-256-GCM con IV casuale e chiave di archiviazione come AAD; chiave dell'oggetto generata dal server (`org/<org>/case/<case>/<uuid>`); scrittura atomica con permessi 0600; riga DB + audit in transazione, oggetto eliminato se la transazione fallisce.

## Upload riprendibili

Ogni parte di un upload riprendibile richiede nuovamente membership attiva con ruolo di scrittura, pratica ancora aperta alle evidenze, consenso alla versione corrente e storage configurato. Il possesso dell'identificativo di un upload precedente non autorizza ulteriori scritture. Le parti sono tuttora temporanee in chiaro (directory privata); la cifratura dello storage finale non le protegge. La pubblicazione delle parti è serializzata sulla riga PostgreSQL dell'upload; scrittura su file temporaneo con successiva rinomina, retry identico idempotente e retry con contenuto differente rifiutato (409). Un marker senza file richiede un nuovo upload; un file completo senza marker può essere recuperato solo con gli stessi byte. La garanzia presuppone un filesystem condiviso fra i processi API e che tutti usino questa versione del protocollo. Restano da validare retention degli upload abbandonati, crash del sistema/disco, transizione da versioni precedenti, protezione dei file temporanei e concorrenza con revoca del consenso. Il controllo non annulla retroattivamente parti già accettate né garantisce l'atomicità con cambi di stato simultanei.

## Download
Solo nella stessa organizzazione (404 altrimenti); `infected` ⇒ 410; `unscanned` ⇒ 423 a meno di `EVIDENCE_ALLOW_UNSCANNED=1` (solo sviluppo). Intestazioni `Content-Disposition: attachment`, `X-Content-Type-Options: nosniff`, `Cache-Control: no-store`. Ogni lettura genera `evidence.read` in audit.

## Da completare prima della produzione
- Testo dell'informativa (versione `2026-11-23-draft`) da redigere/validare con consulente privacy; il codice gestisce solo versioni e prova del consenso.
- Storage gestito (bucket privato con cifratura lato server e chiavi in KMS); l'implementazione su disco serve a sviluppo/self-hosting.
- Rotazione della chiave master, retention e cancellazione su richiesta dell'interessato.
- Ripulitura metadati per PNG/HEIC/PDF; limiti di frequenza.
- UI mobile di acquisizione (fotocamera/documenti).
