# Esportazione verso software di calcolo conforme

`GET /v1/certifier/assignments/:id/export[?format=json|csv]` — solo il certificatore con incarico accettato e **dopo l'invio del verbale**; ogni esportazione è auditata (`case.export`). Il portale web offre i link JSON/CSV nella pagina dell'incarico.

## Documento JSON `ape-italia/case-export` v1.0
- `disclaimer`: dati di input, non un APE; classe energetica, calcolo, firma e deposito restano del certificatore.
- `property`: indirizzo, comune, regione; superficie **dichiarata dal richiedente** (`declaredFloorAreaStatus: declared_by_requester`).
- `inspection.findings[]`: voce, etichetta, unità, valore, `verification` (verified / to_verify / undeterminable), fonte, nota, evidenza (id + SHA-256).
- `reviewedExtractions[]`: solo proposte AI accettate o corrette dal certificatore, sempre con `verification: to_verify` (una revisione documentale non equivale a una verifica in sito).
- `evidence[]`: elenco file con hash SHA-256 per tracciabilità.
- `completeness[]`: stato di ogni voce del vocabolario (`not_reported` se assente).
- Nessun campo per classe energetica o indici di prestazione.

## CSV dei rilievi
UTF-8 con BOM, RFC 4180, una riga per voce; celle che iniziano con `= + - @` prefissate da apostrofo (protezione da formula injection nei fogli di calcolo).

## Da decidere
Il formato d'importazione del software scelto (es. tracciato proprietario o XML regionale) non è ancora noto: il fornitore di calcolo è una decisione aperta del MASTER PLAN §18. Questo documento è il formato neutro da cui scrivere l'adattatore, previa verifica di licenze e compatibilità.
