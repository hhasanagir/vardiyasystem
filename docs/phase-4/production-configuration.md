# VardiyaOS — Production Configuration Reference

**Phase:** 4 — Production Readiness
**Scope:** Complete runtime configuration reference for production deployments
**Source of truth:** `.env.production.example`, `backend/src/config/env.config.ts`, `backend/src/config/production-config.template.ts`, `pgbouncer/pgbouncer.ini`, `nginx/nginx.prod.conf`

> ⚠️ This document contains **placeholder values only**. Never commit real secrets.
> Generate secrets with: `openssl rand -hex 64`

---

## 1. Environment Variables

### 1.1 Database

| Variable              | Required | Default | Example                                                                                                         | Description                                                      |
| --------------------- | -------- | ------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `DATABASE_URL`        | ✅       | —       | `postgresql://vardiya:<PASSWORD>@pgbouncer:6432/vardiyasystem?schema=public&connection_limit=25&pgbouncer=true` | App connections — always via PgBouncer                           |
| `DATABASE_DIRECT_URL` | ✅       | —       | `postgresql://vardiya:<PASSWORD>@postgres:5432/vardiyasystem?schema=public&connection_limit=5`                  | Direct connection used by Prisma migrations (bypasses PgBouncer) |
| `DB_PASSWORD_FILE`    | ❌       | —       | `/run/secrets/db_password`                                                                                      | Docker secret file; overrides inline password when mounted       |

### 1.2 JWT / Auth Secrets

| Variable                        | Required  | Default      | Example                           | Description                                                          |
| ------------------------------- | --------- | ------------ | --------------------------------- | -------------------------------------------------------------------- |
| `JWT_ACCESS_TOKEN_SECRET`       | ✅ (prod) | dev fallback | `<64 hex chars>`                  | Access token signing secret. Min 32 chars enforced by Joi validation |
| `JWT_REFRESH_TOKEN_SECRET`      | ✅ (prod) | dev fallback | `<64 hex chars>`                  | Refresh token signing secret. Must differ from access secret         |
| `JWT_ACCESS_TOKEN_EXPIRES_IN`   | ❌        | `15m`        | `15m`                             | Access token TTL                                                     |
| `JWT_REFRESH_TOKEN_EXPIRES_IN`  | ❌        | `7d`         | `7d`                              | Refresh token TTL                                                    |
| `COOKIE_SECRET`                 | ✅ (prod) | dev fallback | `<64 hex chars>`                  | Cookie signing secret for `cookie-parser`. Min 32 chars enforced     |
| `JWT_ACCESS_TOKEN_SECRET_FILE`  | ❌        | —            | `/run/secrets/jwt_access_secret`  | Docker secret alternative                                            |
| `JWT_REFRESH_TOKEN_SECRET_FILE` | ❌        | —            | `/run/secrets/jwt_refresh_secret` | Docker secret alternative                                            |

### 1.3 Server & URLs

| Variable            | Required | Default                 | Example                       | Description                                                     |
| ------------------- | -------- | ----------------------- | ----------------------------- | --------------------------------------------------------------- |
| `NODE_ENV`          | ✅       | `development`           | `production`                  | Must be `production`; toggles Secure cookies, HSTS, Swagger off |
| `PORT`              | ❌       | `3000`                  | `3000`                        | API listen port                                                 |
| `FRONTEND_URL`      | ✅       | `http://localhost:4200` | `https://vardiya.example.com` | Allowed CORS origin + CSP `connect-src`                         |
| `WS_CORS_ORIGIN`    | ✅       | `http://localhost:4200` | `https://vardiya.example.com` | WebSocket handshake CORS origin                                 |
| `TRUST_PROXY_LEVEL` | ❌       | `1`                     | `1`                           | Express `trust proxy` hops. Set to `1` behind nginx             |

### 1.4 Redis

| Variable    | Required | Default | Example              | Description                                                          |
| ----------- | -------- | ------- | -------------------- | -------------------------------------------------------------------- |
| `REDIS_URL` | ✅       | —       | `redis://redis:6379` | Used by BullMQ queues and throttler storage. Use `rediss://` for TLS |

