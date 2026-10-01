#!/usr/bin/env bash
# VardiyaOS production rollback.
#
# Rolls the Docker Compose production stack back to a known-good image tag and
# verifies the result. The contract is documented in docs/devops/rollback.md;
# this script is the executable form of the "Full Rollback Script" section.
#
#   scripts/rollback.sh <target-tag> [--yes] [--dry-run]
#
# Notes on correctness, because the procedure is destructive:
#   * Images are addressed through BACKEND_IMAGE / FRONTEND_IMAGE, which is what
#     docker-compose.prod.yml consumes. A bare :latest is never used: the compose
#     file rejects an unpinned reference, and a mutable tag cannot be audited.
#   * The images currently running are recorded before anything is changed, so a
#     failed rollback can be reversed with the printed command.
#   * Verification waits for readiness, not just liveness, because readiness is
#     what asserts the database and Redis.

set -euo pipefail

COMPOSE_FILE="docker-compose.prod.yml"
REGISTRY="${REGISTRY:-ghcr.io/anomalyco/vardiyasystem}"
BACKEND_URL="http://127.0.0.1:3000"
FRONTEND_URL="http://127.0.0.1"
READY_ATTEMPTS="${READY_ATTEMPTS:-30}"
READY_INTERVAL="${READY_INTERVAL:-5}"

ASSUME_YES=0
DRY_RUN=0
TARGET=""

log() { printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"; }
fail() {
  printf '[%s] ERROR: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: scripts/rollback.sh <target-tag> [--yes] [--dry-run]

  <target-tag>   Image tag of the last known good release, e.g. a1b2c3d4e5f6
                 or v1.0.0. It must exist for both backend and frontend.

  --yes          Do not prompt for confirmation.
  --dry-run      Print the plan and exit without touching any container.

Environment:
  REGISTRY       Image registry prefix (default ghcr.io/anomalyco/vardiyasystem)
  READY_ATTEMPTS How many times to poll readiness (default 30)
  READY_INTERVAL Seconds between readiness polls (default 5)
USAGE
}

while [ $# -gt 0 ]; do
  case "$1" in
    --yes|-y) ASSUME_YES=1 ;;
    --dry-run|-n) DRY_RUN=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) fail "unknown option: $1" ;;
    *) TARGET="$1" ;;
  esac
  shift
done

[ -n "$TARGET" ] || { usage; exit 1; }

# Argument validation first: a bad target is a usage error and must not be
# reported as a missing environment file.
case "$TARGET" in
  latest|:latest) fail "refusing to roll back to a mutable tag; pass an immutable tag" ;;
esac

[ -f "$COMPOSE_FILE" ] || fail "$COMPOSE_FILE not found; run this from the repository root"
command -v docker >/dev/null 2>&1 || fail "docker is not available"
docker compose version >/dev/null 2>&1 || fail "docker compose v2 is not available"
[ -f .env ] || fail ".env is missing; compose cannot resolve its variables"

BACKEND_IMAGE="$REGISTRY/backend:$TARGET"
FRONTEND_IMAGE="$REGISTRY/frontend:$TARGET"

log "Rollback target"
log "  backend : $BACKEND_IMAGE"
log "  frontend: $FRONTEND_IMAGE"

if [ "$DRY_RUN" -eq 1 ]; then
  log "Dry run: would pull both images, then recreate backend and frontend."
  log "Dry run complete, nothing changed."
  exit 0
fi

CURRENT_BACKEND="$(docker inspect --format '{{.Config.Image}}' vardiya-backend 2>/dev/null || echo '<not running>')"
CURRENT_FRONTEND="$(docker inspect --format '{{.Config.Image}}' vardiya-frontend 2>/dev/null || echo '<not running>')"
log "Currently running"
log "  backend : $CURRENT_BACKEND"
log "  frontend: $CURRENT_FRONTEND"
if [ "$CURRENT_BACKEND" != "<not running>" ]; then
  log "To reverse this rollback later:"
  log "  BACKEND_IMAGE=$CURRENT_BACKEND FRONTEND_IMAGE=$CURRENT_FRONTEND \\"
  log "    docker compose -f $COMPOSE_FILE up -d backend frontend"
fi

if [ "$ASSUME_YES" -ne 1 ]; then
  printf 'Roll back production to %s? [y/N] ' "$TARGET"
  read -r answer
  case "$answer" in
    y|Y|yes|YES) ;;
    *) log "Aborted by operator."; exit 1 ;;
  esac
fi

log "Pulling target images"
docker pull "$BACKEND_IMAGE"
docker pull "$FRONTEND_IMAGE"

log "Recreating backend and frontend on $TARGET"
BACKEND_IMAGE="$BACKEND_IMAGE" FRONTEND_IMAGE="$FRONTEND_IMAGE" \
  docker compose -f "$COMPOSE_FILE" up -d --no-deps --force-recreate backend frontend

log "Waiting for backend readiness (${READY_ATTEMPTS} attempts)"
ready=0
for attempt in $(seq 1 "$READY_ATTEMPTS"); do
  if curl -sf "$BACKEND_URL/api/v1/health/live" >/dev/null 2>&1; then
    log "  liveness ok on attempt $attempt"
    if curl -sf "$BACKEND_URL/api/v1/health/ready" >/dev/null 2>&1; then
      ready=1
      log "  readiness ok on attempt $attempt"
      break
    fi
  fi
  log "  waiting for backend... ($attempt/$READY_ATTEMPTS)"
  sleep "$READY_INTERVAL"
done

if [ "$ready" -ne 1 ]; then
  log "Rollback did not reach a ready state. Diagnostics:"
  docker compose -f "$COMPOSE_FILE" ps -a || true
  docker compose -f "$COMPOSE_FILE" logs --tail=200 backend || true
  log "Rollback FAILED. Reverse it with the command printed above, or roll forward."
  exit 1
fi

log "Verifying the front door"
if curl -sf "$FRONTEND_URL/health" | grep -q 'ok'; then
  log "  frontend /health ok"
else
  log "  WARNING: frontend /health did not answer as expected"
fi
if curl -sf "$FRONTEND_URL/" | grep -qi '<html'; then
  log "  SPA served at /"
else
  log "  WARNING: frontend did not serve the application shell"
fi

log "Rolled back to $TARGET. Confirm the version, then record the incident:"
log "  curl -s $BACKEND_URL/api/v1/health/ready"
