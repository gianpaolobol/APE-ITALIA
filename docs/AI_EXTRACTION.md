# Estrazione assistita (AI/OCR) con supervisione del certificatore

## Principi (MASTER_PLAN §2, §10, §11)
- Un valore estratto è una **proposta**, mai un dato accertato: nasce `needs_review` e diventa utilizzabile solo se il certificatore lo accetta o lo corregge.
- Provenienza registrata per ogni proposta: evidenza di origine, `modelId` (fornitore e versione), confidenza (0–1, se fornita), data; storico append-only di estrazione e revisione con attore e nota.
- Il vocabolario è lo stesso del verbale di sopralluogo: **nessun campo per classe energetica o indici di prestazione**. Output del fornitore fuori vocabolario o con valori non validi viene scartato e solo contato.
- La confidenza non sostituisce la prova: la revisione è obbligatoria a prescindere dal punteggio.

## Endpoint (certificatore con incarico accettato)
| Metodo | Percorso | Note |
|---|---|---|
| POST | `/v1/certifier/assignments/:id/evidence/:evidenceId/extract` | 503 se nessun fornitore; 423 se il file non è `clean` (mai inviare file non scansionati a terzi); 409 se già estratto con lo stesso modello; 20/min |
| GET | `/v1/certifier/assignments/:id/extracted-fields` | proposte e storico |
| POST | `/v1/certifier/assignments/:id/extracted-fields/:fieldId/review` | `{action: accept|correct|reject, value?, note?}`; correzione validata sul vocabolario; rifiuto con motivo; revisione definitiva |

Metriche aggregate (accettati/corretti/respinti e tasso di correzione per campo e modello, senza valori): `npm run admin -w @ape/api -- extraction-metrics`.

## Stato
- **Nessun fornitore AI attivo** (`EXTRACTION_PROVIDER = null`): inviare foto di immobili a un servizio esterno richiede DPA, valutazione privacy (eventuale DPIA), scelta del fornitore e autorizzazione esplicita. I test usano un *test double* deterministico, non un modello.
- Scanner antivirus non configurato ⇒ in pratica l'estrazione resta bloccata (423) anche dopo l'attivazione del fornitore, finché i file non risultano `clean`.
- Da fare: adattatore del fornitore scelto, dataset di valutazione autorizzato, soglie di qualità, collegamento delle proposte accettate al verbale (sempre come scelta esplicita del certificatore).
