# Sprint 2 — Interfacce e API
Branch: `feat/sprint-2-mobile-api`.

## Implementato
- Client API mobile TypeScript con chiamate GET/POST immobili e pratiche.
- Token e organizzazione passati da sessione autenticata, mai da costanti di demo.
- Solo URL HTTPS; errori 401/403 distinti.
- Definizione condivisa dei cinque passaggi di acquisizione e validazione minima dati immobile.

## Non ancora implementato
- Provider OIDC effettivo e login mobile.
- Persistenza sicura della sessione su dispositivo.
- Integrazione del client nelle schermate Expo; al momento la demo mobile non salva i dati.
- Caricamento foto, OCR, workflow certificatori e pagamenti.
- Test dispositivo iOS/Android e test API end-to-end.

## Gate
Non inserire token nel codice o nel repository pubblico. Non utilizzare dati personali reali fino alla validazione privacy e sicurezza. La nuova API client non va considerata collegata all'interfaccia finché non viene effettivamente usata dalle schermate.