### 1.5 Seed Passwords

| Variable                   | Required             | Default | Example           | Description                                                        |
| -------------------------- | -------------------- | ------- | ----------------- | ------------------------------------------------------------------ |
| `SEED_ADMIN_PASSWORD`      | ⚠️ first deploy only | —       | `<strong random>` | Initial admin seed password — rotate immediately after first login |
| `SEED_TECHNICIAN_PASSWORD` | ⚠️ first deploy only | —       | `<strong random>` | Initial technician seed password — rotate immediately              |

> Seeded accounts must have their passwords rotated or accounts disabled before go-live.

### 1.6 Rate Limiting

| Variable                  | Required | Default | Description                    |
| ------------------------- | -------- | ------- | ------------------------------ |
| `GLOBAL_THROTTLE_TTL`     | ❌       | `60000` | Global throttle window (ms)    |
| `GLOBAL_THROTTLE_LIMIT`   | ❌       | `200`   | Max requests per window per IP |
| `AUTH_LOGIN_LIMIT`        | ❌       | `10`    | Login attempts per window      |
| `AUTH_LOGIN_WINDOW_MS`    | ❌       | `60000` | Login throttle window          |
| `AUTH_REGISTER_LIMIT`     | ❌       | `3`     | Registrations per window       |
| `AUTH_REGISTER_WINDOW_MS` | ❌       | `60000` | Register throttle window       |
| `AUTH_REFRESH_LIMIT`      | ❌       | `10`    | Token refreshes per window     |
| `AUTH_REFRESH_WINDOW_MS`  | ❌       | `60000` | Refresh throttle window        |

### 1.7 Account Lockout

| Variable                                                     | Required | Default    | Description                                                               |
| ------------------------------------------------------------ | -------- | ---------- | ------------------------------------------------------------------------- |
| `AUTH_LOCKOUT_THRESHOLD`                                     | ❌       | `5`        | Failed attempts before lockout                                            |
| `AUTH_LOCKOUT_DURATION` / `AUTH_LOCKOUT_DURATION_MS`         | ❌       | `900000`   | Base lockout duration (15 min). Both spellings accepted                   |
| `AUTH_LOCKOUT_PROGRESSIVE_FACTOR`                            | ❌       | `2`        | Multiplier applied per subsequent lockout                                 |
| `AUTH_LOCKOUT_MAX_DURATION` / `AUTH_LOCKOUT_MAX_DURATION_MS` | ❌       | `86400000` | Lockout cap (24 h). Admin unlock available via `POST /api/v1/auth/unlock` |

### 1.8 WebSocket

| Variable                   | Required | Default | Description                                         |
| -------------------------- | -------- | ------- | --------------------------------------------------- |
| `WS_CONNECTION_LIMIT`      | ❌       | `10`    | Connection attempts allowed per window per identity |
| `WS_CONNECTION_WINDOW_MS`  | ❌       | `60000` | Connection rate-limit window                        |
| `WS_RECONNECT_COOLDOWN_MS` | ❌       | `2000`  | Minimum delay between reconnects from same client   |

### 1.9 Logging

| Variable    | Required | Default | Description                                                                    |
| ----------- | -------- | ------- | ------------------------------------------------------------------------------ |
| `LOG_LEVEL` | ❌       | `info`  | Winston level: `error`, `warn`, `info`, `debug`, `verbose`. Use `info` in prod |
| `LOG_DIR`   | ❌       | `logs`  | Directory for rotating log files (must be a mounted volume)                    |

### 1.10 Alerting

| Variable             | Required | Default | Description                                              |
| -------------------- | -------- | ------- | -------------------------------------------------------- |
| `SLACK_WEBHOOK_URL`  | ❌       | —       | Slack incoming webhook for operational/security alerts   |
| `SLACK_WEBHOOK_FILE` | ❌       | —       | Docker secret alternative (`/run/secrets/slack_webhook`) |

### 1.11 Vault Integration (optional)

Falls back to environment variables when not configured.

