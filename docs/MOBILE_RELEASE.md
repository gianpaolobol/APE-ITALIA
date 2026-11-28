# Distribuzione di prova: TestFlight, Firebase App Distribution e Google Play con GitHub Actions

## Modalità di esecuzione

- `mode: build-only` (predefinito): compila Android con chiave debug e iOS per simulatore senza firma, senza configurazione pubblica API/OIDC, senza usare le credenziali di firma e senza autenticazione/upload Firebase, Play o TestFlight. Gli artifact Android dimostrativi con firma debug restano disponibili in GitHub Actions per sette giorni. Non è una prova di installazione fisica.
- `mode: distribute`: solo scelta esplicita, dopo CI verde sullo SHA esatto, verifica di quote/costi e configurazione separata di test. I canali consentiti sono Firebase App Distribution, Play internal e TestFlight. Non utilizzare dati reali. In modalità distribute una piattaforma richiesta senza destinazione di test configurata fallisce prima della compilazione; non viene considerata distribuita una build unsigned. La configurazione Firebase keyless presente deve essere completa; se è configurato Play occorre anche la chiave di caricamento. Scegli build-only per la sola verifica di compilazione. APK/AAB compilati in modalità distribute non vengono pubblicati come artifact GitHub: il repository è pubblico e i pacchetti di distribuzione devono restare nei canali di test autorizzati.
- Tutte le istruzioni di caricamento riportate sotto presuppongono `mode: distribute`; la scelta della sola piattaforma non avvia upload.

## Android con Firebase App Distribution (scelta attuale per le prove)

### Configurazione dal telefono, senza chiavi (consigliata)
Workflow **Firebase bootstrap** (`.github/workflows/firebase-bootstrap.yml`), una sola volta:
1. Viene avviato (da Claude o da Actions → Run workflow) e apre una issue con un link di accesso Google.
2. Il titolare verifica il workflow e la issue dell'esecuzione corrente, apre il link e accede. Salva **solo la chiave pubblica effimera** della issue in `runner-public.pem` su un terminale locale affidabile. Cifra il codice localmente (Bash con OpenSSL), senza inserirlo nella cronologia dei comandi:

   ```bash
   read -rsp 'Codice Google: ' code; printf '\n' >&2
   if encrypted=$(printf '%s' "$code" | openssl pkeyutl -encrypt -pubin -inkey runner-public.pem -pkeyopt rsa_padding_mode:oaep -pkeyopt rsa_oaep_md:sha256 -pkeyopt rsa_mgf1_md:sha256 | openssl base64 -A) && [ -n "$encrypted" ]; then
     printf 'ENC:%s\n' "$encrypted"
   fi
   unset code encrypted
   ```

   Attivare `set -o pipefail` prima del comando. Pubblicare esclusivamente la riga `ENC:` risultante come commento del proprietario. Non pubblicare il codice in chiaro, non inserirlo in chat e non riutilizzare la chiave pubblica di una precedente esecuzione. Se manca un terminale locale affidabile, non usare questa procedura: configurare Firebase con un accesso autorizzato e un canale privato per gli eventuali secret. PKCE non giustifica l'esposizione di codici in chiaro. Non avviare il bootstrap se la creazione di risorse o il costo non sono stati verificati.
3. Il runner esegue `deploy/firebase/bootstrap.sh`: progetto Google Cloud `ape-italia-*` (riusato se esiste), Firebase, API necessarie, app Android `it.apeitalia.app`, gruppo tester `interni` con l'account del titolare, account di servizio con il solo ruolo *Firebase App Distribution Admin* e **Workload Identity Federation** che accetta solo token OIDC di questo repository. Nessuna chiave viene creata o salvata.
4. Il workflow tenta di revocare le credenziali temporanee e pulire il runner; se la revoca non è confermata, verificarla nell'account Google.  gli identificativi (non segreti) sono pubblicati nella issue e salvati in `deploy/firebase/config.json`, letto da "Mobile release".

### Alternativa con chiave di account di servizio
Il workflow compila un APK di rilascio e, se trova il secret `FIREBASE_SERVICE_ACCOUNT_JSON`, richiede un'app Android di test già registrata (`it.apeitalia.app`) nel progetto Firebase della chiave e una lista tester privata. Non registra nuove app né crea risorse Firebase durante il rilascio.

Passi una tantum del titolare (fattibili anche da browser del telefono, in modalità desktop):
1. **console.firebase.google.com** → apri o crea il progetto (es. "APE Italia") → menu **Release & Monitor → App Distribution → Inizia**.
2. **Impostazioni progetto → Account di servizio → Genera nuova chiave privata** (scarica un JSON).
3. **console.cloud.google.com → IAM e amministrazione → IAM** (stesso progetto) → modifica l'account `firebase-adminsdk-…` → aggiungi i ruoli **Amministratore Firebase** e **Amministratore Firebase App Distribution**.
4. **GitHub → Settings → Secrets and variables → Actions**:
   - *Secrets* → `FIREBASE_SERVICE_ACCOUNT_JSON` = intero contenuto del JSON;
   - *Secrets* → `FIREBASE_TESTERS` = email dei tester separate da virgola (es. la tua); non usare una variabile pubblica. Registrare prima l'app Android di test in Firebase, con package `it.apeitalia.app`: il workflow non crea app.
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

