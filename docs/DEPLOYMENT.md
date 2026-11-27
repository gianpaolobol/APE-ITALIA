# Distribuzione pilota / staging (container)

Immagini:
- `services/api/Dockerfile` → target `runtime`, immagine `ape-italia-api`: API (`node dist/main.js`) e worker (`node dist/worker.js`), dipendenze di produzione dal lockfile e client Prisma generato dal medesimo build; utente non root, healthcheck su `/health`.
- Lo stesso Dockerfile ha target `migration`, immagine `ape-italia-migrate`, con Prisma CLI per il solo job di migrazione. Avvio con Compose completo e `--build` per costruire entrambi i target; nessuna installazione dinamica mediante npx durante il deploy.
- `apps/web/Dockerfile` → `ape-italia-web`: Next.js in modalità `standalone`, utente non root.

Stack: `deploy/docker-compose.staging.yml` — PostgreSQL 16, migrazione one-shot (gli altri servizi partono solo se termina con successo), API, worker, web. Porte esposte solo su `127.0.0.1`: **serve un reverse proxy con HTTPS** (es. Caddy, Nginx, Traefik) davanti ad API e web; `TRUST_PROXY=1` per vedere l'IP reale nei limiti di frequenza.

```
cp deploy/.env.example deploy/.env      # compilare: password DB, chiavi, OIDC, URL pubblici
docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env exec api node dist/admin/provision-cli.js create-organization --name "..." --owner-subject "..." --operator "..."
```

Senza OIDC configurato l'API risponde 401 e il portale 503 (fail closed). Il volume `evidence` contiene solo file cifrati, ma la chiave `EVIDENCE_ENCRYPTION_KEY` va custodita fuori dal server (secret manager) e con copia di sicurezza: senza di essa i file sono illeggibili.

**Verifica automatica**: il job CI `containers` costruisce le immagini, avvia lo stack con segreti sintetici e controlla `/health` 200, `/v1/me` 401, portale 200, login 503, migrazione terminata con 0, worker attivo, API non eseguita come root.

**Non coperto su host reale**: backup/restore (provato in CI con dati sintetici), monitoraggio, scelta dell'hosting, dominio e certificati.

## Backup e ripristino
```
deploy/backup.sh /percorso/backup          # stampa lo STAMP: dump PostgreSQL (formato custom) + tar del volume evidenze + SHA256SUMS
deploy/restore.sh /percorso/backup STAMP --yes   # verifica gli hash, ferma api/worker/web, ripristina DB e file, riavvia
```
- I file delle evidenze sono già cifrati; il dump del database **non** lo è: conservare i backup cifrati e fuori dal server (es. `age`/`gpg` + storage esterno). Le chiavi (`EVIDENCE_ENCRYPTION_KEY`, `WEB_SESSION_KEY`) non sono nel backup e vanno custodite separatamente: senza la chiave delle evidenze il ripristino dei file è inutile.
- Il ripristino è distruttivo e richiede `--yes`.
- **Provato in CI** a ogni esecuzione: dati sintetici → backup → `down -v` (volumi distrutti) → stack vuoto → ripristino senza `--yes` rifiutato → ripristino → organizzazione, eventi di audit e file presenti, API operativa.
- Da definire: frequenza (es. giornaliera), conservazione dei backup, prova periodica di ripristino su un host separato, RPO/RTO.