| Variable            | Required | Default | Description                                                 |
| ------------------- | -------- | ------- | ----------------------------------------------------------- |
| `VAULT_ADDR`        | ❌       | —       | HashiCorp Vault address, e.g. `https://vault.internal:8200` |
| `VAULT_ROLE_ID`     | ❌       | —       | AppRole role ID (not secret by itself)                      |
| `VAULT_SECRET_ID`   | ❌       | —       | AppRole secret ID — treat as a secret                       |
| `VAULT_SECRET_PATH` | ❌       | —       | KV mount path, e.g. `secret/vardiya`                        |

### 1.12 Push Notifications (Web Push / VAPID)

Required in production — validated by Joi schema.

| Variable            | Required  | Default                         | Description                                                           |
| ------------------- | --------- | ------------------------------- | --------------------------------------------------------------------- |
| `VAPID_PUBLIC_KEY`  | ✅ (prod) | dev fallback                    | Base64 URL-safe VAPID public key (`npx web-push generate-vapid-keys`) |
| `VAPID_PRIVATE_KEY` | ✅ (prod) | dev fallback                    | VAPID private key — secret                                            |
| `VAPID_SUBJECT`     | ❌        | `mailto:vardiyaos@hospital.com` | Contact URI sent to push services. Set to your domain                 |

### 1.13 SMTP (optional — email notifications)

| Variable    | Required | Default | Description                                         |
| ----------- | -------- | ------- | --------------------------------------------------- |
| `SMTP_HOST` | ❌       | —       | Outbound SMTP relay host                            |
| `SMTP_PORT` | ❌       | —       | Usually `587` (STARTTLS) or `465` (implicit TLS)    |
| `SMTP_USER` | ❌       | —       | SMTP username, e.g. `noreply@example.com`           |
| `SMTP_PASS` | ❌       | —       | SMTP password — secret                              |
| `SMTP_FROM` | ❌       | —       | From header, e.g. `VardiyaOS <noreply@example.com>` |

---

## 2. Database Configuration

### 2.1 Topology

```
API pods ──► PgBouncer :6432 ──► PostgreSQL :5432
                (transaction pooling)
Migrations ──────────────────────────► PostgreSQL :5432 (direct)
```

All application traffic goes through PgBouncer. Prisma migrations use `DATABASE_DIRECT_URL` because prepared statements are incompatible with transaction pooling.

### 2.2 PgBouncer Settings (`pgbouncer/pgbouncer.ini`)

| Setting               | Value           | Notes                                       |
| --------------------- | --------------- | ------------------------------------------- |
| `pool_mode`           | `transaction`   | Requires `pgbouncer=true` in `DATABASE_URL` |
| `default_pool_size`   | `25`            | Matches `connection_limit=25` on app side   |
| `max_client_conn`     | `200`           | Headroom for multiple API replicas          |
| `max_db_connections`  | `50`            | Hard ceiling against Postgres               |
| `server_idle_timeout` | `600`           | Recycle idle server links after 10 min      |
| `server_lifetime`     | `3600`          | Rotate server connections hourly            |
| `query_wait_timeout`  | `10`            | Fail fast instead of queueing forever       |
| `auth_type`           | `scram-sha-256` | Never use `md5` or `trust`                  |

### 2.3 Sizing Guidance

| Deployment scale | `default_pool_size` | `max_db_connections` | App `connection_limit`                    |
| ---------------- | ------------------- | -------------------- | ----------------------------------------- |
| Single replica   | 20–25               | 50                   | 25                                        |
| 2–3 replicas     | 25                  | 75                   | 25 per replica                            |
| >3 replicas      | 30–40               | 100                  | 20 per replica (PgBouncer absorbs fan-in) |

Rule of thumb: `replicas × connection_limit` may exceed `max_db_connections`; PgBouncer multiplexes. Keep Postgres `max_connections` comfortably above `max_db_connections` plus superuser reserved slots.

### 2.4 Health & Monitoring

- Readiness probe executes `SELECT 1` through the app (`GET /api/v1/health/ready`)
- Watch PgBouncer `SHOW POOLS;` — sustained `cl_waiting > 0` means pool saturation
- Alert if `query_wait_timeout` rejections appear in PgBouncer logs

