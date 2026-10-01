# VardiyaOS Rollback Procedures

> Standard operating procedures for rolling back deployments, database changes, and configuration.

---

## Table of Contents

1. [Rollback Principles](#rollback-principles)
2. [Application Rollback (Docker)](#application-rollback-docker)
3. [Application Rollback (Kubernetes)](#application-rollback-kubernetes)
4. [Database Rollback](#database-rollback)
5. [Configuration Rollback](#configuration-rollback)
6. [Emergency Procedures](#emergency-procedures)
7. [Post-Rollback Verification](#post-rollback-verification)

---

## Rollback Principles

### Decision Matrix

| Severity                                        | Response Time          | Action                                                      |
| ----------------------------------------------- | ---------------------- | ----------------------------------------------------------- |
| **Critical** — Full outage, data loss           | Immediate              | Rollback to last known good version                         |
| **High** — Major feature broken, users impacted | Within 15 minutes      | Rollback deployment; consider hotfix if rollback is complex |
| **Medium** — Non-critical feature broken        | Within 1 hour          | Hotfix forward; rollback only if hotfix will take > 2 hours |
| **Low** — Cosmetic issue, minor bug             | Next scheduled release | No rollback needed                                          |

### Pre-Rollback Checklist

- [ ] Confirm the issue is caused by the latest deployment
- [ ] Identify the last known good version (commit SHA or image tag)
- [ ] Check database migration status — reversible or not
- [ ] Notify the team via Slack `#deployments` channel
- [ ] Ensure database backup exists from before the deployment
- [ ] Have the rollback procedure ready and reviewed

---

## Application Rollback (Docker)

### Step 1: Identify the Current and Target Versions

```bash
# Current deployed version
docker inspect vardiya-backend | jq '.[].Config.Labels."org.opencontainers.image.version"'

# List available images
docker images ghcr.io/anomalyco/vardiyasystem/backend
docker images ghcr.io/anomalyco/vardiyasystem/frontend
```

The deploy workflow publishes immutable full-SHA tags (e.g.
`ghcr.io/anomalyco/vardiyasystem/backend:0123456789abcdef...`), and also
`latest` on `main` plus semver tags on tag pushes. Roll back only to a
SHA tag — callers like `scripts/rollback.sh` reject a mutable target.

### Step 2: Pull the Target Image

```bash
# Target version (replace with the commit SHA of the last good build)
TARGET_SHA="a1b2c3d4e5f6..."

docker pull ghcr.io/anomalyco/vardiyasystem/backend:$TARGET_SHA
docker pull ghcr.io/anomalyco/vardiyasystem/frontend:$TARGET_SHA
```

### Step 3: Execute Rollback

`docker-compose.prod.yml` consumes `BACKEND_IMAGE` and `FRONTEND_IMAGE` and
**refuses to start** unless both are set to an immutable tag. Set them
explicitly; `IMAGE_TAG` is not read by the compose file.

```bash
TARGET_SHA="a1b2c3d4e5f6..."

# Point the stack at the target build
export BACKEND_IMAGE="ghcr.io/anomalyco/vardiyasystem/backend:$TARGET_SHA"
export FRONTEND_IMAGE="ghcr.io/anomalyco/vardiyasystem/frontend:$TARGET_SHA"

# Recreate only the application containers; data services stay up
docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate backend frontend
```

Do **not** retag the good image as `:latest`. The compose file rejects a
mutable reference on purpose, and a floating tag cannot be audited afterwards.

### Step 4: Verify Rollback

```bash
# Liveness, then readiness — readiness is what asserts database and Redis
curl -sf http://127.0.0.1:3000/api/v1/health/live
curl -sf http://127.0.0.1:3000/api/v1/health/ready

# Front door
curl -sf http://127.0.0.1/health
curl -sf http://127.0.0.1/ | head -20

# Application logs
docker compose -f docker-compose.prod.yml logs backend --tail=50
```

### Full Rollback Script

`scripts/rollback.sh` implements the procedure above, including the readiness
wait and the diagnostics dump on failure:

```bash
# Preview the plan without changing anything
scripts/rollback.sh a1b2c3d4e5f6 --dry-run

# Roll back, with a confirmation prompt
scripts/rollback.sh a1b2c3d4e5f6

# Unattended (used by automation)
scripts/rollback.sh a1b2c3d4e5f6 --yes
```

It records the currently running images before changing anything and prints
the command that reverses the rollback, so a failed rollback can be undone or
rolled forward without guessing. A mutable target tag is rejected.

Behaviour verified in CI-style checks: missing target, `--latest` target,
unknown option, absent `.env`, `--dry-run`, and operator abort.

---

## Application Rollback (Kubernetes)

### Using kubectl rollout undo

```bash
# Check rollout history
kubectl rollout history deployment/vardiya-backend -n vardiya

# Rollback to the previous revision
kubectl rollout undo deployment/vardiya-backend -n vardiya

# Rollback to a specific revision
kubectl rollout undo deployment/vardiya-backend -n vardiya --to-revision=3

# Verify rollback status
kubectl rollout status deployment/vardiya-backend -n vardiya
```

### Using specific image (GitOps style)

```bash
# Target revision image
TARGET_IMAGE="ghcr.io/anomalyco/vardiyasystem/backend:a1b2c3d4e5f6"

# Deploy target image
kubectl set image deployment/vardiya-backend backend=$TARGET_IMAGE -n vardiya

# Watch rollout
kubectl rollout status deployment/vardiya-backend -n vardiya

# If rollout fails, auto-rollback
kubectl rollout undo deployment/vardiya-backend -n vardiya
```

### Using Helm Rollback

```bash
# If using Helm charts
helm history vardiya -n vardiya
helm rollback vardiya 2 -n vardiya
```

---

## Database Rollback

### ⚠️ Important

- Database rollbacks are **high risk** and should be a last resort
- Prefer **forward fix** (new migration) over rollback
- Always restore from backup rather than reversing migrations
- Never run reversible migrations in production without a tested restore plan

### Option A: Forward Fix (Preferred)

```bash
# Create a new migration that reverses the problematic change
cd backend
npx prisma migrate dev --name revert_bad_change

# Deploy the new migration
npx prisma migrate deploy
```

### Option B: Restore from Backup

```bash
# 1. Stop the application to prevent writes
docker compose -f docker-compose.prod.yml stop backend

# 2. Restore database from the most recent backup before the bad deployment
./scripts/restore-db.ps1 backups/vardiyasystem_20250101_000000.sql.gz

# 3. Verify the restore: the dump must contain the Prisma migration history
./scripts/restore-check.sh backups/vardiyasystem_20250101_000000.sql.gz

# 4. Verify data integrity
psql -h localhost -U vardiya -d vardiyasystem -c "SELECT COUNT(*) FROM pg_tables;"

# 5. Restart the application
docker compose -f docker-compose.prod.yml start backend
```

### Option C: Manual Migration Reversal (Expert Only)

```bash
# 1. Identify the bad migration
cd backend
npx prisma migrate status

# 2. Manually execute SQL to reverse changes (example)
psql -h localhost -U vardiya -d vardiyasystem <<'SQL'
BEGIN;
  ALTER TABLE "Device" DROP COLUMN "new_column";
COMMIT;
SQL

# 3. Mark migration as rolled back
psql -h localhost -U vardiya -d vardiyasystem -c "
  UPDATE _prisma_migrations
  SET rolled_back_at = NOW()
  WHERE migration_name = '20250101000000_bad_migration';
"

# 4. Re-deploy the previous application version
```

---

## Configuration Rollback

### Docker Compose

```bash
# Restore docker-compose.prod.yml from git
git checkout <previous-commit> -- docker-compose.prod.yml
git checkout <previous-commit> -- nginx/nginx.prod.conf

# Re-deploy with restored config
docker compose -f docker-compose.prod.yml up -d
```

### Environment Variables

```bash
# Restore .env from backup
cp backups/.env.20250101 .env

# Or restore from git (if .env is tracked — not recommended)
git checkout <previous-commit> -- .env

# Restart services to pick up new env
docker compose -f docker-compose.prod.yml up -d
```

### Nginx Configuration

```bash
# Rollback nginx config
git checkout <previous-commit> -- nginx/nginx.prod.conf

# If using Docker Compose:
docker compose -f docker-compose.prod.yml restart frontend

# If using standalone nginx:
sudo nginx -t && sudo systemctl reload nginx
```

---

## Emergency Procedures

### Hotfix Process (When Rollback Is Too Slow)

```
1. Identify the minimal fix
2. Create a branch from the last good commit
3. Cherry-pick only the fix commit
4. Bypass PR validation with [skip ci] in commit message
5. Deploy directly to production
6. After stabilization, merge the hotfix back to main
```

### Database Corruption

```bash
# 1. Immediately stop all application containers
docker compose -f docker-compose.prod.yml down

# 2. Take a forensic snapshot of the corrupted database
pg_dump -h localhost -U vardiya -d vardiyasystem \
  --format=custom \
  --file=backups/forensic_$(date +%Y%m%d_%H%M%S).dump

# 3. Restore from the last known good backup
./scripts/restore-db.ps1 backups/vardiyasystem_20250101_000000.sql.gz
./scripts/restore-check.sh backups/vardiyasystem_20250101_000000.sql.gz

# 4. Restore point-in-time recovery (if WAL archives exist)
#    to the moment just before the corruption
pg_restore -h localhost -U vardiya -d vardiyasystem \
  --format=custom \
  --clean \
  backups/vardiya_20250101_000000.dump

# 5. Verify data integrity
docker compose -f docker-compose.prod.yml up -d
curl http://localhost:3000/api/v1/health/ready
```

### Full System Recovery

If both application and database need recovery:

```bash
# 1. Full teardown
docker compose -f docker-compose.prod.yml down -v

# 2. Restore persistent data
#    - PostgreSQL: restore from backup (psql or pg_restore)
#    - Redis: restore from RDB/AOF if needed
#    - Logs: preserved in vardiya_logs volume

# 3. Deploy with known good image (immutable sha tag; the compose file
#    refuses `:latest` and never reads IMAGE_TAG)
export BACKEND_IMAGE="ghcr.io/anomalyco/vardiyasystem/backend:<known-good-sha>"
export FRONTEND_IMAGE="ghcr.io/anomalyco/vardiyasystem/frontend:<known-good-sha>"
docker compose -f docker-compose.prod.yml up -d

# 4. Run smoke tests
./scripts/startup-verify.sh
```

---

## Post-Rollback Verification

### Automated Checks (Run After Every Rollback)

```bash
# 1. Liveness probe
curl -sf http://localhost:3000/api/v1/health/live || exit 1

# 2. Readiness probe
curl -sf http://localhost:3000/api/v1/health/ready | jq -e '.status == "ok"' || exit 1

# 3. Database connectivity
curl -sf http://localhost:3000/api/v1/health | jq -e '.database == "ok"' || exit 1

# 4. API returns expected data
curl -sf http://localhost:3000/api/v1/schedules?today=true | jq '.data | length > 0'

# 5. WebSocket connectivity (optional)
#    Requires ws testing tool

# 6. Frontend serves content
curl -sf http://localhost/ | grep -q 'index.html' || exit 1
```

### Manual Checks

- [ ] Login flow works for admin, supervisor, technician roles
- [ ] Schedule creation and editing functions correctly
- [ ] Device status and incident reporting operational
- [ ] Command center dashboard loads and auto-refreshes
- [ ] WebSocket real-time updates are flowing
- [ ] All third-party integrations (Slack, etc.) are connected
- [ ] SSL certificate is valid and not expired

### Monitoring Checks

- [ ] Error rate in Grafana/Datadog is < 0.1%
- [ ] P95 response time is < 500ms
- [ ] Database connection pool usage is < 80%
- [ ] No 5xx errors in logs
- [ ] No rate limit spikes (legitimate traffic is flowing)

---

## Rollback Documentation Template

When a rollback occurs, document the following in `#incident-reports`:

```markdown
## Rollback Report — YYYY-MM-DD HH:MM UTC

**Incident ID**: INC-XXX
**Reporter**: @name
**Duration**: 30 minutes

### What happened?

Brief description of the issue that triggered the rollback.

### Deployed version

- Deploy SHA: `abc123`
- Rolled back to SHA: `def456`

### Database action

- [ ] No database changes
- [ ] Forward fix migration applied
- [ ] Database restored from backup

### Verification

- [ ] All health checks passing
- [ ] Smoke tests passed
- [ ] Monitoring confirms normal operation

### Root cause

Link to RCA document or brief description.

### Action items

- [ ] Add test coverage for this scenario
- [ ] Improve monitoring for this failure mode
- [ ] Update deployment checklist
```
