# Distribuzione pilota / staging (container)

Immagini:
- `services/api/Dockerfile` → `ape-italia-api`: API (`node dist/main.js`), worker (`node dist/worker.js`) e job di migrazione (`npx prisma migrate deploy`) dalla stessa immagine; utente non root, healthcheck su `/health`.
- `apps/web/Dockerfile` → `ape-italia-web`: Next.js in modalità `standalone`, utente non root.

Stack: `deploy/docker-compose.staging.yml` — PostgreSQL 16, migrazione one-shot (gli altri servizi partono solo se termina con successo), API, worker, web. Porte esposte solo su `127.0.0.1`: **serve un reverse proxy con HTTPS** (es. Caddy, Nginx, Traefik) davanti ad API e web; `TRUST_PROXY=1` per vedere l'IP reale nei limiti di frequenza.

```
cp deploy/.env.example deploy/.env      # compilare: password DB, chiavi, OIDC, URL pubblici
docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env up -d --build
docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env exec api node dist/admin/provision-cli.js create-organization --name "..." --owner-subject "..." --operator "..."
```

Senza OIDC configurato l'API risponde 401 e il portale 503 (fail closed). Il volume `evidence` contiene solo file cifrati, ma la chiave `EVIDENCE_ENCRYPTION_KEY` va custodita fuori dal server (secret manager) e con copia di sicurezza: senza di essa i file sono illeggibili.

**Verifica automatica**: il job CI `containers` costruisce le immagini, avvia lo stack con segreti sintetici e controlla `/health` 200, `/v1/me` 401, portale 200, login 503, migrazione terminata con 0, worker attivo, API non eseguita come root.

**Non coperto**: backup/restore di database e volume (da pianificare e provare), monitoraggio, scelta dell'hosting, dominio e certificati.

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
2. **DNS:** record A del dominio dell'API (es. `api.apeitalia.it`) verso l'IP della VM. Porte 80 e 443 aperte.
3. **Segreti GitHub** (Settings → Secrets → Actions):
   - `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chiave privata della VM);
   - `DEPLOY_ENV_FILE`: il contenuto di `deploy/.env` compilato a partire da `deploy/.env.example` (password, chiavi casuali, `API_DOMAIN`, `PUBLIC_API_URL`, `PLATFORM_JWT_SECRET`, Brevo, eventualmente Anthropic e Stripe).
4. **Avvio:** Actions → "Deploy staging server" → Run workflow. Il job aggiorna il codice sulla VM, scrive `.env`, avvia lo stack (Postgres, ClamAV, migrazioni, API, worker, web, Caddy con certificato TLS automatico) e controlla `/health`.
5. **App:** imposta la variabile di repository `EXPO_PUBLIC_API_BASE_URL=https://api.…` e rilancia "Mobile release": la nuova build usa il server (login con codice email, invio vero, area certificatori).
6. **Certificatori:** approva le candidature dopo il controllo sull'elenco SACE:
   `docker compose -f deploy/docker-compose.staging.yml --env-file deploy/.env exec api node dist/admin/provision-cli.js approve-application --id <id> --operator <tuo-id>`
7. **Stripe:** webhook verso `https://api.…/v1/payments/webhook` per l'evento `checkout.session.completed`; il segreto di firma va in `STRIPE_WEBHOOK_SECRET`.
