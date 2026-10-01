#!/bin/bash
# VardiyaOS Startup Health Verification
set -euo pipefail

API_URL="${API_URL:-http://localhost:3000}"
TIMEOUT_SEC="${TIMEOUT_SEC:-120}"
INTERVAL_SEC="${INTERVAL_SEC:-5}"
LOG_FILE="/var/log/vardiya/startup-verify.log"

mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || true

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

log "Starting health verification against $API_URL (timeout: ${TIMEOUT_SEC}s)"

START_TIME=$(date +%s)
while true; do
  NOW=$(date +%s)
  ELAPSED=$((NOW - START_TIME))
  if [ "$ELAPSED" -ge "$TIMEOUT_SEC" ]; then
    log "FAIL: Timeout reached before all services became healthy"
    exit 1
  fi

  # Check liveness
  LIVE=$(curl -sf "$API_URL/api/v1/health/live" 2>/dev/null || echo "")
  if [ -z "$LIVE" ]; then
    log "WAIT: Liveness check not ready yet (${ELAPSED}s)"
    sleep "$INTERVAL_SEC"
    continue
  fi

  # Check readiness
  READY=$(curl -sf "$API_URL/api/v1/health/ready" 2>/dev/null || echo "")
  if echo "$READY" | grep -q '"status":"ok"'; then
    log "PASS: Readiness check passed"
    break
  elif echo "$READY" | grep -q '"status":"degraded"'; then
    log "WARN: Readiness check shows degraded state"
    break
  else
    log "WAIT: Readiness check not ready yet (${ELAPSED}s)"
    sleep "$INTERVAL_SEC"
    continue
  fi
done

# Full health check
log "Fetching full health report..."
curl -s "$API_URL/api/v1/health" | python3 -m json.tool 2>/dev/null >> "$LOG_FILE" || \
  curl -s "$API_URL/api/v1/health" >> "$LOG_FILE"

log "Startup verification COMPLETED"
exit 0
