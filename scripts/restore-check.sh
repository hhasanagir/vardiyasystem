#!/usr/bin/env bash
# VardiyaOS backup → restore round-trip check.
#
# Restores a custom-format PostgreSQL dump into a scratch postgres:15-alpine
# container — the exact image the shipped stack runs — verifies the Prisma
# migration ledger and the restored schema, then tears the container down. The
# production database is never touched. This is how the restore path is proven
# on every release instead of being trusted from a runbook.
#
# Usage: scripts/restore-check.sh <backup_file>
#
# The deploy workflow produces the file with:
#   docker compose -f docker-compose.prod.yml exec -T postgres \
#     pg_dump --username=vardiya --dbname=vardiyasystem \
#     --format=custom --compress=9 --no-owner --no-acl > backup.dump.gz

set -euo pipefail

CONTAINER_NAME="vardiya-restore-check"
BACKUP_FILE="${1:-}"

fail() { echo "[restore-check] FAIL: $*" >&2; exit 1; }

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>" >&2
  echo "Example: $0 /tmp/vardiya-restore-check.dump.gz" >&2
  exit 1
fi

# The scratch listener sits on 5433 so it can never collide with a real
# postgres that already occupies 5432.
SCRATCH_PORT="${RESTORE_CHECK_PORT:-5433}"
PG_IMAGE="${RESTORE_CHECK_IMAGE:-postgres:15-alpine}"
RESTORE_LOG="$(mktemp)"
restore_log() { cat "$RESTORE_LOG" >&2 || true; }

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -f "$RESTORE_LOG"
}
trap cleanup EXIT

if ! command -v docker >/dev/null 2>&1; then
  echo "FAIL: docker is required for the restore round-trip check." >&2
  exit 1
fi

echo "[restore-check] scratch PG image: $PG_IMAGE (port $SCRATCH_PORT)"
docker run -d --rm \
  --name "$CONTAINER_NAME" \
  -e POSTGRES_USER=vardiya \
  -e POSTGRES_PASSWORD=restore-check \
  -e POSTGRES_DB=vardiyasystem \
  -p "127.0.0.1:$SCRATCH_PORT:5432" \
  "$PG_IMAGE" >/dev/null

ready=0
for i in $(seq 1 60); do
  if docker exec "$CONTAINER_NAME" pg_isready -U vardiya -d vardiyasystem >/dev/null 2>&1; then
    # The official entrypoint boots a *temporary* server (unix socket only) to
    # run the init scripts, then shuts it down and starts the real server.
    # pg_isready answers during that window, so a single success can be against
    # a server that is about to close its connections — the race behind the
    # flaky `pg_restore: connection ... server closed the connection
    # unexpectedly` (D36). Require the connection to survive a settle window.
    sleep 2
    if docker exec "$CONTAINER_NAME" pg_isready -U vardiya -d vardiyasystem >/dev/null 2>&1; then
      ready=1
      break
    fi
  fi
  sleep 1
done
[ "$ready" -eq 1 ] || fail "scratch postgres never became ready"
echo "[restore-check] scratch postgres ready"

docker cp "$BACKUP_FILE" "$CONTAINER_NAME:/tmp/backup.gz" >/dev/null

# pg_restore cannot decompress a gzip-wrapped archive on its own; backup-db.sh
# stores custom-format dumps as .sql.gz, so decompress on the wire like
# restore-db.sh does.
if ! docker exec "$CONTAINER_NAME" sh -c \
  "gunzip -c /tmp/backup.gz | pg_restore --exit-on-error --no-owner --no-acl -U vardiya -d vardiyasystem" \
  >"$RESTORE_LOG" 2>&1; then
  restore_log
  fail "pg_restore reported errors (exit non-zero)"
fi
echo "[restore-check] pg_restore completed"

MIGRATIONS="$(docker exec "$CONTAINER_NAME" psql -U vardiya -d vardiyasystem -tAc \
  "SELECT count(*) FROM _prisma_migrations;" 2>/dev/null || true)"
if [ -z "$MIGRATIONS" ] || [ "$MIGRATIONS" -lt 1 ]; then
  fail "migration ledger (_prisma_migrations) has ${MIGRATIONS:-0} rows; expected >= 1"
fi
echo "[restore-check] prisma migration ledger: $MIGRATIONS migrations"

TABLES="$(docker exec "$CONTAINER_NAME" psql -U vardiya -d vardiyasystem -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';")"
echo "[restore-check] public tables restored: $TABLES"

echo "[restore-check] OK: backup restored cleanly into $PG_IMAGE"