---

## 3. Redis Configuration

| Setting                | Value                                                      | Notes                                                                           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------- |
| URL                    | `redis://redis:6379` (or `redis://:<PASSWORD>@redis:6379`) | Set `requirepass` in redis.conf; prefer ACL users                               |
| Key prefix             | `vardiya:`                                                 | Namespace all keys to allow shared-instance coexistence and safe flush patterns |
| `maxRetriesPerRequest` | `3` (BullMQ uses `null`)                                   | BullMQ connections must set `null` to support blocking commands                 |
| TLS                    | `rediss://` where available                                | Mandatory if traffic crosses untrusted networks                                 |

### Recommended Instance Separation

Run **separate Redis instances** (or at minimum separate logical DBs / ACL users) for:

| Instance      | Consumers                                          | Eviction policy              | Persistence                           |
| ------------- | -------------------------------------------------- | ---------------------------- | ------------------------------------- |
| `redis-cache` | Sessions, presence, edit locks, throttler counters | `allkeys-lru`, maxmemory set | RDB snapshots acceptable              |
| `redis-queue` | BullMQ (`schedule-jobs`, events, DLQ)              | `noeviction`                 | AOF `everysec` — job loss = lost work |

Rationale: cache eviction under memory pressure must never delete queued jobs. If forced onto one instance, use `noeviction` and size generously, but this is strongly discouraged.

### Failure Semantics

- Throttler/lockout counters live in Redis — Redis loss resets brute-force counters temporarily; compensate with nginx-level limits.
- BullMQ jobs survive restarts if Redis persists (AOF). Without persistence, in-flight jobs are lost on crash.

---

## 4. Queue Configuration (BullMQ)

### 4.1 Queues

| Queue               | Purpose                                 | Producer                  | Consumer                   |
| ------------------- | --------------------------------------- | ------------------------- | -------------------------- |
| `schedule-jobs`     | Schedule GENERATE / EXPORT / REPORT     | `ScheduleJobQueueService` | Schedule worker processors |
| Domain events queue | In-process event bus fan-out            | `EventBusService`         | `EventsConsumer`           |
| DLQ                 | Poisoned events after retries exhausted | `DeadLetterQueueService`  | Manual review              |

### 4.2 Job Options

| Job type      | Attempts | Backoff                   | removeOnComplete                 | removeOnFail |
| ------------- | -------- | ------------------------- | -------------------------------- | ------------ |
| GENERATE      | 3        | exponential, 5000 ms base | age 3600 s                       | age 86400 s  |
| EXPORT        | 2        | fixed, 3000 ms            | age 3600 s                       | age 86400 s  |
| REPORT        | 2        | exponential, 5000 ms base | age 3600 s                       | age 86400 s  |
| Domain events | 3        | default                   | kept (`removeOnComplete: false`) | kept         |
| DLQ entries   | n/a      | n/a                       | kept permanently until reviewed  | —            |

Duplicate protection: a second GENERATE for the same schedule is rejected with `409 Conflict` while one is queued/running.

### 4.3 Concurrency

- Worker concurrency is process-local; scale workers horizontally rather than raising concurrency per pod beyond CPU cores.
- Long-running GENERATE jobs should hold no HTTP request open — poll job status or subscribe via WebSocket.
- Feature flag `ENABLE_SCHEDULE_GENERATION_ASYNC` switches generation between sync path and queue path.

### 4.4 Dead Letter Queue Policy

- Events failing all attempts are written to the DLQ with error metadata and attempt count.
- DLQ retention: review within **7 days**, purge after **30 days**.
- Re-drive procedure: fix root cause → replay event via `event-replay.service` (attempts reset to 3).

---

## 5. CORS Configuration

Configured in `main.ts` via `app.enableCors()`:

| Setting         | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Origin          | `FRONTEND_URL` (single exact origin — never `*` in production)      |
| Credentials     | `true`                                                              |
| Methods         | `GET, POST, PUT, PATCH, DELETE, OPTIONS`                            |
| Allowed headers | `Content-Type`, `Authorization`, `x-csrf-token`, `X-Correlation-Id` |
| Exposed headers | `X-Correlation-Id`                                                  |