5. Dopo il primo caricamento: **TestFlight → Test interni** → aggiungi te stesso; installa l'app **TestFlight** sull'iPhone e accetta l'invito. La cifratura locale XChaCha20-Poly1305 usa `@noble/ciphers`, non esclusivamente le API crittografiche del sistema Apple. Non presumere l'esenzione: il flag `ITSAppUsesNonExemptEncryption` non è più impostato automaticamente. Prima della distribuzione TestFlight verificare il questionario e l'eventuale documentazione richiesta in App Store Connect, incluse le regole per la Francia se pertinente. Riferimenti: https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance e https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption/. Il titolare o un ruolo autorizzato deve convalidare la dichiarazione; non dichiarare esenzioni non verificate.

## 2. Google Play (test interno) — una tantum
1. **Chiave di caricamento** (una volta, conservala con cura insieme alle password; con Play App Signing, se persa, si può chiedere il reset a Google):
   ```
   keytool -genkeypair -v -keystore ape-italia-upload.jks -alias upload -keyalg RSA -keysize 4096 -validity 10000
   ```
   (`keytool` è incluso in qualsiasi JDK; su Windows anche in Android Studio).
2. Secret su GitHub: `ANDROID_KEYSTORE_BASE64` (file `.jks` in base64, come sopra), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`upload`), `ANDROID_KEY_PASSWORD`.
3. **Play Console → Crea app** ("APE Italia", app, gratuita). Compila il primo AAB firmato in un ambiente di compilazione privato e autorizzato (senza pubblicarlo negli artifact GitHub) e **caricalo a mano la prima volta** in **Test → Test interno → Crea nuova release** (Google non consente il caricamento via API su un'app che non ha mai ricevuto un pacchetto). Accetta **Play App Signing**. Aggiungi i tester (la tua email) e apri il link di adesione dal telefono Android.
4. **Account di servizio per i caricamenti successivi**: Google Cloud Console → crea un service account e una chiave JSON; Play Console → **Utenti e autorizzazioni → Invita** l'email del service account con permesso di rilascio per l'app. Secret: `PLAY_SERVICE_ACCOUNT_JSON` (contenuto del JSON).
5. Dalle esecuzioni successive il workflow carica da solo sul canale **internal**. Se Play rifiuta perché l'app non ha ancora una release pubblicata, rilancia con `play_status = draft` e conferma la release dalla console.

## 3. Configurazione dell'app (obbligatoria per la distribuzione connessa di test)
La modalità build-only resta dimostrativa, senza login né invio. La modalità distribute richiede un ambiente staging separato: **Settings → Secrets and variables → Actions → Variables**: `EXPO_PUBLIC_API_BASE_URL`, `EXPO_PUBLIC_OIDC_ISSUER`, `EXPO_PUBLIC_OIDC_CLIENT_ID` (es. `ape-mobile` del realm Keycloak), `EXPO_PUBLIC_OIDC_AUDIENCE` (`ape-italia-api`). Non sono segreti: finiscono nell'app. Impostare inoltre la variabile di repository `STAGING_PUBLIC_API_URL` uguale all'origine HTTPS di staging verificata nel relativo ambiente di deploy, con etichetta DNS staging. Se si usa OIDC, impostare `STAGING_PUBLIC_OIDC_ISSUER` uguale all'issuer HTTPS di staging, con etichetta DNS staging e realm dedicato; client ID e audience sono obbligatori. Le due piattaforme rifiutano configurazioni mancanti, discordanti o non di staging prima del prebuild. Il controllo sintattico non dimostra che i servizi dietro tali DNS siano isolati: verificare separatamente TLS, database, identità, pagamenti test e SHA servito. Nessun dato reale.

## Sicurezza
I secret non sono mai stampati nei log; la chiave `.p8` viene scritta solo in una cartella temporanea del runner e cancellata a fine job; il workflow ha permessi `contents: read`. Non committare mai `.p8`, `.jks` o JSON di service account (la scansione segreti in CI li blocca).

**Preflight di distribuzione connessa:** prima di prebuild e firma entrambi i job richiedono anche `/health` via HTTPS senza redirect, HTTP 200 e la revisione API completa uguale allo SHA del workflow. Distribuire prima il candidato su staging con il relativo workflow dopo CI push verde. Il controllo non sostituisce gli smoke test su dati sintetici, l'isolamento dei servizi e il controllo delle quote. Build-only non contatta lo staging.

## Verifica interna TestFlight sullo SHA esatto

Dopo Mobile release in modalità distribute e upload iOS effettivamente riuscito, avviare **TestFlight internal testers** su main indicando il run ID di Mobile release. Il controllo richiede lo SHA esatto e lo step di upload iOS riuscito, quindi consulta il numero build corrispondente in sola lettura. Non si avvia dopo build-only o Android-only. Configurare gruppo Interni e titolare in App Store Connect; nessuna dichiarazione automatica di esenzione crittografica, modifica di gruppi o invito. Se il flag di cifratura non è false, la verifica è manuale; non implica che una build non esente sia inammissibile. Il titolare deve verificare la correttezza della dichiarazione Apple. Stato VALID e appartenenza al gruppo non dimostrano installazione fisica. Un vecchio workflow tester non prova una nuova build.


**Evidenza Android e privacy dei log:** il comando Firebase in entrambe le modalità non stampa output CLI nel log pubblico (anche in caso di errore); un codice non-zero interrompe il job con messaggio generico. Verificare eventuali dettagli soltanto nella console Firebase autorizzata. La modalità service account richiede un'app già registrata e una lista tester non vuota nel secret `FIREBASE_TESTERS`. Il successo del comando o dell'upload Play internal non prova che il pacchetto sia installabile da un tester: controllare numero di build, note di rilascio con SHA, gruppo/track e stato effettivo nella console prima di dichiarare la distribuzione disponibile. Una release Play draft non è disponibile ai tester finché non viene resa tale tramite la console.
