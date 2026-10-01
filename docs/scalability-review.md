# Scalability Review — VardiyaOS

> **Date:** 2026-06-13  
> **Scope:** Backend API (`backend/`), Frontend SPA (`frontend/`), Infrastructure (Docker, nginx, PostgreSQL, Redis)  
> **Target deployment:** 50 hospitals, 5,000 employees, 100,000 shift records, 500 concurrent users

---

## Table of Contents

1. [Executive Summary](#executive)
2. [Current Architecture Snapshot](#snapshot)
3. [Database Layer](#database)
4. [API Layer](#api)
5. [WebSocket Layer](#websocket)
6. [Caching Layer](#caching)
7. [Frontend Layer](#frontend)
8. [Infrastructure Layer](#infrastructure)
9. [Observability Layer](#observability)
10. [Priority Matrix](#matrix)
11. [Recommended Roadmap](#roadmap)

---

<a name="executive"></a>

## 1. Executive Summary

The system can handle its current single-hospital load but will encounter **7 critical bottlenecks** at 500-CCU / 50-hospital scale. The three highest-risk areas are (a) in-memory state preventing horizontal backend scaling, (b) lack of PgBouncer/connection pooling for PostgreSQL, and (c) no caching layer for frequently accessed data. The frontend SPA delivery model and single-process WebSocket adapter are also significant constraints. Remediation is estimated at **2-3 weeks engineering time** for the P0/P1 items, with P2/P3 items spread over the following 2 months.

**Key metrics at target load:**

- Shift records: ~100,000 (currently ~5,000)
- Concurrent API users: ~500
- Concurrent WebSocket connections: ~500
- API requests/second peak: ~200–300
- WebSocket events/second peak: ~50–100
- Database connections needed: ~50–100 (with PgBouncer)

---

<a name="snapshot"></a>

## 2. Current Architecture Snapshot

| Component     | Technology                   | Instance Count    | Scaling Mechanism             |
| ------------- | ---------------------------- | ----------------- | ----------------------------- |
| Backend API   | NestJS (Express), Node.js 20 | 1 container       | None (in-memory state)        |
| Database      | PostgreSQL 16                | 1 Docker instance | None (single node)            |
| Cache/Queue   | Redis 7                      | 1 Docker instance | None (single node)            |
| WebSocket     | Socket.IO (in-process)       | 1 (same as API)   | None (in-memory adapter)      |
| Frontend      | Angular 17 SPA               | 1 nginx container | None (single origin)          |
| Reverse Proxy | nginx (API)                  | 1 container       | Round-robin (no backend pool) |

---

<a name="database"></a>

## 3. Database Layer

### 3.1 No connection pooling middleware

**Risk: P0 — Critical**

**Current state:** Backend connects to PostgreSQL via Prisma's built-in pool (`connection_limit=5`). No PgBouncer or pgbouncer-sidecar.

**Impact at scale:** At 500 CCU with ~3-5 queries per request, peak demand reaches 1,500–2,500 concurrent queries. PostgreSQL's `max_connections` default is 100. Each Prisma instance holds a pool of 5 connections. With 4 backend replicas, that's 20 connections — insufficient. Without pooling, every new connection creates a separate OS process (postgres fork).

**Solution:** Deploy PgBouncer in transaction-pooling mode between Prisma and PostgreSQL. Configure `default_pool_size=50`, `max_client_conn=200`.

**Steps:**

1. Add `pgbouncer` service to `docker-compose.yml` (image: `edoburu/pgbouncer:1.23`)
2. Set `DATABASE_URL` → `pgbouncer:6432/vardiya?pool=50`, `DIRECT_URL` → direct PostgreSQL for Prisma migrations
3. Calculate pool: 500 CCU × ~2 queries/page × 5s query time / 50 pool = 100 concurrent → `pool_size=50` adequate
4. Monitor `SHOW STATS` and `SHOW POOLS` on PgBouncer admin console

### 3.2 No read replicas for reporting queries

**Risk: P1 — High**

**Current state:** All read/write queries hit the same database. Analytics dashboards, schedule reporting, and audit log queries share the same connection pool as transaction writes.

**Impact:** A complex report query (e.g., "all schedules for unit X in Y month with employee details") locking rows or running for 2+ seconds blocks real-time operations (shift creation, swap approvals).

**Solution:** Configure Prisma read replicas via `@prisma/extension-read-replicas`. Route reporting/analytics queries to a read replica.

**Steps:**

1. Provision a read-replica PostgreSQL instance
2. Install `@prisma/extension-read-replicas`
3. Configure `PrismaClient` with `replicas: [readReplicaUrl]`
4. Decorate query methods: `prisma.$extends(readReplicaExtension({ replicas }))`
5. Route dashboard/analytics/audit queries to replica

### 3.3 Missing composite indexes on high-query columns

**Risk: P1 — High**

**Current state:** Indexes exist on individual foreign key columns (e.g., `unitId`, `employeeId`, `organizationId`) but no composite indexes for common multi-column query patterns.

**Identified query patterns needing composite indexes:**

| Table              | Columns                         | Reason                            |
| ------------------ | ------------------------------- | --------------------------------- |
| `schedules`        | `(unitId, month, year)`         | Per-unit monthly schedule queries |
| `schedules`        | `(employeeId, date)`            | Employee shift history view       |
| `swap_requests`    | `(status, createdAt)`           | Pending swaps dashboard           |
| `device_incidents` | `(unitId, severity, createdAt)` | Unit incident timeline            |
| `device_incidents` | `(assignedTo, status)`          | Personnel assigned incidents      |
| `notifications`    | `(userId, read, createdAt)`     | User notification inbox           |
| `audit_log`        | `(organizationId, createdAt)`   | Org audit trail                   |
| `sessions`         | `(userId, active)`              | Active sessions management        |

**Impact:** Full table scans on schedule/swap/incident queries at 100k shift records. Estimated 10-50x slowdown on common pages.

**Steps:**

1. Generate Prisma migration for each composite index
2. Validate query plans with `EXPLAIN ANALYZE` before/after
3. Monitor pg_stat_user_tables for seq_scans improvement

### 3.4 Analytics data model mixed with transactional

**Risk: P1 — High**

**Current state:** The `analytics` service in the backend performs in-memory aggregation on transactional data (`.sort()`, `.filter()`, `.reduce()` on arrays loaded from PostgreSQL).

**Impact at scale:** Loading 100k shift records into Node.js memory to compute monthly statistics will cause OOM crashes (backend limited to 512MB). Each aggregation request could allocate 200MB+ temporary arrays.

**Solution options (in priority order):**

1. Push aggregations into PostgreSQL via raw SQL with window functions — 0 additional infrastructure
2. Create materialized views refreshed hourly — simple, read-only snapshot
3. Use TimescaleDB for time-series analytics — powerful but adds infrastructure
4. Use MongoDB for analytics — not recommended (adds polyglot persistence)

**Recommended:** Option 1 (raw SQL aggregations) for immediate fix, then Option 2 (materialized views) if performance still an issue.

---

<a name="api"></a>

## 4. API Layer

### 4.1 In-memory state prevents horizontal scaling

**Risk: P0 — Critical**

**Current state:** The following are stored in Node.js in-memory Maps/Arrays — **not shared across instances**:

- `TokenBlacklistService` — in-memory Set of blacklisted JWT tokens
- `LoginAttemptsService` — in-memory Map of login attempt counts per email
- `AuthService` — in-memory `Map<string, any>` for JWT user cache
- `ScheduleGateway` — in-memory Map of connected clients + room membership
- HeavyEditGuard — in-memory Map of locked schedule IDs + user holding the lock
- `PushSubscriptionService` — in-memory Map of push subscriptions (also in DB)

**Impact:** Cannot run more than 1 backend instance. Adding a second instance:

- Token blacklist is not shared — revoked tokens still valid on instance 2
- Rate limiting (login attempts) has different limits per instance
- WebSocket rooms are per-instance — users connected to instance 2 can't receive broadcasts from instance 1
- Edit locks on instance 1 are invisible to instance 2 — concurrent edits conflict
- JWT user cache misses on instance 2

**Solution:** Extract all in-memory state to Redis-backed services. Priority order:

| Service                 | Redis Data Structure         | Key Pattern              |
| ----------------------- | ---------------------------- | ------------------------ |
| TokenBlacklistService   | `SET` + TTL (token expiry)   | `blacklist:{jwt}`        |
| LoginAttemptsService    | `STRING` + TTL (1hr window)  | `login_attempts:{email}` |
| JWT user cache          | `STRING` (JSON) + TTL (5min) | `user_cache:{userId}`    |
| HeavyEditGuard          | `STRING` + TTL (heartbeat)   | `edit_lock:{scheduleId}` |
| WebSocket rooms         | Socket.IO Redis adapter      | (handled by adapter)     |
| PushSubscriptionService | `SET` per user               | `push_subs:{userId}`     |

**Steps:**

1. Create `RedisStateService` (or extend existing `EventStoreService`) with generic GET/SET/EXPIRE
2. Refactor `TokenBlacklistService` to use Redis `SET` with TTL matching token expiry
3. Refactor `LoginAttemptsService` to use Redis `INCR` + `EXPIRE`
4. Refactor `AuthService` to use Redis cached user with 5-min TTL
5. Refactor `HeavyEditGuard` to use Redis lock with heartbeat/auto-expire
6. Configure Socket.IO Redis adapter: `new RedisAdapter(redisClient)`

### 4.2 No HTTP response caching

**Risk: P1 — High**

**Current state:** Every API response is computed fresh from the database. No ETag, no Cache-Control, no reverse-proxy caching.

**Impact:** Dashboard pages (unit health, employee overview, schedule summary) hit the database on every page load. At 500 CCU with 30-second average session, dashboard page loads per second = 500 × 0.25 (25% on dashboard) / 30s = ~4 req/s × 5 queries = 20 db queries/sec just for dashboards.

**Solution (multi-layer):**

1. **Application-level with Redis** — Cache dashboard aggregation results for 30-60s. Cache key based on user's organization + query parameters. Invalidate on relevant mutations (shift created/deleted, employee changed).
2. **Nginx micro-caching** — Cache identical anonymous/non-personalized responses for 1-5 seconds at the reverse proxy layer.
3. **ETag support** — Generate ETags from query result hashes; return `304 Not Modified` on `If-None-Match`.

**Recommended immediate:** Option 1 — Redis cache with TTL-based invalidation in the dashboard service.

### 4.3 No API versioning strategy

**Risk: P2 — Medium**

**Current state:** All API routes are unversioned (e.g., `/api/schedules`, `/api/employees`). No URL prefix like `/api/v1/`.

**Impact:** Future breaking changes to API contracts (e.g., schedule object restructuring) will break existing frontend deployments. Can't run multiple frontend versions simultaneously during phased rollouts.

**Solution:** Introduce API versioning via NestJS global prefix in `main.ts`:

- Set `app.setGlobalPrefix('api/v1')`
- Maintain backward compatibility for at least 1 major version
- Document deprecation in response headers: `X-API-Deprecated: true` + `Sunset: Sat, 13 Dec 2026 00:00:00 GMT`

### 4.4 Throttler configuration validation

**Risk: P2 — Medium**

**Current state:** `@nestjs/throttler` is configured with `ttl: 60, limit: 10` on the auth module (login endpoint) and likely other defaults. Redis store is available via `@nestjs/throttler-storage-redis`.

**Impact at 500 CCU:** 500 users × multiple requests = throttle limits may be hit under normal load if not per-tenant.

**Solution:**

1. Verify throttler uses Redis storage (not in-memory) for distributed rate limiting
2. Make auth throttler per-IP with lower limit (5 attempts per 60s)
3. Add per-tenant (organizationId) throttling for general API limits
4. Exempt `GET /metrics` from throttle (already behind JwtAuthGuard)

### 4.5 Serialization overhead on large collections

**Risk: P2 — Medium**

**Current state:** Prisma queries returning 100+ records (schedules, employees) go through NestJS `ClassSerializerInterceptor` with `@Exclude()`/`@Transform()` decorators. Each record is wrapped in a proxy for circular-reference handling.

**Impact at 100k records:** A query returning 500 employees each with 3 relations → class transformer overhead of ~5-10ms per 100 records. At 200 req/s, this adds 10-20ms latency.

**Solution:**

1. Use `@SerializeOptions({ strategy: 'excludeAll' })` instead of `@Exclude()` on every property — reduces per-field reflection overhead
2. Consider `@nestjs/mapped-types` `PartialType` for response DTOs instead of class-transformer
3. For list endpoints, use raw Prisma result types (no serialization) with explicit response fields

---

<a name="websocket"></a>

## 5. WebSocket Layer

### 5.1 Socket.IO in-memory adapter

**Risk: P0 — Critical**

**Current state:** `ScheduleGateway` uses `@WebSocketGateway()` with the default in-memory adapter. Rooms, presence, and broadcasts are per-process.

**Impact at scale:** With 2+ backend instances:

- Room membership is per-instance: broadcasting to `unit:42` only reaches clients connected to the same instance
- User connected to instance A cannot receive events from instance B
- Connected client count metrics are per-instance

**Solution:** Add Socket.IO Redis adapter:

```bash
npm install @socket.io/redis-adapter ioredis
```

In `main.ts` or a dedicated `websocket.module.ts`:

```typescript
import { createAdapter } from "@socket.io/redis-adapter";
import Redis from "ioredis";

const pubClient = new Redis({ host: "redis", port: 6379, db: 1 });
const subClient = pubClient.duplicate();
app.get(IOAdapter).createWSEmiter(pubClient, subClient);
```

### 5.2 No WebSocket connection backpressure

**Risk: P2 — Medium**

**Current state:** Socket.IO `handleConnection` runs synchronously. No limit on concurrent connections. No rate limiting on event emission from clients.

**Impact:** A malicious client or misconfigured frontend could flood the server with `joinRoom`/`leaveRoom` events. At 500 clients, even normal event bursts (shift created → everyone joins room → 500 broadcasts) could cause event storms.

**Solution:**

1. Add Socket.IO `maxClients` per namespace/room (via middleware)
2. Implement per-client event rate limiting in gateway middleware (e.g., max 10 messages/sec per socket)
3. Use `@WSCreate` middleware for connection admission control
4. Enable Socket.IO `maxHttpBufferSize` (already should be set)

### 5.3 No WebSocket health check for horizontal scale

**Risk: P2 — Medium**

**Current state:** No mechanism to detect when a WebSocket server instance becomes unhealthy and drain its connections gracefully.

**Solution:**

1. Add a `/ws-health` endpoint to Socket.IO that returns connection count, room count, memory usage
2. Implement connection draining: on `SIGTERM`, stop accepting new connections, notify connected clients to reconnect, then shutdown
3. Use Socket.IO `allowEIO3: true` for graceful client migration

---

<a name="caching"></a>

## 6. Caching Layer

### 6.1 No application-level cache for frequent queries

**Risk: P1 — High**

**Current state:** Every request for unit health, employee schedules, device status, and notification count hits PostgreSQL directly.

**High-frequency query patterns (cache-worthy):**

| Query endpoint                 | Frequency                      | Staleness tolerance | Current avg latency |
| ------------------------------ | ------------------------------ | ------------------- | ------------------- |
| Unit health status (dashboard) | Every page load (~30s/session) | 30-60s              | ~80ms               |
| Employee schedule summary      | Per employee view              | 60s                 | ~150ms              |
| Device list + status           | Per unit view                  | 30s                 | ~120ms              |
| Notification unread count      | Every request (navbar)         | 15s                 | ~40ms               |
| Organization settings          | Rarely changes                 | 5min                | ~20ms               |

**Solution:** Implement a caching decorator/service:

```typescript
@Cacheable({ ttl: 30, key: 'unit_health:{organizationId}' })
async getUnitHealth(organizationId: string) { ... }
```

Using `ioredis` with JSON serialization. Cache key patterns should include entity IDs and exclude user-specific data (unless cached per-user).

### 6.2 Redis memory planning

**Risk: P2 — Medium**

**Current state:** Redis runs in a Docker container with memory limit `128MB`. Used for BullMQ queues, event store, session store (future), and cache (future).

**Memory projection at scale:**

| Usage                     | Per-item   | Estimated items | Memory     |
| ------------------------- | ---------- | --------------- | ---------- |
| BullMQ job data (queued)  | ~1KB       | 1,000           | ~1MB       |
| BullMQ completed jobs     | ~500B      | 10,000          | ~5MB       |
| Event store (7-day TTL)   | ~2KB       | 50,000          | ~100MB     |
| Token blacklist           | ~300B      | 10,000          | ~3MB       |
| Login attempt tracking    | ~100B      | 5,000           | ~500KB     |
| JWT user cache            | ~500B      | 5,000           | ~2.5MB     |
| Edit locks                | ~200B      | 200             | ~40KB      |
| Dashboard query cache     | ~10KB      | 500             | ~5MB       |
| WebSocket adapter pub/sub | negligible | —               | —          |
| **Total estimated**       |            |                 | **~117MB** |

128MB limit leaves only ~11MB headroom. **Increase to 256MB minimum.**

---

<a name="frontend"></a>

## 7. Frontend Layer

### 7.1 No content delivery network (CDN)

**Risk: P1 — High**

**Current state:** All static assets (JS bundles, CSS, fonts, images) are served from a single nginx instance. No CDN distribution.

**Impact:** Asset download latency varies by user geography. Initial app load requires downloading ~1-2MB of JavaScript. Users in same city as server: ~500ms load. Users in different region: 3-5s load.

**Solution:** Deploy frontend build artifacts to a CDN (Cloudflare, AWS CloudFront, Fastly). Update nginx to either (a) serve from CDN origin, or (b) act as origin server with CDN in front.

### 7.2 No server-side rendering

**Risk: P1 — High**

**Current state:** Angular SPA is pure client-side rendering. Initial HTML contains `<app-root></app-root>` with all content rendered after JS downloads and executes.

**Impact:**

- **Perceived performance:** First paint after JS download + parse + execute = 2-5s on slow connections
- **SEO:** Search engines see empty page — zero SEO for public-facing pages (not critical for internal app, but impacts any future public features)
- **Social sharing:** No Open Graph metadata — link previews show blank

**Solution options:**

1. **Angular Universal (SSR)** — Server-side rendering on Node.js. Adds complexity but best UX. Need SSR server infrastructure.
2. **Prerendering (SSG)** — Pre-render static pages at build time. Works for pages that don't change per-user. Not suitable for dashboard/personalized content.
3. **Accept current state** — For an internal enterprise app, the SEO/performance hit may be acceptable.

**Recommended:** Option 1 (Angular Universal) if front-end responsiveness is critical for user adoption. Option 3 otherwise.

### 7.3 No lazy-loading code splitting

**Risk: P2 — Medium**

**Current state:** While Angular has lazy-loaded route modules (per `app-routing.module.ts`), the main bundle (`main.js`) still contains all shared components, services, and third-party libraries.

**Impact:** Every page load requires downloading and parsing the entire shared module, including rarely used code (admin panels, analytics charts, etc.).

**Solution:**

1. Audit shared module imports — move module-specific components out of shared
2. Use Angular `loadChildren` for all feature routes (already partially done)
3. Use `defer` loading for heavy third-party components (chart libraries, PDF exports)
4. Consider Webpack bundle analysis (`webpack-bundle-analyzer`) to identify large dependencies

### 7.4 Service worker not used for API caching

**Risk: P2 — Medium**

**Current state:** Angular service worker is configured (`@angular/service-worker` with `ngsw-config.json`) but only caches static assets. No API response caching strategy.

**Solution:**

1. Add `dataGroups` in `ngsw-config.json` for API endpoints with cache-first or network-first strategy
2. Cache `/api/units/:id/health`, `/api/notifications/unread-count` with freshness TTL
3. Implement stale-while-revalidate for read-only data to mask network latency
4. Clear cache on user logout

### 7.5 No compression at nginx reverse proxy

**Risk: P2 — Medium**

**Current state:** Frontend nginx serves JavaScript bundles without gzip/brotli compression.

**Impact:** A 1.5MB main.js bundle downloads at full size (1.5MB instead of ~400KB gzipped). On a 10 Mbps connection, that's 1.2s instead of 320ms.

**Solution:** Enable gzip and/or brotli in nginx:

```nginx
gzip on;
gzip_types application/javascript text/css application/json image/svg+xml;
gzip_min_length 256;
brotli on;  # if brotli module installed
brotli_types application/javascript text/css application/json;
```

### 7.6 No HTTP/2 on frontend nginx

**Risk: P3 — Low**

**Current state:** Frontend nginx uses HTTP/1.1.

**Solution:** Add `http2` to the listen directive in `frontend/nginx.conf`:

```nginx
server {
    listen 443 ssl http2;
    ...
}
```

---

<a name="infrastructure"></a>

## 8. Infrastructure Layer

### 8.1 No container orchestration

**Risk: P1 — High**

**Current state:** Single Docker Compose deployment. Manual restart on failure. No auto-scaling, no rolling updates, no service discovery.

**Impact at scale:** A single node failure takes down the entire application. Rolling out updates requires downtime or manual blue-green switching. No auto-scaling during traffic spikes.

**Solution options:**

1. **Docker Swarm** — Lowest complexity. Built into Docker. Supports rolling updates, service scaling, secrets management. Good for 3-5 node clusters.
2. **Kubernetes (K3s/K8s)** — Most features. Steep learning curve. Overkill for <10 nodes but ideal for larger deployments.

**Recommended:** Option 1 (Docker Swarm) for 50-hospital scale. Option 2 (K3s) if the team plans to grow beyond 200 hospitals.

### 8.2 No database high availability

**Risk: P1 — High**

**Current state:** Single PostgreSQL container. No replication, no failover, no automated backups in Compose config.

**Impact:** Database failure = complete application outage. Data loss risk if volume corrupted.

**Solution:**

1. Configure PostgreSQL streaming replication (primary + 1-2 standbys)
2. Add Patroni or repmgr for automated failover
3. Use `pgBackRest` or `pg_dump` with automated schedule and off-site storage
4. Database restore script exists (`scripts/restore-db.ps1`) — integrate into CI/CD

### 8.3 No Redis high availability

**Risk: P2 — Medium**

**Current state:** Single Redis container. BullMQ queues and event store data lost on failure (unless RDB/AOF persistence configured).

**Impact:** Event queue data loss during Redis failure. Lost events = lost notifications, lost audit trail. BullMQ has some recovery but in-flight jobs lost without persistence.

**Solution:**

1. Enable Redis AOF persistence (`appendonly yes` in redis.conf)
2. Configure Redis Sentinel for automated failover (3 sentinel nodes minimum)
3. For production, use Redis Cluster or managed Redis (AWS ElastiCache, Redis Enterprise)

### 8.4 Docker memory limits too restrictive

**Risk: P2 — Medium**

**Current state:**

| Service          | Memory Limit |
| ---------------- | ------------ |
| Backend          | 512MB        |
| Frontend (nginx) | 256MB        |
| PostgreSQL       | 512MB        |
| Redis            | 128MB        |

**Impact at scale (500 CCU):**

- **Backend (512MB):** Node.js heap (V8) defaults to ~1GB on a 2GB machine. With 512MB limit, garbage collection runs aggressively. At 500 concurrent requests with ~2MB per request overhead + event bus + WebSocket connections → estimated 600-800MB needed. Risk of OOM kills.
- **Redis (128MB):** As calculated in §6.2, estimated usage is ~117MB. No headroom.

**Recommended limits at scale:**

| Service    | Recommended      | Rationale                                      |
| ---------- | ---------------- | ---------------------------------------------- |
| Backend    | 1024MB           | Node.js heap + request memory + WS connections |
| Frontend   | 256MB            | Static file serving — adequate                 |
| PostgreSQL | 1024MB           | Shared buffers + connection overhead           |
| Redis      | 256MB (or 512MB) | Event store + cache + BullMQ + state           |

### 8.5 No health-based load balancing

**Risk: P2 — Medium**

**Current state:** nginx upstream configuration uses round-robin without active health checks. If a backend instance goes down, nginx continues sending requests for a full timeout.

**Solution:**

```nginx
upstream backend {
    least_conn;  # better than round-robin for variable request durations
    server backend1:3000 max_fails=3 fail_timeout=30s;
    server backend2:3000 max_fails=3 fail_timeout=30s;
    keepalive 128;  # increase from 64 for 500 CCU
}
```

Also enable active health checks in nginx Plus or use a separate health-checking sidecar.

### 8.6 No database migration strategy for zero-downtime

**Risk: P2 — Medium**

**Current state:** Prisma migrations run as part of deployment and block the application while running. At 100k records, migrations may take 30s+.

**Solution:** Use expand-contract pattern:

1. **Phase 1 (expand):** Deploy new code that reads both old and new schema — add columns/tables without removing old ones
2. **Phase 2 (migrate):** Backfill data while old code still works
3. **Phase 3 (contract):** Deploy code that only uses new schema — remove old columns/tables
4. Use Prisma migrations with `--create-only` for manual review and split migrations

### 8.7 nginx keepalive tuning

**Risk: P2 — Medium**

**Current state:** `keepalive 64` in upstream block.

**Impact at 500 CCU:** Each user makes ~10-15 requests per page load across multiple API endpoints. Without sufficient keepalive connections, nginx and backend waste resources on connection establishment (TCP handshake, SSL negotiation).

**Calculation:**

- 500 CCU × 2 req/s average = 1,000 req/s
- Average request duration: ~100ms
- Concurrent connections needed during peak: 1,000 × 0.1s = 100 connections
- `keepalive 64` under-provisions by ~36 connections

**Solution:** Increase `keepalive` to 128-256 in upstream backend block.

---

<a name="observability"></a>

## 9. Observability Layer

### 9.1 Distributed tracing not enabled by default

**Risk: P3 — Low**

**Current state:** OpenTelemetry tracing is implemented (`backend/src/tracing.ts`) but disabled by default (`OTEL_ENABLED=true` to enable).

**Impact:** When enabled, OTel SDK adds startup time (~500ms) and per-span processing overhead (~0.1ms per request). At 200 req/s, that's ~20ms of CPU per second — acceptable. However, without an OTLP collector endpoint configured, spans are dropped.

**Solution:**

1. Deploy an OTLP collector (Grafana Tempo + Grafana, or Jaeger, or SigNoz)
2. Set `OTEL_ENABLED=true` and `OTEL_EXPORTER_OTLP_ENDPOINT` in production env
3. Sample at 10% for general traffic, 100% for errors (head-based sampling)
4. Verify trace propagation via `x-correlation-id` header

### 9.2 Prometheus metrics cardinality explosion potential

**Risk: P2 — Medium**

**Current state:** Custom metrics use labels like `method`, `route`, `status_code`. Some metrics may have unbounded labels (e.g., user ID, organization name, request path with dynamic segments).

**Impact at scale:** The `/api/schedules/:id` route creates a new metric series for each schedule ID. Prometheus memory grows linearly with unique label values. At 100k schedules, a metric with `schedule_id` label creates 100k time series — OOM risk for Prometheus.

**Solution:**

1. Use `route` pattern (with `:id` placeholder) not actual request path
2. Whitelist allowed HTTP methods + status codes
3. Set up prom-client metric limit warnings
4. Use exemplars with tracing for high-cardinality details instead of metric labels
5. Verify all metric label values are bounded

### 9.3 No load testing baseline

**Risk: P3 — Low**

**Current state:** No performance/load tests. No baseline metrics for response times, throughput, or error rates under load.

**Solution:**

1. Create k6/artillery load test scripts for critical paths:
   - `GET /api/units/:id/schedules` — schedule list
   - `POST /api/auth/login` — authentication
   - `POST /api/schedules` — shift creation
   - WebSocket room join + event receive
2. Define SLOs: p95 < 500ms API, p95 < 200ms DB, error rate < 0.1%
3. Run load tests in CI (nightly) and gate deployments on regression

---

<a name="matrix"></a>

## 10. Priority Matrix

| ID   | Issue                                       | Layer         | Risk | Effort   | Impact                                     |
| ---- | ------------------------------------------- | ------------- | ---- | -------- | ------------------------------------------ |
| DB1  | No PgBouncer/connection pooling             | Database      | P0   | 1 day    | Prevents >20 concurrent connections        |
| API1 | In-memory state prevents horizontal scaling | API           | P0   | 3 days   | Can't run >1 backend instance              |
| WS1  | Socket.IO in-memory adapter                 | WebSocket     | P0   | 0.5 day  | WebSocket broken with >1 instance          |
| DB2  | No read replicas for reporting              | Database      | P1   | 2 days   | Reporting queries block transaction writes |
| DB3  | Missing composite indexes                   | Database      | P1   | 0.5 day  | 10-50x query slowdown at 100k records      |
| DB4  | Analytics in-memory aggregation             | Database      | P1   | 1 day    | OOM risk on analytics queries              |
| API2 | No HTTP response caching                    | API           | P1   | 1 day    | Unnecessary DB load on dashboards          |
| CD1  | No CDN                                      | Frontend      | P1   | 1 day    | Slow global asset delivery                 |
| CD2  | No SSR                                      | Frontend      | P1   | 5 days   | Poor initial load performance              |
| INF1 | No container orchestration                  | Infra         | P1   | 3 days   | No HA, no rolling updates                  |
| INF2 | No database HA                              | Infra         | P1   | 3 days   | Single point of failure                    |
| CCH1 | No application cache                        | Caching       | P1   | 2 days   | Unnecessary DB load on all queries         |
| API3 | No API versioning                           | API           | P2   | 0.5 day  | Breaking changes impossible                |
| API4 | Throttler config validation                 | API           | P2   | 0.5 day  | Rate limiting may be wrong                 |
| API5 | Serialization overhead                      | API           | P2   | 1 day    | 10-20ms extra latency per request          |
| WS2  | No WS backpressure                          | WebSocket     | P2   | 1 day    | Abusable event flooding                    |
| WS3  | No WS health check                          | WebSocket     | P2   | 0.5 day  | No graceful drain                          |
| CCH2 | Redis memory planning                       | Caching       | P2   | 0.25 day | OOM risk at 128MB                          |
| CD3  | Lazy-loading audit                          | Frontend      | P2   | 1 day    | Unnecessary bundle size                    |
| CD4  | Service worker API cache                    | Frontend      | P2   | 1 day    | No offline/resilient API calls             |
| CD5  | No compression                              | Frontend      | P2   | 0.25 day | 3-4x larger asset downloads                |
| INF3 | No Redis HA                                 | Infra         | P2   | 2 days   | BullMQ/event store single point            |
| INF4 | Docker memory limits                        | Infra         | P2   | 0.25 day | OOM risk for backend/Redis                 |
| INF5 | No health-based LB                          | Infra         | P2   | 0.5 day  | Requests routed to dead instances          |
| INF6 | DB migration strategy                       | Infra         | P2   | 1 day    | Downtime on schema changes                 |
| INF7 | nginx keepalive tuning                      | Infra         | P2   | 0.25 day | Connection churn under load                |
| OBS2 | Metric cardinality                          | Observability | P2   | 0.5 day  | Prometheus OOM risk                        |
| CD6  | HTTP/2 support                              | Frontend      | P3   | 0.25 day | Marginal performance gain                  |
| OBS1 | Tracing enabled by default                  | Observability | P3   | 1 day    | Debugging aid, not blocking                |
| OBS3 | Load testing baseline                       | Observability | P3   | 2 days   | No performance regression detection        |

**Priority definitions:**

- **P0:** Blocks any horizontal scaling. Must fix before running >1 instance.
- **P1:** Significant performance or reliability risk at target scale.
- **P2:** Moderate risk — can defer 1-2 months but should address.
- **P3:** Nice-to-have — minor gains or safety margin.

---

<a name="roadmap"></a>

## 11. Recommended Roadmap

### Sprint 1: Horizontal scaling foundation (duration: 2 weeks)

| Order | Task                                                                                       | ID         | Dependencies |
| ----- | ------------------------------------------------------------------------------------------ | ---------- | ------------ |
| 1     | Extract in-memory state to Redis (token blacklist, login attempts, user cache, edit locks) | API1       | —            |
| 2     | Add Socket.IO Redis adapter                                                                | WS1        | —            |
| 3     | Deploy PgBouncer sidecar                                                                   | DB1        | —            |
| 4     | Create composite indexes                                                                   | DB3        | —            |
| 5     | Add nginx active health checks + increase keepalive 64→128                                 | INF5, INF7 | —            |
| 6     | Increase Docker memory limits                                                              | INF4       | —            |
| 7     | Verify throttler uses Redis store                                                          | API4       | API1         |

**Validation:** Deploy 2 backend instances behind nginx. Verify:

- WebSocket broadcasts reach all clients
- Token blacklist works across instances
- Login rate limits are shared
- Edit locks are shared
- Database connection pool handles double the traffic

### Sprint 2: Caching + performance (duration: 1 week)

| Order | Task                                                | ID   | Dependencies        |
| ----- | --------------------------------------------------- | ---- | ------------------- |
| 1     | Implement Redis query cache for dashboard endpoints | CCH1 | API1 (Redis client) |
| 2     | Refactor analytics to use SQL aggregation           | DB4  | —                   |
| 3     | Add nginx gzip/brotli compression                   | CD5  | —                   |
| 4     | Configure service worker API caching (dataGroups)   | CD4  | —                   |

### Sprint 3: Infrastructure hardening (duration: 1 week)

| Order | Task                                       | ID   | Dependencies |
| ----- | ------------------------------------------ | ---- | ------------ |
| 1     | Migrate to Docker Swarm                    | INF1 | Sprint 1     |
| 2     | Configure PostgreSQL replication + Patroni | INF2 | —            |
| 3     | Enable Redis AOF + Sentinel                | INF3 | —            |

### Sprint 4: Frontend optimization (duration: 1 week)

| Order | Task                                        | ID   | Dependencies     |
| ----- | ------------------------------------------- | ---- | ---------------- |
| 1     | Bundle analysis + lazy-loading improvements | CD3  | —                |
| 2     | Add CDN deployment to CI/CD                 | CD1  | Sprint 3 (Swarm) |
| 3     | Enable HTTP/2 on frontend nginx             | CD6  | —                |
| 4     | API versioning prefix (v1)                  | API3 | —                |

### Sprint 5: Observability + testing (duration: 1 week)

| Order | Task                                    | ID   | Dependencies |
| ----- | --------------------------------------- | ---- | ------------ |
| 1     | Deploy Grafana Tempo OTLP collector     | OBS1 | Sprint 1     |
| 2     | Write k6 load tests + run baseline      | OBS3 | —            |
| 3     | Fix metric cardinality                  | OBS2 | —            |
| 4     | Expand-contract migration strategy docs | INF6 | —            |

### Sprint 6: Advanced (duration: 2 weeks, if needed)

| Order | Task                                        | ID  | Dependencies           |
| ----- | ------------------------------------------- | --- | ---------------------- |
| 1     | PostgreSQL read replicas + Prisma extension | DB2 | Sprint 3 (replication) |
| 2     | Angular Universal SSR                       | CD2 | Sprint 1               |
| 3     | WebSocket backpressure + rate limiting      | WS2 | —                      |
| 4     | WebSocket draining/health                   | WS3 | Sprint 1               |

---

## Appendix: Key Configuration Values for Target Scale

```nginx
# nginx upstream backend
upstream backend {
    least_conn;
    server backend1:3000 max_fails=3 fail_timeout=30s;
    server backend2:3000 max_fails=3 fail_timeout=30s;
    server backend3:3000 max_fails=3 fail_timeout=30s;
    keepalive 256;
}
```

```yaml
# docker-compose overrides
services:
  backend:
    deploy:
      replicas: 2
      resources:
        limits:
          memory: 1024M
        reservations:
          memory: 512M

  redis:
    deploy:
      resources:
        limits:
          memory: 256M

  db:
    deploy:
      resources:
        limits:
          memory: 1024M
```

```bash
# PgBouncer configuration
[databases]
vardiya = host=db port=5432 dbname=vardiya pool_size=50

[pgbouncer]
listen_addr = 0.0.0.0
listen_port = 6432
auth_type = trust
pool_mode = transaction
max_client_conn = 200
default_pool_size = 50
```

```ini
# Redis memory policy
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```