WebSocket gateway CORS is controlled separately by `WS_CORS_ORIGIN`.

Checklist:

- [ ] No trailing slash in origin URLs (exact match required)
- [ ] `FRONTEND_URL` and `WS_CORS_ORIGIN` both HTTPS in production
- [ ] No wildcard origins anywhere in deployed config

---

## 6. Cookie Configuration

| Cookie       | HttpOnly                                                   | SameSite | Secure                                 | Path | Purpose                                                           |
| ------------ | ---------------------------------------------------------- | -------- | -------------------------------------- | ---- | ----------------------------------------------------------------- |
| `csrf-token` | `false` (readable by JS by design — double-submit pattern) | `strict` | auto (true when `NODE_ENV=production`) | `/`  | CSRF double-submit token, issued by `GET /api/v1/auth/csrf-token` |

Additional rules:

- All cookies signed with `COOKIE_SECRET` via `cookie-parser`.
- `Secure` flag derives from `NODE_ENV === 'production'` — never run production traffic behind plain HTTP without TLS.
- Session/auth material travels in `Authorization` header (access token) and request body (refresh token), **not** cookies — reduces CSRF surface.
- If you later move refresh tokens into cookies, use: `HttpOnly=true, Secure=true, SameSite=strict, Path=/api/v1/auth` and add `Domain` only if API and frontend share a parent domain.

---

## 7. TLS Expectations (nginx Termination)

TLS terminates at nginx (`nginx/nginx.prod.conf`); the backend speaks plain HTTP inside the private network.

```text
Client ──HTTPS──► nginx :443 ──HTTP──► API :3000
                    │
                    └── wss:// ──► ws upgrade proxied to API /realtime
```

| Requirement       | Value                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| Protocols         | `TLSv1.2`, `TLSv1.3` only                                                                               |
| Certificate       | Full chain (`fullchain.pem`) + key (`privkey.pem`); e.g. Let's Encrypt                                  |
| HSTS              | `max-age=31536000; includeSubDomains; preload` (app) and `max-age=63072000` (nginx edge)                |
| HTTP→HTTPS        | Port 80 returns `301` to HTTPS                                                                          |
| Cipher preference | Server-side, `HIGH:!aNULL:!MD5`                                                                         |
| Session cache     | `shared:SSL:10m`, timeout 10 m                                                                          |
| Proxy headers     | `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto` must be forwarded; `TRUST_PROXY_LEVEL=1` on the app |
| CSP               | `connect-src` must include `wss://vardiya.example.com` for WebSockets                                   |

Operational notes:

- Automate renewal (certbot timer / Traefik / cloud LB) — expiry monitoring alert at T-14 days.
- Internal service-to-service traffic (nginx→API, API→Postgres, API→Redis) stays inside an isolated Docker/K8s network; add mutual TLS or WireGuard if any hop leaves that boundary.

---

## 8. Logging Configuration

Winston structured JSON logging (`backend/src/logger/winston-logger.ts`):

| Aspect       | Configuration                                                                                                        |
| ------------ | -------------------------------------------------------------------------------------------------------------------- |
| Format       | JSON, one event per line: `{ level, message, timestamp, service, trace_id, span_id, trace_flags, ...meta }`          |
| Service name | `service: "vardiya-api"` on every record                                                                             |
| Correlation  | OpenTelemetry span context injected into every log line; HTTP requests carry `X-Correlation-Id` (exposed to clients) |
| Levels       | `error` < `warn` < `info` < `debug` < `verbose`; production uses `info`                                              |
| Transports   | Console (for container log collectors) + `DailyRotateFile`                                                           |
| Rotation     | Daily (`vardiya-api-%DATE%.log`), zip-compressed                                                                     |
| Size cap     | 20 MB per file                                                                                                       |
| Retention    | 14 days of files (`maxFiles: '14d'`)                                                                                 |

Requirements:

