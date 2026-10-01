# VardiyaOS — Production Deployment Checklist

**Phase:** 4 — Production Readiness
**Usage:** Copy this file per release (e.g. `checklists/2026-08-23-v1.4.0.md`), check items off, and archive with the release record. Every unchecked item blocks go-live unless explicitly waived by the release owner.

---

## 0. Release Identification

| Field                          | Value                   |
| ------------------------------ | ----------------------- |
| Release version                | `<semver>`              |
| Git commit SHA                 | `<sha>`                 |
| Deploy date / window           | `<YYYY-MM-DD HH:MM TZ>` |
| Deploy lead                    | `<name>`                |
| Second operator (verification) | `<name>`                |
| Change ticket / approval ref   | `<id>`                  |

---

## 1. Pre-Deployment

### 1.1 Secrets & Configuration

- [ ] All secrets generated fresh for production (no values reused from staging/dev): `openssl rand -hex 64`
- [ ] `JWT_ACCESS_TOKEN_SECRET` ≠ `JWT_REFRESH_TOKEN_SECRET`, both ≥ 32 chars
- [ ] `COOKIE_SECRET` set, ≥ 32 chars
- [ ] No `CHANGE_ME` placeholders remain in `.env`: `grep -rn "CHANGE_ME" .env` returns nothing
- [ ] `.env` is not committed to git; `.gitignore` covers it; gitleaks pre-commit hook active
- [ ] Secrets delivered via Docker secrets (`/run/secrets/...`) or Vault AppRole — not plaintext env in compose files where avoidable
- [ ] `SEED_ADMIN_PASSWORD` / `SEED_TECHNICIAN_PASSWORD` set to strong random values (rotation planned post-deploy)
- [ ] VAPID keys generated in production (`npx web-push generate-vapid-keys`) and configured
- [ ] `SLACK_WEBHOOK_URL` points to the production alerting channel
- [ ] Feature flags reviewed against the rollout matrix (`production-configuration.md §12`) — only intended flags enabled

### 1.2 Database

- [ ] Latest backup completed and verified restorable (see `backup-recovery-runbook.md`)
- [ ] Backup restore tested on staging within the last 7 days
- [ ] Disk space headroom ≥ 30% on the DB volume
- [ ] Pending migrations reviewed line-by-line; no destructive changes (drops/renames) without a two-phase plan
- [ ] Migration rollback script prepared and rehearsed on staging
- [ ] PgBouncer config validated: `pool_mode=transaction`, pool sizes match app `connection_limit`
- [ ] Migrations will run through `DATABASE_DIRECT_URL` (bypassing PgBouncer)

### 1.3 Redis

- [ ] Separate instances confirmed for cache vs queue (or `noeviction` + adequate memory if shared)
- [ ] Queue Redis persistence enabled (AOF `everysec`)
- [ ] Redis password/ACL configured; instance not exposed beyond the internal network
- [ ] Maxmemory policy on the cache instance is LRU-based; on the queue instance is `noeviction`

### 1.4 TLS & Network

- [ ] TLS certificates valid ≥ 14 days past deploy date (check expiry monitoring)
- [ ] HTTPS redirect verified on port 80
- [ ] HSTS header present with preload directive
- [ ] Security headers present: CSP, X-Frame-Options DENY, X-Content-Type-Options, Referrer-Policy, Permissions-Policy
- [ ] `/api/v1/metrics` and `/health/dashboard` restricted at proxy layer to internal network
- [ ] Swagger disabled (only served when `NODE_ENV !== 'production'`)
- [ ] Firewall: Postgres (5432) and Redis (6379) unreachable from public interfaces

### 1.5 Build & Artifacts

- [ ] CI pipeline green on the release commit (lint, unit tests, e2e)
- [ ] Images built from the exact release SHA and tagged (never `latest` in prod manifests)
- [ ] Image vulnerability scan passed (no criticals)
- [ ] Frontend build produced with correct `FRONTEND_URL`/API base for production
- [ ] Changelog updated and release notes drafted

### 1.6 Operational Readiness

- [ ] Monitoring dashboards reachable (Grafana), Prometheus scraping all targets
- [ ] Alert channels verified with a test alert
- [ ] On-call rotation confirmed; escalation contacts documented
- [ ] Rollback target identified: previous image tag + previous migration state
- [ ] Maintenance window announced to users (if required)
- [ ] Incident response runbook accessible to the on-call operator

---

## 2. Deployment

### 2.1 Freeze & Snapshot

- [ ] Announce deployment start in ops channel
- [ ] Take immediate pre-deploy backup:
  ```bash
  pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -F c \
    -f pre_deploy_$(date +%Y%m%d_%H%M%S).dump
  ```
- [ ] Verify backup file size > 0 and checksum recorded

### 2.2 Migrations

- [ ] Run migrations with direct connection:
  ```bash
  npx prisma migrate deploy
  ```
- [ ] Confirm output shows only expected migrations; abort and investigate on surprises
- [ ] Verify schema state:
  ```bash
  npx prisma migrate status
  ```

### 2.3 Seed (first deploy only)

- [ ] Seed executed once: initial admin/technician accounts created
- [ ] Seed passwords rotated immediately after first login
- [ ] Seed accounts' roles verified as least-privilege-correct
- [ ] Invite-code bootstrap path tested (admin can mint invite codes)

### 2.4 Roll Out

- [ ] New containers/images deployed with health-gated rolling update (K8s) or staggered restart (compose)
- [ ] Containers pass readiness probe before receiving traffic (`GET /api/v1/health/ready` → `"ok"`)
- [ ] Old revision retained until sign-off (do not garbage-collect previous images)

