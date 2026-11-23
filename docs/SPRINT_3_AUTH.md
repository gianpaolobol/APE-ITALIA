# Sprint 3 — Autenticazione reale
Branch: `feat/sprint-3-auth-foundation`.

## Implementato
- Validazione della configurazione pubblica OIDC per app mobile.
- Test per issuer HTTPS, client ID e redirect URI con schema dell'app.
- Baseline del piano di integrazione PKCE in `docs/OIDC_INTEGRATION.md`.

## Ancora da implementare
- Scelta e configurazione del provider OIDC.
- Authorization Code + PKCE tramite browser di sistema.
- Gestione callback, stato/nonce e sessione in secure storage.
- Provisioning organizzazioni/membership e logout/revoca.
- Test di integrazione con token firmati e dispositivi reali.

Nessuna credenziale viene inserita nel repository pubblico; il login rimane disabilitato fino al completamento.

## Iterazione 23/11 — PKCE preparatorio
Aggiunti helper di codifica base64url, generazione verifier a partire da byte sicuri forniti dalla piattaforma e costruzione URL di autorizzazione S256, con cinque test unitari. **Non sono ancora implementati**: generatore casuale nativo, SHA-256 del verifier per produrre il challenge, apertura browser, verifica callback state/nonce, scambio code/token, secure storage e provider reale. Non presentare gli helper come login funzionante.
