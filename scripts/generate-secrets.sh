#!/bin/bash
# VardiyaOS Docker secret bootstrap
# Creates any missing secret files required by docker-compose.prod.yml.
# Never overwrites an existing file. Never prints secret values.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SECRETS_DIR="$PROJECT_ROOT/secrets"

# name:kind  (hex = random hex, webhook = empty placeholder for operator)
REQUIRED=(
  "db_password.txt:hex"
  "jwt_access_secret.txt:hex"
  "jwt_refresh_secret.txt:hex"
  "cookie_secret.txt:hex"
  "encryption_master_key.txt:hex"
  "grafana_admin_password.txt:hex"
  "slack_webhook.txt:webhook"
)

if ! command -v openssl > /dev/null 2>&1; then
  echo "ERROR: openssl is required to generate secrets" >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"
created=0
skipped=0

for entry in "${REQUIRED[@]}"; do
  name="${entry%%:*}"
  kind="${entry##*:}"
  path="$SECRETS_DIR/$name"

  if [ -e "$path" ]; then
    if [ -s "$path" ]; then
      echo "SKIP  $name (already exists, left untouched)"
      skipped=$((skipped + 1))
      continue
    fi
    if [ "$kind" = "webhook" ]; then
      # Placeholder the operator is expected to fill in later.
      echo "SKIP  $name (empty placeholder exists, left untouched)"
      skipped=$((skipped + 1))
      continue
    fi
    echo "ERROR $path exists but is empty. Refusing to overwrite; remove it first." >&2
    exit 1
  fi

  case "$kind" in
    hex)
      umask 077
      openssl rand -hex 32 > "$path"
      ;;
    webhook)
      umask 077
      # Operator must paste the real Slack webhook URL; no value is invented here.
      : > "$path"
      ;;
    *)
      echo "ERROR: unknown secret kind '$kind'" >&2
      exit 1
      ;;
  esac

  chmod 0600 "$path"
  echo "CREATE $name"
  created=$((created + 1))
done

echo "---"
echo "created=$created skipped=$skipped dir=$SECRETS_DIR"

if [ -f "$SECRETS_DIR/slack_webhook.txt" ] && [ ! -s "$SECRETS_DIR/slack_webhook.txt" ]; then
  echo "ACTION: paste the real Slack webhook URL into secrets/slack_webhook.txt"
fi

echo "Verify with: node scripts/release-preflight.mjs"
