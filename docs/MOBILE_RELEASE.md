# Distribuzione di prova: TestFlight e Google Play (test interno) con GitHub Actions

Workflow: `.github/workflows/mobile-release.yml` — **Actions → "Mobile release (TestFlight / Google Play internal)" → Run workflow** (scegli `both`, `android` o `ios`), oppure push di un tag `mobile-vX.Y.Z`.
Il numero di build è il numero dell'esecuzione (`github.run_number`), quindi sempre crescente. Senza secret il workflow compila comunque le app (verifica), senza firmarle né caricarle.

## 1. Apple (TestFlight) — una tantum
1. **App Store Connect → App → "+" → Nuova app**: piattaforma iOS, nome "APE Italia" (o quello scelto), lingua italiano, **bundle ID `it.apeitalia.app`** (se non compare, viene registrato al primo archivio firmato; in alternativa crealo in Certificates, Identifiers & Profiles → Identifiers), SKU a piacere.
2. **Utenti e accesso → Integrazioni → App Store Connect API → Chiavi del team → "+"**: nome `github-actions`, ruolo **Admin** (necessario perché Xcode crei e gestisca in cloud certificati e profili di distribuzione). Scarica il file `AuthKey_XXXX.p8` (scaricabile una sola volta) e annota **Key ID** e **Issuer ID**.
3. **Team ID**: developer.apple.com → Membership details.
4. Secret su GitHub (**Settings → Secrets and variables → Actions → New repository secret**):

| Secret | Valore |
|---|---|
| `APPLE_TEAM_ID` | Team ID (10 caratteri) |
| `ASC_KEY_ID` | Key ID |
| `ASC_ISSUER_ID` | Issuer ID |
| `ASC_KEY_P8_BASE64` | contenuto del `.p8` in base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`) |

5. Dopo il primo caricamento: **TestFlight → Test interni** → aggiungi te stesso; installa l'app **TestFlight** sull'iPhone e accetta l'invito. L'app dichiara solo crittografia standard (`ITSAppUsesNonExemptEncryption = false`): conferma che è corretto per il tuo caso.

## 2. Google Play (test interno) — una tantum
1. **Chiave di caricamento** (una volta, conservala con cura insieme alle password; con Play App Signing, se persa, si può chiedere il reset a Google):
   ```
   keytool -genkeypair -v -keystore ape-italia-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
   (`keytool` è incluso in qualsiasi JDK; su Windows anche in Android Studio).
2. Secret su GitHub: `ANDROID_KEYSTORE_BASE64` (file `.jks` in base64, come sopra), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.
3. **Play Console → Crea app** ("APE Italia", app, gratuita). Lancia il workflow con `android`: scarica l'AAB firmato dagli *artifact* dell'esecuzione e **caricalo a mano la prima volta** in **Test → Test interno → Crea nuova release** (Google non consente il caricamento via API su un'app che non ha mai ricevuto un pacchetto). Accetta **Play App Signing**. Aggiungi i tester (la tua email) e apri il link di adesione dal telefono Android.
4. **Account di servizio per i caricamenti successivi**: Google Cloud Console → crea un service account e una chiave JSON; Play Console → **Utenti e autorizzazioni → Invita** l'email del service account con permesso di rilascio per l'app. Secret: `PLAY_SERVICE_ACCOUNT_JSON` (contenuto del JSON).
5. Dalle esecuzioni successive il workflow carica da solo sul canale **internal**. Se Play rifiuta perché l'app non ha ancora una release pubblicata, rilancia con `play_status = draft` e conferma la release dalla console.

## 3. Configurazione dell'app (facoltativa per la prima prova)
Senza queste variabili l'app parte in **modalità dimostrativa** (interfaccia completa, nessun login né invio). Per collegarla a un ambiente reale: **Settings → Secrets and variables → Actions → Variables**: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_CLIENT_ID` (es. `ape-mobile` del realm Keycloak), `EXPO_PUBLIC_OIDC_AUDIENCE` (`ape-italia-api`). Non sono segreti: finiscono nell'app.

## Sicurezza
I secret non sono mai stampati nei log; la chiave `.p8` viene scritta solo in una cartella temporanea del runner e cancellata a fine job; il workflow ha permessi `contents: read`. Non committare mai `.p8`, `.jks` o JSON di service account (la scansione segreti in CI li blocca).
