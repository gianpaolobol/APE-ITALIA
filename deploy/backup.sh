#!/usr/bin/env bash
# Consistent backup of the staging stack: PostgreSQL logical dump + encrypted evidence volume.
# Usage: deploy/backup.sh <output-dir>   (run on the host, stack up). The evidence files are already
# AES-256-GCM encrypted; the dump is NOT: store backups encrypted and off-host. Keys are never included.
set -euo pipefail
OUT="${1:?output directory required}"
COMPOSE=(docker compose -f "$(dirname "$0")/docker-compose.staging.yml" --env-file "$(dirname "$0")/.env")
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT"
umask 077
"${COMPOSE[@]}" exec -T postgres pg_dump -U ape -d ape_italia --format=custom --no-owner > "$OUT/db-$STAMP.dump"
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh api -c 'tar -C /var/lib/ape-italia -cf - evidence' > "$OUT/evidence-$STAMP.tar"
( cd "$OUT" && sha256sum "db-$STAMP.dump" "evidence-$STAMP.tar" > "SHA256SUMS-$STAMP" )
echo "$STAMP"
