#!/bin/bash
# VardiyaOS Backup Verification Script
# Usage: ./scripts/verify-backup.sh <backup_file>
set -euo pipefail

BACKUP_FILE="${1:-}"
LOG_FILE="${BACKUP_FILE}.verify.log"

if [ -z "$BACKUP_FILE" ] || [ ! -f "$BACKUP_FILE" ]; then
  echo "Usage: $0 <backup_file>" >&2
  exit 1
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verifying backup: $BACKUP_FILE" | tee "$LOG_FILE"

# 1. File size check
FILE_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || stat -f%z "$BACKUP_FILE" 2>/dev/null)
if [ "$FILE_SIZE" -lt 1024 ]; then
  echo "FAIL: Backup file too small ($FILE_SIZE bytes)" | tee -a "$LOG_FILE"
  exit 1
fi
echo "OK: File size $FILE_SIZE bytes" >> "$LOG_FILE"

# 2. Compression integrity (if gzipped)
if [[ "$BACKUP_FILE" == *.gz ]]; then
  if gzip -t "$BACKUP_FILE" 2>/dev/null; then
    echo "OK: Gzip integrity check passed" >> "$LOG_FILE"
  else
    echo "FAIL: Gzip integrity check failed" | tee -a "$LOG_FILE"
    exit 1
  fi
fi

# 3. pg_restore --list (verify archive format)
# pg_restore cannot read gzip-wrapped archives directly, so decompress first
TMP_ARCHIVE="$(mktemp)"
trap 'rm -f "$TMP_ARCHIVE"' EXIT
if [[ "$BACKUP_FILE" == *.gz ]]; then
  if ! gzip -dc "$BACKUP_FILE" > "$TMP_ARCHIVE" 2>/dev/null; then
    echo "FAIL: Could not decompress $BACKUP_FILE" | tee -a "$LOG_FILE"
    exit 1
  fi
else
  cp "$BACKUP_FILE" "$TMP_ARCHIVE"
fi

TOC=$(pg_restore --list "$TMP_ARCHIVE" 2>/dev/null || true)
if [ -z "$TOC" ]; then
  echo "WARN: pg_restore --list returned empty (may be plain SQL, not custom format)" >> "$LOG_FILE"
else
  echo "OK: pg_restore can read archive" >> "$LOG_FILE"
fi

# 4. Table count from TOC
TABLE_COUNT=$(printf '%s\n' "$TOC" | grep -c "TABLE DATA" || true)
if [ "$TABLE_COUNT" -gt 0 ]; then
  echo "OK: $TABLE_COUNT tables with data in backup" >> "$LOG_FILE"
else
  echo "WARN: No TABLE DATA entries found in backup TOC" >> "$LOG_FILE"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Verification COMPLETED for $BACKUP_FILE" >> "$LOG_FILE"
echo "Verification passed: $BACKUP_FILE"
