#!/usr/bin/env bash
# VardiyaOS release dry run.
#
# Renders and validates every layer of the release chain WITHOUT touching a
# registry or a cluster:
#   1. preflight test suite (proves the preflight gates themselves)
#   2. release preflight (repository release invariants)
#   3. docker-compose config (the production file must resolve)
#   4. kustomize renders (k8s base overlay + sealed secrets)
#   5. helm templates for the production and staging value files
#   6. image parity assertions on the rendered output
#
# Usage:
#   bash scripts/release-dry-run.sh          # local (needs .env + secrets/)
#   bash scripts/release-dry-run.sh --ci     # CI: throwaway env/secrets
#
# Fails closed: every layer must render, and no ghcr.io image in the rendered
# output may point outside the CI-published prefix or at a floating tag.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXPECTED_PREFIX="${EXPECTED_IMAGE_PREFIX:-ghcr.io/anomalyco/vardiyasystem}"
CI_MODE="${1:-}"

cd "$ROOT"

step() { echo; echo "─── $*"; }

require() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "FAIL: '$1' is required for the release dry run." >&2
    exit 1
  fi
}

ENV_FILE="$ROOT/.env"
SECRETS_DIR="$ROOT/secrets"
CLEANUP_TARGETS=()
TMP_DIR="$(mktemp -d)"
cleanup() {
  for target in "${CLEANUP_TARGETS[@]:-}"; do rm -rf "$target"; done
  if [ -n "${RESTORE_ENV:-}" ] && [ -f "$TMP_DIR/env.backup" ]; then
    cp -a "$TMP_DIR/env.backup" "$ENV_FILE"
  fi
  if [ -n "${RESTORE_SECRETS:-}" ] && [ -d "$TMP_DIR/secrets.backup" ]; then
    rm -rf "$SECRETS_DIR"
    mv "$TMP_DIR/secrets.backup" "$SECRETS_DIR"
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

if [ "$CI_MODE" = "--ci" ] || [ "$CI_MODE" = "-c" ]; then
  if [ -f "$ENV_FILE" ]; then
    cp -a "$ENV_FILE" "$TMP_DIR/env.backup"
    RESTORE_ENV=1
  fi
  if [ -e "$SECRETS_DIR" ] || [ -L "$SECRETS_DIR" ]; then
    mkdir -p "$TMP_DIR/secrets.backup"
    cp -a "$SECRETS_DIR/." "$TMP_DIR/secrets.backup/"
    RESTORE_SECRETS=1
  fi
  mkdir -p "$SECRETS_DIR"
  CLEANUP_TARGETS+=("$SECRETS_DIR" "$ENV_FILE")
  cat > "$ENV_FILE" <<'ENVEOF'
BACKEND_IMAGE=ghcr.io/anomalyco/vardiyasystem/backend:dr
FRONTEND_IMAGE=ghcr.io/anomalyco/vardiyasystem/frontend:dr
POSTGRES_USER=vardiya
POSTGRES_DB=vardiyasystem
LOG_LEVEL=info
GRAFANA_ROOT_URL=https://grafana.example.invalid
FRONTEND_URL=https://vardiya.example.invalid
VAPID_PUBLIC_KEY=BJmBEUlEpzbxsHEWjAAFuI-iKEJ171-JUZYmtVYBc-V84pBMyvqLDGtCeW__3I3OjaKYQ7TLpqOTQKuzCHLKNOc
VAPID_PRIVATE_KEY=LCOGiaom9OORU7nWAZoBeNgtFVGdf-bCjRuKBkUE-Iw
ENVEOF
  for f in db_password jwt_access_secret jwt_refresh_secret cookie_secret encryption_master_key grafana_admin_password; do
    printf 'placeholder-not-a-real-secret\n' > "$SECRETS_DIR/${f}.txt"
  done
  printf 'https://hooks.slack.invalid/services/placeholder\n' > "$SECRETS_DIR/slack_webhook.txt"
  echo "CI mode: throwaway env/secrets staged"
else
  [ -f "$ENV_FILE" ] || {
    echo "FAIL: no .env found; run with provisioning secrets or use --ci." >&2
    exit 1
  }
fi

step "Preflight test suite"
require node
node --test scripts/release-preflight.test.mjs

step "Release preflight"
if [ "$CI_MODE" = "--ci" ] || [ "$CI_MODE" = "-c" ]; then
  SKIP_ENVIRONMENT_CHECKS=1 node scripts/release-preflight.mjs
else
  node scripts/release-preflight.mjs
fi

step "Docker compose config (production and dev files must resolve)"
require docker
docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" config -q
echo "docker-compose.prod.yml config: OK"
docker compose -f docker-compose.yml --env-file "$ENV_FILE" config -q
echo "docker-compose.yml config: OK"
rendered="$(docker compose -f docker-compose.prod.yml --env-file "$ENV_FILE" config)"
if printf '%s' "$rendered" | grep -E '^\s*image: .*:latest\s*$'; then
  echo "FAIL: docker-compose.prod.yml resolves an image to :latest" >&2
  exit 1
fi
echo "production compose has no :latest references"

step "Kustomize renders (k8s base + sealed secrets)"
require kubectl
kubectl kustomize k8s > "$TMP_DIR/k8s-rendered.yaml"
echo "k8s/ rendered ($(grep -c '^kind:' "$TMP_DIR/k8s-rendered.yaml") kinds)"
kubectl kustomize infra/sealed-secrets > "$TMP_DIR/sealed-rendered.yaml"
echo "infra/sealed-secrets rendered"

step "Helm templates (production and staging must render)"
require helm
for vf in values/production.yaml values/staging.yaml; do
  helm template vardiya infra/helm/vardiya-platform \
    -f "infra/helm/vardiya-platform/$vf" \
    > "$TMP_DIR/$(basename "$vf" .yaml).rendered.yaml" \
    2> "$TMP_DIR/helm.err" || {
      cat "$TMP_DIR/helm.err" >&2
      echo "FAIL: helm template $vf" >&2
      exit 1
    }
  echo "helm template ($vf): OK"
done

step "Image parity assertions (rendered output only)"
fail=0
for manifest in \
  "$TMP_DIR/k8s-rendered.yaml" \
  "$TMP_DIR/sealed-rendered.yaml" \
  "$TMP_DIR/production.rendered.yaml" \
  "$TMP_DIR/staging.rendered.yaml"; do
  [ -f "$manifest" ] || continue
  images="$(grep -hoE 'image:[[:space:]]+[^[:space:]]+' "$manifest" | sed -E 's/^image:[[:space:]]*//; s/^["'\'']//; s/["'\'']$//' || true)"
  while IFS= read -r image; do
    [ -n "$image" ] || continue
    case "$image" in
      ghcr.io/anomalyco/*)
        if ! printf '%s' "$image" | grep -q "^${EXPECTED_PREFIX}/"; then
          echo "FAIL: $manifest references '$image' (expected prefix ${EXPECTED_PREFIX}/)" >&2
          fail=1
        fi
        if printf '%s' "$image" | grep -qE ':(latest)$'; then
          echo "FAIL: $manifest references a floating tag: $image" >&2
          fail=1
        fi
        ;;
    esac
  done <<< "$images"
done
[ "$fail" -eq 0 ] || { echo "FAIL: image parity violations above." >&2; exit 1; }
echo "image parity: OK"

echo
echo "Release dry run COMPLETE — no registry or cluster writes were performed."