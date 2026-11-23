# Portale web certificatori (Next.js, pattern BFF)

## Architettura
- Login OIDC Authorization Code + PKCE S256 **lato server** (`/auth/login`, `/auth/callback`): `state`, `nonce` e verifier in un cookie cifrato monouso (`__Host-ape_login`, 10 min, AES-256-GCM con scopo legato come AAD).
- Firma dell'ID token verificata con il JWKS del provider (`jose`), issuer, audience = client ID, nonce, `iss` RFC 9207 nel callback.
- Sessione in cookie `__Host-ape_session` cifrato, `HttpOnly`, `Secure`, `SameSite=Lax`, 8 h; **i token non sono mai esposti al JavaScript del browser**; l'ID token non viene conservato (limite 4 KB dei cookie).
- Access token scaduto ⇒ nuovo login (refresh lato server non ancora implementato).
- Chiamate API e download delle evidenze passano dal server Next (proxy), con `nosniff` e `no-store`.
- Azioni (accetta/rifiuta) tramite Server Actions, protette da Next.js con controllo dell'Origin; logout solo in POST (GET ⇒ 405).
- Redirect post-login solo verso percorsi relativi (nessun open redirect).
- Header di sicurezza: `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer`, HSTS, `Permissions-Policy`; `X-Powered-By` disattivato.
- Senza configurazione completa il portale è chiuso (`/auth/login` ⇒ 503, pagine mostrano "Portale non configurato").

## Configurazione (solo lato server, mai `NEXT_PUBLIC_*`)
| Variabile | Note |
|---|---|
| `OIDC_ISSUER` | HTTPS |
| `WEB_OIDC_CLIENT_ID` | client web registrato con redirect `<WEB_BASE_URL>/auth/callback` |
| `WEB_OIDC_CLIENT_SECRET` | facoltativo (client confidenziale), inviato solo via HTTP Basic |
| `OIDC_AUDIENCE` | default `ape-italia-api` |
| `WEB_BASE_URL` | HTTPS (o `http://localhost:<porta>` in sviluppo) |
| `API_BASE_URL` | HTTPS |
| `WEB_SESSION_KEY` | 32 byte base64 in secret manager |

## Pagine
- `/certifier`: offerte (solo comune/regione, accetta/rifiuta con motivo) e incarichi accettati.
- `/certifier/[id]`: indirizzo, superficie dichiarata *da verificare*, elenco evidenze con download.

## Verifiche eseguite
15 test unitari (cookie sigillati, configurazione, redirect, discovery, login completo contro un provider fittizio che verifica PKCE lato server, nonce/audience/chiave errati, mix-up `iss`, verifier di un altro login); `next build`; smoke test `next start` senza configurazione (200/503/405 e header). **Nessun test con provider reale né browser end-to-end.**

## Mancante
Refresh token lato server, logout RP-initiated presso il provider, pagine per professionisti (portafoglio, membri, inviti), sopralluogo/verbale, test E2E (Playwright).

## Area organizzazioni (privati, professionisti, agenzie) — iterazione 11
- `/org`: scelta dell'organizzazione (preferenza in cookie `__Host-ape_org`, sempre riconvalidata con `GET /v1/me`: non è un'autorizzazione), riepilogo per stato, elenco pratiche con immobile.
- `/org/cases/[id]`: stato, sopralluogo (data, certificatore), elenco file caricati; nessun contenuto tecnico del verbale.
- `/org/members` (owner/admin): ruoli e revoca/riattivazione con gli stessi vincoli dell'API (ultimo owner protetto, admin non modifica owner/admin), creazione inviti con **codice mostrato una sola volta** in un componente client (`useActionState`), elenco e revoca inviti. Nessun invio email.

## Test end-to-end in browser (iterazione 17)
`apps/web/e2e/portal.e2e.spec.ts`: Chrome reale (playwright-core, nessun download di browser), `next start` sulla build, provider OIDC fittizio in HTTPS che **verifica PKCE S256** e firma l'ID token, API fittizia che controlla il bearer. Verifica: login completo, un solo scambio di token, cookie di sessione `HttpOnly`/`Secure`/`SameSite=Lax`, `document.cookie` vuoto, token assente da HTML e cookie, indirizzo nascosto prima dell'accettazione, Server Action "Accetta", logout che rimuove la sessione, callback contraffatto rifiutato senza contattare il token endpoint, header di sicurezza.

**Difetto trovato e corretto**: `cookies().delete()` non cancellava i cookie `__Host-` (il browser ignora il `Set-Cookie` senza `Secure` e `Path=/`), quindi lo stato di login restava riutilizzabile per 10 minuti e il logout non eliminava la sessione. Ora la cancellazione ripete gli attributi del cookie.
