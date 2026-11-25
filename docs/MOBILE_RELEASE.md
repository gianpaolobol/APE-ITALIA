# Distribuzione di prova: TestFlight, Firebase App Distribution e Google Play con GitHub Actions

## Modalità di esecuzione

- `mode: build-only` (predefinito): compila Android con chiave debug e iOS per simulatore senza firma, senza configurazione pubblica API/OIDC, senza usare le credenziali di firma e senza autenticazione/upload Firebase, Play o TestFlight. Gli artifact Android restano disponibili in GitHub Actions. Non è una prova di installazione fisica.
- `mode: distribute`: solo scelta esplicita, dopo CI verde sullo SHA esatto, verifica di quote/costi e configurazione separata di test. I canali consentiti sono Firebase App Distribution, Play internal e TestFlight. Non utilizzare dati reali.
- Tutte le istruzioni di caricamento riportate sotto presuppongono `mode: distribute`; la scelta della sola piattaforma non avvia upload.

## Android con Firebase App Distribution (scelta attuale per le prove)

### Configurazione dal telefono, senza chiavi (consigliata)
Workflow **Firebase bootstrap** (`.github/workflows/firebase-bootstrap.yml`), una sola volta:
1. Viene avviato (da Claude o da Actions → Run workflow) e apre una issue con un link di accesso Google.
2. Il titolare apre il link dall'iPhone, accede e copia il codice mostrato da Google; lo consegna a Claude in chat (Claude lo pubblica nella issue **cifrato** con la chiave pubblica effimera del runner) oppure lo scrive lui stesso nella issue come `CODE: <codice>`. L'accesso usa PKCE: il codice è inutile senza il segreto che resta nel runner. Sono accettati solo commenti del proprietario del repository.
3. Il runner esegue `deploy/firebase/bootstrap.sh`: progetto Google Cloud `ape-italia-*` (riusato se esiste), Firebase, API necessarie, app Android `it.apeitalia.app`, gruppo tester `interni` con l'account del titolare, account di servizio con il solo ruolo *Firebase App Distribution Admin* e **Workload Identity Federation** che accetta solo token OIDC di questo repository. Nessuna chiave viene creata o salvata.
4. Le credenziali temporanee vengono revocate e cancellate; gli identificativi (non segreti) sono pubblicati nella issue e salvati in `deploy/firebase/config.json`, letto da "Mobile release".

### Alternativa con chiave di account di servizio
Il workflow compila un APK di rilascio e, se trova il secret `FIREBASE_SERVICE_ACCOUNT_JSON`, **registra da solo l'app Android** (`it.apeitalia.app`) nel progetto Firebase della chiave (solo la prima volta) e la **distribuisce ai tester**. Nessun caricamento manuale.

Passi una tantum del titolare (fattibili anche da browser del telefono, in modalità desktop):
1. **console.firebase.google.com** → apri o crea il progetto (es. "APE Italia") → menu **Release & Monitor → App Distribution → Inizia**.
2. **Impostazioni progetto → Account di servizio → Genera nuova chiave privata** (scarica un JSON).
3. **console.cloud.google.com → IAM e amministrazione → IAM** (stesso progetto) → modifica l'account `firebase-adminsdk-…` → aggiungi i ruoli **Amministratore Firebase** e **Amministratore Firebase App Distribution**.
4. **GitHub → Settings → Secrets and variables → Actions**:
   - *Secrets* → `FIREBASE_SERVICE_ACCOUNT_JSON` = intero contenuto del JSON;
   - *Variables* → `FIREBASE_TESTERS` = email dei tester separate da virgola (es. la tua).
5. **Actions → Mobile release → Run workflow → android**. Arriva un'email di invito: dal telefono Android si installa l'app *Firebase App Tester* e poi APE Italia.

Senza chiave di caricamento l'APK è firmato con la chiave di debug del progetto, sempre la stessa: va bene per i tester (gli aggiornamenti si installano sopra), non per Google Play.


Workflow: `.github/workflows/mobile-release.yml` — **Actions → "Mobile release (TestFlight / Google Play internal)" → Run workflow** (scegli `both`, `android` o `ios`). Il dispatch è consentito solo su `main` corrente e dopo il successo della CI push sullo SHA esatto (tutti e quattro i job); i tag non avviano distribuzioni. Se una CI è fallita o mancano job nell'ultimo tentativo, rieseguire tutti i job e verificare il risultato. Il gate non sostituisce l'autorizzazione di spesa o la validazione fisica.
Il numero di build è il numero dell'esecuzione (`github.run_number`), quindi sempre crescente. In modalità build-only, anche se esistono secret, Android compila con firma debug e iOS per simulatore senza firma; non vengono avviati upload agli store. In modalità distribute gli upload dipendono dalle credenziali configurate.

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
| `ASC_KEY_P8` | testo del file `.p8` incollato così com'è (comodo da iPhone: aprilo in File → copia tutto). In alternativa `ASC_KEY_P8_BASE64` con il file in base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_XXXX.p8"))`) |

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