## Antivirus
Il compose include `clamav/clamav:stable` (scarica le firme all'avvio: alcuni minuti). API e worker usano `CLAMAV_HOST=clamav`. Se ClamAV non risponde, gli upload vengono rifiutati (503) invece di salvare file non controllati.

## Messa online del server di prova (staging) da GitHub Actions

1. **VM in UE** (es. 2 vCPU, 4 GB RAM, 80 GB disco) con Ubuntu, Docker e il plugin compose installati; utente con accesso SSH a chiave.
2. **DNS:** record A del dominio dell'API (es. `api-staging.example.it`) verso l'IP della VM. Porte 80 e 443 aperte.
3. **Environment GitHub `staging`** (Settings → Environments): configurare solo main, eventuale approvazione, segreti e variabili dedicati; non riutilizzare segreti di repository o produzione.
   - `DEPLOY_HOST` (DNS o IPv4), `DEPLOY_USER` (non root), `DEPLOY_SSH_KEY` (chiave privata della VM);
   - `DEPLOY_SSH_KNOWN_HOSTS`: riga known_hosts con chiave pubblica host verificata indipendentemente, non acquisita alla cieca dalla rete;
   - `DEPLOY_ENV_FILE`: il contenuto di `deploy/.env` compilato a partire da `deploy/.env.example` (password, chiavi casuali, `API_DOMAIN`, `PUBLIC_API_URL`, `PLATFORM_JWT_SECRET`, Brevo, eventualmente Anthropic e Stripe).
   - variabile `STAGING_PUBLIC_API_URL`: origine HTTPS senza path, porta o slash finale, con etichetta DNS staging; `PUBLIC_API_URL` e `API_DOMAIN` nel dotenv devono coincidere, ciascuno in una sola riga letterale. `DEPLOY_PATH` opzionale (default `/opt/ape-italia-staging`, solo percorsi sotto `/opt`); se esiste uno staging precedente, verificare percorso e volumi prima di procedere, senza migrazioni implicite.
4. **Avvio:** Actions → "Deploy staging server" → Run workflow su `main` corrente: richiede CI push verde sullo SHA esatto e tutti e quattro i job superati. Non usare credenziali o server di produzione. Il job aggiorna il codice sulla VM, scrive `.env`, avvia lo stack (Postgres, ClamAV, migrazioni, API, worker, web, Caddy con certificato TLS automatico) e richiede HTTP 200 su `/health` via HTTPS con certificato valido, senza redirect e senza saltare il controllo. Il build riceve lo SHA esatto dal workflow e lo incorpora nell’immagine API. Il controllo HTTPS richiede inoltre JSON con status ok, servizio atteso e revisione identica allo SHA; un proxy che serve un’immagine precedente non supera il gate. Non è un'attestazione crittografica o una verifica di web/worker/database: svolgere smoke test funzionali separati. Verificare che host, DNS, database e fornitori siano esclusivamente di staging (Stripe test, nessuna email reale senza autorizzazione).
5. **App:** imposta la variabile di repository `EXPO_PUBLIC_API_BASE_URL=https://api.…` e rilancia "Mobile release": la nuova build usa il server (login con codice email, invio vero, area certificatori).
6. **Certificatori:** approva le candidature dopo il controllo sull'elenco SACE:
   `docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env exec api node dist/admin/provision-cli.js approve-application --id <id> --operator <tuo-id>`
7. **Stripe:** webhook verso `https://api.…/v1/payments/webhook` per l'evento `checkout.session.completed`; il segreto di firma va in `STRIPE_WEBHOOK_SECRET`.

## Portale web HTTPS separato (gate di staging)
Il reverse proxy Caddy serve anche Next.js sulla seconda origine, distinta dall'API. Prima del deploy configurare il DNS del portale verso la VM esistente, senza acquistare nuovi servizi, e impostare nell'environment staging `STAGING_PUBLIC_WEB_URL` (es. `https://web-staging.example.test`, esempio non operativo). Nel dotenv impostare `WEB_DOMAIN=web-staging.example.test`, `WEB_BASE_URL` uguale all'origine web e `API_BASE_URL` uguale all'origine API già verificata. I due host devono essere distinti e avere etichetta staging. Registrare l'esatto callback OIDC `<WEB_BASE_URL>/auth/callback` nel client web di staging; verificare separatamente issuer, MFA e isolamento. Il fallback HTTP localhost:8080 esiste esclusivamente nel container per CI sintetica e non è esposto dall'host. Il deploy reale rifiuta configurazioni mancanti, non di staging o discordanti. Dopo il gate API sullo SHA esatto il workflow controlla risposta HTTPS 200 del portale e marker della landing page, senza redirect o bypass TLS. Questo prova l'instradamento web, non lo SHA servito da Next.js, né login reale, autorizzazioni o collaudo integrato: questi restano prove separate obbligatorie.
