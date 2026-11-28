# Stato — APE-ITALIA

> Formato fisso: `gianpaolobol/registro-delle-idee` → `PROTOCOLLO_AI.md`, sezione 4. Massimo una pagina: i dettagli restano in `docs/HANDOFF_CLAUDE.md`, `docs/CLAUDE_PROGRESS.md`.

## Cos'è
Piattaforma Android, iOS e web per richieste di Attestato di Prestazione Energetica assistite da AI; i certificatori si registrano con il numero SACE.

## Fase
in sviluppo

## Dove è pubblicata
non pubblicata

## Prossimi passi
1. Verificare CI completa con correzione Vitest 4, valutare librerie vendorizzate e ottenere revisione indipendente del candidato #113.
2. CI esatta su base aggiornata e merge solo dopo approvazione; CI push sul nuovo main.
3. Build native iOS/Android sullo stesso SHA, verifica quote e staging isolato, distribuzione esclusivamente interna.
4. Collaudo fisico e professionale, esportazione verso software energetico conforme; marketing/ASO dopo validazione.

## Blocchi
- Revisore indipendente non ancora registrato; audit npm completo e produzione entrambi zero nel diagnostico 46149693120 (Vitest 4.1.12); correzione inclusa in questo candidato, CI integrata da verificare.
- Main b9d682c: CI e verifica linee guida verdi. #113 (head precedente 2927612): CI quattro job e linee guida verdi; diagnostico nuovo 480 test passati, 92 saltati condizionali; nuova CI necessaria.
- Quote, dispatch build, credenziali/staging e test fisici non confermati; Work/titolare per accessi indispensabili. Nessuna produzione.

## Componenti condivisi
- Usa da altri repository: —
- Offre agli altri: Login con codice email e rotazione token (`services/api/src/platform-auth`); OIDC+PKCE mobile (`apps/mobile/src/auth`); file cifrati con antivirus (`services/api/src/evidence`)

## Linee guida
Segue la versione **1.1.0** (`LINEE_GUIDA.md`).

## Registro aggiornamenti
- 2026-11-26 [Claude] Prima compilazione dai contenuti del repository; le voci "da confermare" vanno verificate.
- 2026-11-28 [Codex] Candidato #113 riallineato a main preservando le linee guida Claude; nessuna validazione finale. Backup 53b9c11 invariato. Registro/mappa non accessibili (404).
- 2026-11-28 [Codex] Applicato lock npm generato e verificato da artifact 15264943322, audit completo zero nel diagnostico, nuovo gate critico anche dev. Nessuna validazione finale o build installabile.