- Mount `LOG_DIR` on a persistent volume or ship stdout to Loki/Promtail (repo ships Loki/Tempo/Grafana configs).
- Never log tokens, passwords, or PHI. Exception filters redact stack traces from client responses.
- Alert on `error`-level spikes via the alerting pipeline (Slack webhook).

Log shipping example (Promtail targets):

```yaml
scrape_configs:
  - job_name: vardiya-api
    static_configs:
      - targets: [localhost]
        labels:
          service: vardiya-api
          __path__: /var/log/vardiya/vardiya-api-*.log
```

---

## 9. Rate Limiting Configuration

Defense in depth — three layers:

### Layer 1 — nginx edge (`limit_req_zone`)

| Zone           | Rate    | Burst      | Applies to                |
| -------------- | ------- | ---------- | ------------------------- |
| `login`        | 5 r/s   | 10 nodelay | `POST /api/auth/login`    |
| `register`     | 2 r/s   | 5 nodelay  | `POST /api/auth/register` |
| `auth_refresh` | 10 r/s  | 10 nodelay | `POST /api/auth/refresh`  |
| `api_general`  | 100 r/s | 30 nodelay | All other `/api/*`        |
| `ws_connect`   | 10 r/s  | —          | WebSocket upgrades        |

Rejections return HTTP `429`.

### Layer 2 — Application throttler (@nestjs/throttler, Redis-backed)

| Scope          | Limit        | Window |
| -------------- | ------------ | ------ |
| Global default | 200 req / IP | 60 s   |
| Login          | 10           | 60 s   |
| Register       | 3            | 60 s   |
| Refresh        | 10           | 60 s   |

Distributed across replicas via `ThrottlerStorageRedisService` — limits are cluster-wide, not per-pod.

### Layer 3 — Account lockout (credential-stuffing defense)

| Parameter        | Value                                     |
| ---------------- | ----------------------------------------- |
| Threshold        | 5 consecutive failures                    |
| Base duration    | 15 min, progressive ×2 per repeat offense |
| Maximum duration | 24 h                                      |
| Unlock           | Admin-only: `POST /api/v1/auth/unlock`    |

Tuning guidance:

- Lower `AUTH_LOGIN_LIMIT` (e.g. 5) for high-sensitivity deployments; watch false positives from shared office NATs.
- Keep nginx burst values ≥ application limits so nginx absorbs floods while legitimate bursts pass.
- Monitor 429 rates per zone; sudden spikes indicate attacks or broken clients.

---

## 10. Health Check Endpoints

Base path prefix: `/api/v1`

| Endpoint                       | Auth                                            | Purpose                           | Checks                                                                                        |
| ------------------------------ | ----------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /api/v1/health/live`      | None (CSRF-exempt)                              | Liveness probe                    | Process alive only — never fails due to dependencies                                          |
| `GET /api/v1/health/ready`     | None (CSRF-exempt)                              | Readiness probe / LB target check | Database `SELECT 1`, Redis PING, queue job counts, heap usage (<90%), endpoint health summary |
| `GET /api/v1/health`           | JWT                                             | Detailed health snapshot          | Adds version, uptime, DB latency, memory, top failing endpoints                               |
| `GET /api/v1/health/dashboard` | JWT (HTML or JSON via Accept header)            | Human-facing ops dashboard        | Per-endpoint metrics: error rate, avg/p95 latency, slowest endpoints                          |
| `GET /api/v1/metrics`          | None (unauthenticated scrape endpoint — no JWT) | Prometheus scrape                 | RED metrics, queue gauges, WS counters                                                        |

Probe wiring guidance:

| Probe                   | Endpoint               | Failure threshold | Period |
| ----------------------- | ---------------------- | ----------------- | ------ |
| Kubernetes liveness     | `/api/v1/health/live`  | 3                 | 10 s   |
| Kubernetes readiness    | `/api/v1/health/ready` | 2                 | 15 s   |
| External uptime monitor | `/api/v1/health/ready` | 2                 | 60 s   |

Readiness reports `"status": "degraded"` with per-check detail when any subsystem fails; degraded state also fires a throttled Slack alert (5-minute cooldown).

Restrict `/api/v1/metrics` and `/health/dashboard` to the internal network at the proxy layer — they expose operational detail.

---

## 11. WebSocket Configuration

Gateway: `ScheduleGateway` (`backend/src/modules/websocket/schedule.gateway.ts`)

| Setting             | Value                                                                      |
| ------------------- | -------------------------------------------------------------------------- |
| Namespace           | `/realtime`                                                                |
| Transport           | Socket.IO (websocket + polling fallback during connect)                    |
| Handshake auth      | JWT verified on connection; socket registered as authenticated session     |
| CORS origin         | `WS_CORS_ORIGIN` (falls back to `FRONTEND_URL`) — credentials enabled      |
| Rooms               | Organization/unit scoped rooms for schedule collaboration                  |
| Event deduplication | 30-second eventId dedup window                                             |
| Presence & locks    | Presence tracking + edit locks with periodic stale cleanup (30 s interval) |

Connection hardening (env-driven):

| Guard                               | Env var                                           | Default   |
| ----------------------------------- | ------------------------------------------------- | --------- |
| Connection attempt limit per window | `WS_CONNECTION_LIMIT` / `WS_CONNECTION_WINDOW_MS` | 10 / 60 s |
| Reconnect cooldown                  | `WS_RECONNECT_COOLDOWN_MS`                        | 2000 ms   |

Proxy requirements (nginx): `Upgrade`/`Connection` headers forwarded, `proxy_read_timeout` ≥ 120 s for long-lived sockets, `wss://` origin whitelisted in CSP.

