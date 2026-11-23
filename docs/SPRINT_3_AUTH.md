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

## Iterazione Claude 23/11 — flusso Authorization Code + PKCE completo (lato codice)
Implementato in `apps/mobile/src/auth/`, con piattaforma iniettata per poterlo testare senza dispositivo:
- `oidc.ts`: discovery con issuer esatto e S256 obbligatorio; verifier da 32 byte CSPRNG (43 caratteri), challenge `BASE64URL(SHA-256(verifier))` verificato con il vettore RFC 7636 App. B; `state` e `nonce` casuali distinti; callback con controllo redirect URI esatto, `state` a tempo costante, `iss` RFC 9207, parametri duplicati rifiutati; scambio codice senza client secret; validazione ID token (iss, aud/azp, exp, iat, nonce, alg ≠ none/HS*); refresh con rotazione; revoca RFC 7009.
- `client.ts`: login via browser di sistema, sessione in memoria, **solo il refresh token** persistito in secure storage (mai access/ID token), refresh 60 s prima della scadenza, deduplica refresh concorrenti, `invalid_grant` ⇒ logout locale, logout locale sempre riuscito con revoca best effort.
- `expo-adapters.ts`: `expo-crypto` (getRandomBytes, SHA-256), `expo-web-browser` (`openAuthSessionAsync`: ASWebAuthenticationSession / Custom Tabs, nessuna WebView), `expo-secure-store` con `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- `url.ts`/`encoding.ts`: niente `URL`/`URLSearchParams`/`TextDecoder` nel codice auth, perché il polyfill React Native non segue WHATWG (es. `toString()` duplica la query).
- `session.ts`: configurazione pubblica da `EXPO_PUBLIC_*`; se assente l'app resta in modalità dimostrativa senza invii. La sessione API nasce solo da token valido + membership confermata da `GET /v1/me`; con più organizzazioni serve scelta esplicita; soggetto token/API deve coincidere.
- `App.tsx`: pulsanti Accedi/Esci, scelta organizzazione, invio solo con sessione verificata.
- Rimossi `pkce.ts`/`pkce.spec.ts`, sostituiti dal modulo sopra.

API:
- `AuthService.verify()` separato da `authorize()`; JWKS remoto creato una sola volta (cache), solo HTTPS, algoritmi RS256/ES256, `sub` ed `exp` obbligatori.
- `GET /v1/me`: soggetto verificato e membership attive dal database.
- Iniezione esplicita `@Inject(...)`: vitest/esbuild non emette metadati decorator e il modulo Nest non si avviava nei test.
- `app.module.ts` separato da `main.ts`; test HTTP reale del modulo Nest (health 200, 401 senza token / token invalido).

Test (eseguiti localmente in questa sessione, vedi `docs/CLAUDE_PROGRESS.md`): mobile 72, API 33 unitari/HTTP + 8 integrazione PostgreSQL (eseguiti solo in CI). Il provider OIDC di test è un fake in memoria che **verifica lato server** il binding PKCE, per cui i test dimostrano il protocollo, non l'integrazione con un provider reale.

### Blocchi che richiedono intervento umano
1. Scelta del provider OIDC (es. Auth0, Keycloak, Entra ID, Cognito, Zitadel) e creazione del tenant di sviluppo: decisione e account dell'utente.
2. Registrazione del client pubblico con redirect `apeitalia://auth/callback`, abilitazione refresh token (`offline_access`) e audience `ape-italia-api`.
3. Valorizzazione di `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_CLIENT_ID`, `EXPO_PUBLIC_API_BASE_URL` (non segreti) e lato API `OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`.
4. Test su iPhone/Android reali: non eseguiti. È stato verificato solo il bundle JavaScript Hermes (`expo export`) per Android e iOS.
5. La firma dell'ID token sul dispositivo non viene verificata (ammesso da OIDC Core 3.1.3.7 punto 6 perché ricevuto direttamente via TLS dal token endpoint); l'autorizzazione resta sul server, che verifica firma e audience dell'access token.
