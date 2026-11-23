# Build e prove su dispositivi (iPhone / Android)

> **Percorso consigliato ora: GitHub Actions** → `docs/MOBILE_RELEASE.md` (TestFlight e test interno Google Play, senza EAS). La procedura EAS qui sotto resta un'alternativa.

Configurazione pronta nel repository: `apps/mobile/eas.json` (profili `preview` per installazione interna e `production` per gli store), identificativi `it.apeitalia.app` (iOS e Android), schema di redirect `apeitalia://`, permessi minimi (fotocamera; posizione, microfono, overlay e storage esterno bloccati), icona **provvisoria** in `apps/mobile/assets/` da sostituire quando il branding sarà deciso. Verificato con `expo prebuild` (manifest e Info.plist) e bundle Hermes; **nessuna build EAS eseguita** (richiede i tuoi account).

## Cosa serve (azioni del titolare)
1. Account Expo (gratuito) e, per iPhone, **Apple Developer Program** (99 €/anno). Da Windows si usa la build in cloud EAS: non serve un Mac.
2. Provider OIDC con client **pubblico** per l'app, redirect `apeitalia://auth/callback`, refresh token abilitati, audience `ape-italia-api`.
3. API raggiungibile in HTTPS (vedi `docs/DEPLOYMENT.md`).

## Passi
```
npm i -g eas-cli
cd apps/mobile
eas login
eas init                                  # collega il progetto (scrive projectId in app.json)
eas env:create --environment preview --name EXPO_PUBLIC_OIDC_ISSUER --value https://...
eas env:create --environment preview --name EXPO_PUBLIC_OIDC_CLIENT_ID --value ...
eas env:create --environment preview --name EXPO_PUBLIC_API_BASE_URL --value https://...
eas build -p android --profile preview    # APK installabile direttamente
eas device:create                         # registra l'iPhone (UDID) per le build interne
eas build -p ios --profile preview        # installazione via link/QR sull'iPhone registrato
```
Le variabili `EXPO_PUBLIC_*` non sono segreti (finiscono nell'app) ma restano fuori dal repository.

## Checklist delle prove manuali (da registrare con data, dispositivo e versione)
- [ ] Avvio senza configurazione: messaggio "accesso non configurato", nessun invio
- [ ] Accedi → pagina del provider nel browser di sistema → ritorno nell'app autenticato
- [ ] Login annullato: nessun errore bloccante, nessuna sessione
- [ ] Chiusura e riapertura dell'app: sessione ripristinata senza nuovo login
- [ ] Più organizzazioni: scelta obbligatoria prima della bozza
- [ ] Crea bozza → consenso → foto con fotocamera (permesso concesso e negato) → foto da galleria → PDF planimetria
- [ ] File oltre 15 MB o formato non ammesso: messaggio chiaro
- [ ] Invia richiesta → "Le mie pratiche" mostra lo stato
- [ ] Integrazioni richieste dal certificatore: caricamento e conferma
- [ ] Download APE: apertura del foglio di condivisione con il PDF
- [ ] Esci: richiesta di nuovo login all'avvio successivo
- [ ] Rete assente durante caricamento/invio: errore gestito, nessun doppio invio
