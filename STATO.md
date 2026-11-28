# Stato — APE-ITALIA

> Formato fisso: `gianpaolobol/registro-delle-idee` → `PROTOCOLLO_AI.md`, sezione 4. Massimo una pagina: i dettagli restano in `docs/HANDOFF_CLAUDE.md`, `docs/CLAUDE_PROGRESS.md`.

## Cos'è
Piattaforma Android, iOS e web per richieste di Attestato di Prestazione Energetica assistite da AI; i certificatori si registrano con il numero SACE.

## Fase
in sviluppo

## Dove è pubblicata
non pubblicata

## Prossimi passi
1. Integrare la PR #88 dopo che la CI ha eseguito il test PostgreSQL (tentativi atomici sul codice di login)
2. Pubblicazione su App Store e Play Store (obiettivo di Gian)

## Blocchi
- CI di GitHub ferma: pagamento o limite di spesa dell'account da sistemare (Gian)

## Componenti condivisi
- Usa da altri repository: —
- Offre agli altri: Login con codice email e rotazione token (`services/api/src/platform-auth`); OIDC+PKCE mobile (`apps/mobile/src/auth`); file cifrati con antivirus (`services/api/src/evidence`)

## Linee guida
Segue la versione **1.1.0** (`LINEE_GUIDA.md`).

## Registro aggiornamenti
- 2026-11-26 [Claude] Prima compilazione dai contenuti del repository; le voci "da confermare" vanno verificate.