---

## 12. Feature Flags

Flags are read once at boot from env vars (`backend/src/config/feature-flags.ts`). Changing a flag requires a process restart (rolling redeploy).

| Flag                               | Default | Description                                             | Rollout guidance                                     |
| ---------------------------------- | ------- | ------------------------------------------------------- | ---------------------------------------------------- |
| `ENABLE_REALTIME_COLLABORATION`    | `false` | Live multi-user schedule editing over WebSocket         | Enable per-environment after load testing            |
| `ENABLE_ADVANCED_AUDIT`            | `false` | Extended audit trails                                   | Low risk; enable in prod early                       |
| `ENABLE_FOUR_EYES_APPROVAL`        | `false` | Dual approval required before publish                   | Regulatory requirement — enable for hospital tenants |
| `ENABLE_SCHEDULE_GENERATION_ASYNC` | `false` | Route generation through BullMQ instead of sync request | Enable when generations exceed ~10 s                 |
| `ENABLE_OFFLINE_MODE`              | `false` | Client offline queueing                                 | Mobile rollout feature                               |
| `ENABLE_EXPORT_ASYNC`              | `false` | Exports processed via queue                             | Pair with async job status UI                        |
| `ENABLE_BIOMETRIC_AUTH`            | `false` | Biometric unlock on mobile clients                      | Requires device-trust review                         |

Production recommendation matrix:

| Environment               | Safe baseline flags                                                                                |
| ------------------------- | -------------------------------------------------------------------------------------------------- |
| Production (initial)      | `ENABLE_ADVANCED_AUDIT=true` only                                                                  |
| Production (steady state) | + `ENABLE_REALTIME_COLLABORATION`, `ENABLE_FOUR_EYES_APPROVAL`, `ENABLE_SCHEDULE_GENERATION_ASYNC` |
| Staging                   | All flags exercised before enabling in prod                                                        |

Kill-switch behavior: setting a flag back to `false` and restarting disables the code path instantly — use this as first-line mitigation for misbehaving features (see incident-response.md).

---

## 13. Configuration Validation

The Joi schema in `env.config.ts` enforces at boot:

- `DATABASE_URL` present
- JWT secrets present and ≥32 chars in production
- `COOKIE_SECRET` present and ≥32 chars in production
- VAPID keys present in production

A misconfigured production container fails fast at startup with a descriptive error — do not bypass the validation schema.

Final pre-flight:

```bash
# Verify no placeholder secrets remain
grep -rn "CHANGE_ME" .env && echo "FAIL: placeholders present"

# Verify secret strength
awk -F= '/SECRET/{print length($2)}' .env   # expect >= 64
```
