#!/bin/bash
# VardiyaOS Database Restore Script
# Usage: ./scripts/restore-db.sh <backup_file> [output_dir]
# Example: ./scripts/restore-db.sh /backups/vardiya/vardiyasystem_20250101_030000.sql.gz

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$PROJECT_ROOT/.env" ]; then
  set -a
  source "$PROJECT_ROOT/.env"
  set +a
fi

# Configuration
BACKUP_FILE="${1:-}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${POSTGRES_USER:-vardiya}"
DB_PASS="${POSTGRES_PASSWORD:-}"
DB_NAME="${POSTGRES_DB:-vardiyasystem}"

if [ -z "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file> [output_dir]" >&2
  echo "Example: $0 /backups/vardiya/vardiyasystem_20250101_030000.sql.gz" >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

export PGPASSWORD="$DB_PASS"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting restore: $DB_NAME@$DB_HOST:$DB_PORT from $BACKUP_FILE"

# Confirm unless -f/--force is passed
if [ "${2:-}" != "--force" ] && [ "${2:-}" != "-f" ]; then
  echo "WARNING: This will OVERWRITE the database '$DB_NAME' on $DB_HOST:$DB_PORT"
  echo "Press Ctrl+C to abort, or wait 5 seconds to continue..."
  sleep 5
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dropping existing connections to $DB_NAME..."

# Terminate existing connections
PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "SELECT pg_terminate_backend(pg_stat_activity.pid)
   FROM pg_stat_activity
   WHERE pg_stat_activity.datname = '$DB_NAME'
     AND pid <> pg_backend_pid();" 2>/dev/null || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Dropping and recreating database..."

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "DROP DATABASE IF EXISTS \"$DB_NAME\";" 2>>"${BACKUP_FILE}.restore.log"

PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c \
  "CREATE DATABASE \"$DB_NAME\";" 2>>"${BACKUP_FILE}.restore.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restoring from backup..."

# Decompress and restore
if [[ "$BACKUP_FILE" == *.gz ]]; then
  gunzip -c "$BACKUP_FILE" | pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-acl \
    --verbose \
    2>>"${BACKUP_FILE}.restore.log"
else
  pg_restore \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --no-owner \
    --no-acl \
    --verbose \
    "$BACKUP_FILE" \
    2>>"${BACKUP_FILE}.restore.log"
fi

if [ $? -eq 0 ]; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore COMPLETED: $BACKUP_FILE"
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore FAILED — check ${BACKUP_FILE}.restore.log" >&2
  exit 1
fi

# Cleanup
unset PGPASSWORD
