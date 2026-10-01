#!/bin/bash
# VardiyaOS Database Backup Script
# Usage: ./scripts/backup-db.sh [output_dir]
# Cron: 0 3 * * * /path/to/scripts/backup-db.sh /backups/vardiya 2>>/backups/vardiya/backup-cron.log

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
BACKUP_DIR="${1:-/backups/vardiya}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${POSTGRES_USER:-vardiya}"
DB_PASS="${POSTGRES_PASSWORD:-}"
DB_NAME="${POSTGRES_DB:-vardiyasystem}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/vardiyasystem_${TIMESTAMP}.sql.gz"
LATEST_LINK="${BACKUP_DIR}/latest.sql.gz"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Export password for pg_dump
export PGPASSWORD="$DB_PASS"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting backup: $DB_NAME@$DB_HOST:$DB_PORT"

# Perform backup
pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --no-owner \
  --no-acl \
  --format=custom \
  --compress=9 \
  --file="${BACKUP_FILE%.gz}" \
  2>>"${BACKUP_DIR}/backup.log"

if [ $? -eq 0 ]; then
  # Compress
  gzip -f "${BACKUP_FILE%.gz}"

  # Create latest symlink
  ln -sf "$BACKUP_FILE" "$LATEST_LINK"

  # Remove old backups
  find "$BACKUP_DIR" -name "vardiyasystem_*.sql.gz" -type f -mtime +$RETENTION_DAYS -delete

  # Get file size
  FILE_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)

  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup completed: $BACKUP_FILE ($FILE_SIZE)"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Old backups older than $RETENTION_DAYS days removed"

  # Test backup integrity (pg_restore cannot read gzip-wrapped archives directly)
  if command -v pg_restore &> /dev/null; then
    TMP_ARCHIVE="$(mktemp)"
    if gzip -dc "$BACKUP_FILE" > "$TMP_ARCHIVE" 2>/dev/null && pg_restore --list "$TMP_ARCHIVE" > /dev/null 2>&1; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup integrity check: PASSED"
    else
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup integrity check: FAILED" >&2
    fi
    rm -f "$TMP_ARCHIVE"
  fi
else
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup FAILED" >&2
  rm -f "${BACKUP_FILE%.gz}"
  exit 1
fi

# Cleanup
unset PGPASSWORD
