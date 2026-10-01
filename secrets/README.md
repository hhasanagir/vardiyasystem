# Docker Secrets

This directory contains plain-text secret files mounted into Docker containers
as secrets (`/run/secrets/<name>`).

## Required files

| File                         | Used by  | Description                       |
| ---------------------------- | -------- | --------------------------------- |
| `db_password.txt`            | postgres | PostgreSQL password               |
| `jwt_access_secret.txt`      | backend  | JWT access token signing secret   |
| `jwt_refresh_secret.txt`     | backend  | JWT refresh token signing secret  |
| `cookie_secret.txt`          | backend  | Cookie signing secret             |
| `encryption_master_key.txt`  | backend  | AES-256-GCM master key (256 bits) |
| `slack_webhook.txt`          | backend  | Slack webhook URL for alerts      |
| `grafana_admin_password.txt` | grafana  | Grafana admin password            |

All seven files are referenced by `docker-compose.prod.yml`. A deploy fails fast
with `env file ... not found` / `secret ... not found` when any of them is absent.

Create them all with:

```bash
./scripts/generate-secrets.sh
```

The script never overwrites an existing file and never prints secret values.

## Security notes

- These files are **gitignored** — never commit real secrets.
- Generate production secrets with:
  `openssl rand -hex 64 > secrets/jwt_access_secret.txt`
- In development, `docker-compose.yml` reads from these files;
  `docker-compose.prod.yml` uses the same pattern.
- File permissions should be 0400 or 0600:
  `chmod 0600 secrets/*.txt`
