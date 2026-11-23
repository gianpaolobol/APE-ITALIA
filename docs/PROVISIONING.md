# Provisioning organizzazioni e membership

Nessun endpoint pubblico crea organizzazioni. Il ciclo di vita è:

1. **Bootstrap da operatore** (shell fidata con `DATABASE_URL` del solo ambiente interessato):
   ```
   npm run build -w @ape/api
   npm run admin:create-org -w @ape/api -- --name "Studio Esempio" --owner-subject "<claim sub del provider OIDC>" --operator "<id operatore>"
   ```
   Crea organizzazione + membership `owner` in un'unica transazione, con due eventi di audit con attore `operator:<id>`. Il `sub` deve essere letto dal provider OIDC dopo la registrazione dell'utente (mai inventato).
2. **Inviti** (owner/admin autenticati, header `x-organization-id`):
   - `POST /v1/invitations` `{role, ttlHours?}` (1–168 h, default 72) ⇒ restituisce **una sola volta** un codice da 256 bit; nel database resta solo l'hash SHA-256.
   - `GET /v1/invitations` (in attesa), `DELETE /v1/invitations/:id` (revoca).
   - Il codice va consegnato all'invitato fuori banda (nessun invio email automatico è implementato o autorizzato).
3. **Accettazione**: `POST /v1/invitations/accept` `{code}` con il token dell'invitato; monouso, errore uniforme per codici inesistenti/scaduti/revocati/usati; un ex membro revocato viene riattivato con il ruolo dell'invito; un membro già attivo riceve 409 e l'invito resta valido.
4. **Gestione membri**: `GET /v1/members`, `PATCH /v1/members/:id` `{role?, active?}`.

## Regole di ruolo
| Azione | owner | admin | member | viewer |
|---|---|---|---|---|
| Elencare membri / inviti | sì | sì | no | no |
| Invitare owner/admin | sì | no | no | no |
| Invitare member/viewer | sì | sì | no | no |
| Modificare/revocare owner o admin | sì | no | no | no |
| Modificare/revocare member/viewer | sì | sì | no | no |

L'ultimo owner attivo non può essere declassato né revocato (lock di riga `FOR UPDATE` contro le modifiche concorrenti). La revoca ha effetto alla richiesta successiva, perché ogni richiesta rilegge la membership dal database.

## Non ancora coperto
- Rate limiting sugli endpoint (necessario prima della produzione).
- MFA obbligatoria per owner/admin/certificatori: dipende dalla policy del provider OIDC scelto.
- Interfaccia web/mobile per la gestione dei membri.
