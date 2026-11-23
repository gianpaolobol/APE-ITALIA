#!/usr/bin/env bash
# Restores a backup produced by deploy/backup.sh into the staging stack (destructive for current data).
# Usage: deploy/restore.sh <backup-dir> <stamp> --yes
set -euo pipefail
DIR="${1:?backup directory required}"; STAMP="${2:?backup stamp required}"
[ "${3:-}" = "--yes" ] || { echo "Refusing to restore without --yes (this replaces current data)"; exit 2; }
COMPOSE=(docker compose -f "$(dirname "$0")/docker-compose.staging.yml" --env-file "$(dirname "$0")/.env")
( cd "$DIR" && sha256sum -c "SHA256SUMS-$STAMP" )
"${COMPOSE[@]}" stop api worker web
"${COMPOSE[@]}" exec -T postgres pg_restore -U ape -d ape_italia --clean --if-exists --no-owner < "$DIR/db-$STAMP.dump"
"${COMPOSE[@]}" run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /var/lib/ape-italia/evidence/* && tar -C /var/lib/ape-italia -xf -' < "$DIR/evidence-$STAMP.tar"
"${COMPOSE[@]}" up -d api worker web