### 2.5 Immediate Health Verification

- [ ] `GET /api/v1/health/live` → 200 `{"status":"ok"}`
- [ ] `GET /api/v1/health/ready` → 200, all checks `ok` (database, redis, queue, memory, endpoints)
- [ ] `GET /api/v1/metrics` → Prometheus format, non-empty (unauthenticated scrape endpoint)
- [ ] Startup log lines show `server_started`, feature flag summary, no bootstrap errors
- [ ] WebSocket namespace `/realtime` accepts an authenticated test connection
- [ ] Error rate and p95 latency flat on Grafana compared to pre-deploy baseline (watch 15 min)

---

## 3. Post-Deployment

### 3.1 Smoke Tests (functional)

- [ ] Register flow: invite code → registration → login succeeds
- [ ] Login: valid credentials issue access + refresh tokens; invalid credentials lock out after threshold
- [ ] Token refresh works; logout revokes session; `logout-all` revokes all sessions
- [ ] Session list endpoint reflects real devices/sessions
- [ ] Schedule CRUD: create draft → assign staff → save
- [ ] Schedule generation completes (sync or async job depending on flag); job status observable
- [ ] Schedule publish: role-gated, audit-logged, versioned
- [ ] Export produces valid PDF/Excel/CSV
- [ ] Real-time collaboration events propagate between two concurrent sessions (if flag enabled)
- [ ] Push notification delivers to a subscribed device (if push configured)
- [ ] CSRF: request without `x-csrf-token` header rejected on protected mutations
- [ ] CORS: cross-origin request from a foreign origin rejected

### 3.2 Smoke Tests (infrastructure behavior)

- [ ] Rate limiting: burst > limit on login returns 429
- [ ] Account lockout triggers after threshold; admin unlock works
- [ ] Health endpoint flips to degraded when Redis container paused (test in maintenance window, then unpause)

### 3.3 Security Verification

- [ ] OWASP ZAP / automated scanner baseline scan passes (no new highs/criticals)
- [ ] Authenticated tenant isolation spot-check: User A cannot read User B's organization schedules via API (IDOR probes on schedule/export endpoints)
- [ ] Role enforcement: technician cannot hit admin-only endpoints (invite codes, unlock, publish)
- [ ] JWT verification: expired token rejected; token signed with wrong secret rejected
- [ ] Refresh token reuse detection: replayed/revoked refresh token rejected and family invalidated
- [ ] TLS grade acceptable (SSL Labs A–A+ external check)
- [ ] Audit log entries written for login/logout/publish/unlock actions during smoke tests
- [ ] gitleaks/trufflehog scan over repo clean

### 3.4 Monitoring & Follow-up

- [ ] Grafana dashboards show healthy error rate (<1%), latency (p95 within SLO), saturated-free resources
- [ ] Loki ingesting structured JSON logs; trace IDs correlate across logs/traces
- [ ] Slack alert pipeline delivers a test warning
- [ ] Backup scheduler confirmed armed for tonight's 02:00 full backup
- [ ] 24-hour follow-up review scheduled; deployment marked stable or rolled back before that point

---

## 4. Rollback Procedure

Trigger conditions (any one):

- Readiness failing > 5 minutes post-deploy with no quick fix
- Critical regression in auth, data integrity, or tenant isolation
- Error rate > 5% sustained for 10 minutes
- Data corruption suspected

### 4.1 Application Rollback (safe, < 5 min)

```bash
# Kubernetes
kubectl rollout undo deployment/vardiya-api
kubectl rollout status deployment/vardiya-api

# Docker Compose
docker compose -f docker-compose.prod.yml down
docker compose -f docker-compose.prod.yml up -d --no-deps --scale api=0   # stop api
# retag previous image and start
```

- [ ] Previous image tag redeployed
- [ ] Readiness green on rolled-back pods
- [ ] Smoke-test login + one schedule read to confirm service restored

> Application rollback alone is safe **only if** migrations are backward-compatible. Verify before proceeding either direction.

### 4.2 Migration Rollback (only if new code requires reverted schema)

1. [ ] Stop API traffic (scale to zero / drain) — never roll back schema under live traffic
2. [ ] Take emergency snapshot:
   ```bash
   pg_dump -h $DB_HOST -U $DB_USER -d vardiyasystem -F c -f pre_rollback_$(date +%Y%m%d_%H%M%S).dump
   ```
3. [ ] Apply the rehearsed rollback SQL (from pre-deployment prep §1.2)
4. [ ] Mark migration rolled back:
   ```bash
   npx prisma migrate resolve --rolled-back YYYYMMDDHHMMSS_migration_name
   ```
5. [ ] Redeploy previous application version
6. [ ] Full smoke suite re-run (§3.1)

Rules: never drop tables/columns without DBA sign-off; prefer soft-delete; verify FK constraints after any rollback.

### 4.3 Full Restore (last resort — data loss suspected)

1. [ ] Declare incident; page DBA + incident commander
2. [ ] Follow `backup-recovery-runbook.md` §1 restore commands
3. [ ] Point-in-time recovery if WAL archiving intact (preferred over full dump restore)
4. [ ] After restore: force global credential reset (rotate JWT secrets → invalidates all sessions/tokens)
5. [ ] Post-restore data reconciliation against audit logs for the lost window

### 4.4 Rollback Closure

- [ ] Root cause captured while context is fresh (link incident ticket)
- [ ] Ops channel notified of resolution
- [ ] Failed release blocked from re-deploy until fix merged; add regression test
- [ ] Checklist annotated with what failed and why — feed into next release planning
