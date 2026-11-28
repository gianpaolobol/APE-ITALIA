# Stato — APE-ITALIA

> Formato fisso: `gianpaolobol/registro-delle-idee` → `PROTOCOLLO_AI.md`, sezione 4. Massimo una pagina: i dettagli restano in `docs/HANDOFF_CLAUDE.md`, `docs/CLAUDE_PROGRESS.md`.

## Cos'è
Piattaforma Android, iOS e web per richieste di Attestato di Prestazione Energetica assistite da AI; i certificatori si registrano con il numero SACE.

## Fase
in sviluppo

## Dove è pubblicata
non pubblicata

## Prossimi passi
1. Completare audit dev (Vitest/Tinypool), valutare librerie vendorizzate e revisione indipendente del candidato #113.
2. CI esatta su base aggiornata e merge solo dopo approvazione; CI push sul nuovo main.
3. Build native iOS/Android sullo stesso SHA, verifica quote e staging isolato, distribuzione esclusivamente interna.
4. Collaudo fisico e professionale, esportazione verso software energetico conforme; marketing/ASO dopo validazione.

## Blocchi
- Revisore indipendente non ancora registrato; audit dev 3 (2 critiche/1 moderata) sul candidato precedente, produzione 0; correzione dev in diagnosi.
- Main b9d682c: CI e verifica linee guida verdi. #113 (head precedente b919d6a): 604 test passati, 18 esecuzioni condizionali saltate; nuova CI necessaria.
- Quote, dispatch build, credenziali/staging e test fisici non confermati; Work/titolare per accessi indispensabili. Nessuna produzione.

## Componenti condivisi
- Usa da altri repository: —
- Offre agli altri: Login con codice email e rotazione token (`services/api/src/platform-auth`); OIDC+PKCE mobile (`apps/mobile/src/auth`); file cifrati con antivirus (`services/api/src/evidence`)

## Linee guida
Segue la versione **1.1.0** (`LINEE_GUIDA.md`).

## Registro aggiornamenti
- 2026-11-26 [Claude] Prima compilazione dai contenuti del repository; le voci "da confermare" vanno verificate.
- 2026-11-28 [Codex] Candidato #113 riallineato a main preservando le linee guida Claude; nessuna validazione finale. Backup 53b9c11 invariato. Registro/mappa non accessibili (404).
