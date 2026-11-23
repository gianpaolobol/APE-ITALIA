# Provider OIDC di riferimento: Keycloak (sviluppo e staging)

`deploy/keycloak/realm-ape-italia.dev.json` definisce il realm `ape-italia` con:
- client **pubblici** `ape-mobile` (redirect `apeitalia://auth/callback`) e `ape-web` (redirect di sviluppo `http://localhost:3300/auth/callback`), entrambi con **PKCE S256 obbligatorio**, nessun flusso implicito o password diretta;
- audience `ape-italia-api` aggiunta all'access token (mapper), richiesta dall'API;
- scope predefiniti espliciti (`basic`, `profile`, `email`, …) e `offline_access` opzionale per i refresh token;
- SSL obbligatorio, protezione brute force, rotazione dei refresh token, durata access token 5 minuti, nessuna registrazione autonoma; nessun utente né segreto nel file.

**Verifica in CI (job `keycloak-e2e`)**: Keycloak 26 in HTTPS con certificato usa-e-getta e password amministratore casuale; utente sintetico creato via admin API con password casuale; Chrome effettua il login sulla pagina Keycloak, il portale (BFF) completa Authorization Code + PKCE, l'API compilata verifica i token sul JWKS del provider, la pratica creata dal web viene salvata con l'attore uguale al `sub` Keycloak; una password errata non produce mai una sessione. Il test ha anche rilevato un errore di configurazione (scope predefiniti mancanti nei client importati), corretto.

## Per staging/produzione (decisioni e azioni del titolare)
- Scegliere se adottare Keycloak self-hosted o un servizio gestito (Auth0, Entra ID, Cognito, Zitadel…): il codice segue lo standard OIDC e non dipende dal fornitore.
- Con Keycloak: hostname HTTPS pubblico, database dedicato (non `start-dev`), redirect del portale reale (`https://<dominio>/auth/callback`), eventualmente client `ape-web` confidenziale con segreto in secret manager (`WEB_OIDC_CLIENT_SECRET`), **MFA (OTP/WebAuthn) obbligatoria per certificatori e amministratori**, policy password, SMTP per la verifica email, backup del realm.
- Configurare API (`OIDC_ISSUER=https://<host>/realms/ape-italia`, `OIDC_JWKS_URL=…/protocol/openid-connect/certs`, `OIDC_AUDIENCE=ape-italia-api`), portale e app (`EXPO_PUBLIC_*`).
