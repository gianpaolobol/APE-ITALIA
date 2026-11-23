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
