# Phase 4: Performance, Connection Pool & Cache Strategy

This document covers performance baselines (F76), database connection management (F78),
cache strategy (F79), and Redis key naming conventions (F80).

---

## F76: Performance Baseline

Target latencies for core operations under normal load (single instance, production-sized data):

| Operation           | Expected Latency | Measurement Point                           |
| ------------------- | ---------------- | ------------------------------------------- |
| Login               | < 200ms          | `POST /auth/login`                          |
| Schedule load       | < 500ms          | `GET /schedules-ddd/:id`                    |
| Assignment mutation | < 300ms          | `POST/PATCH /schedules-ddd/:id/assignments` |
| Schedule generation | < 30s            | `POST /schedules-ddd/:id/jobs/generate`     |
| Validation          | < 2s             | `POST /schedules-ddd/:id/validate`          |
| Publish             | < 1s             | `POST /schedules-ddd/:id/publish`           |
| Audit write         | < 50ms           | Async via event bus                         |

Notes:

- Latency targets refer to server-side processing time (excluding network transit).
- Schedule generation is an asynchronous job; the 30s budget applies to job execution,
  not the HTTP response acknowledging it.
- Audit writes are decoupled from request handling through the event bus; slow audit
  consumers must never block the primary operation.
- Regression against these targets should be verified with load tests before each release.

---

## F78: Database Connection Management

Connection pooling rules for PostgreSQL via Prisma:

- **Prisma default pool:** 10 connections (development). Production should use **25**.
- **With PgBouncer:** set `connection_limit=25` in `DATABASE_URL`.
- **Migrations:** use a separate `DATABASE_DIRECT_URL` that bypasses PgBouncer
  (PgBouncer transaction mode is incompatible with some migration statements).
  Use `connection_limit=5` on the direct URL.
- **Multiple instances:** total pool = `instances × pool_size`. Ensure the database's
  `max_connections` is greater than or equal to the computed total, plus headroom for
  admin/superuser connections.
- **Monitoring:**
  - `pg_stat_activity` — track live connection count.
  - Watch for `idle in transaction` sessions; long-lived idle-in-transaction
    connections hold locks and bloat vacuum backlog.

Example URL parameters:

```
DATABASE_URL=postgresql://user:pass@pgbouncer-host:6432/db?connection_limit=25
DATABASE_DIRECT_URL=postgresql://user:pass@db-host:5432/db?connection_limit=5
```

---

## F79: Cache Strategy

- **Current state:** `RedisCacheModule` is scaffolded but **NOT wired** — no active
  caching exists in the application today.
- **Recommendation:** Do **NOT** add caching for schedule data. Schedules are
  authoritative state that must be real-time; serving stale schedules would cause
  correctness bugs (double assignments, lost edits).
- **Safe to cache:**
  - Public holidays — stable data, read-heavy access pattern.
  - Personnel names — rarely change, frequently displayed.
  - Device metadata — static configuration-like information.
- **If caching is added later:**
  - Use a Redis-backed `CacheModule` (not in-memory) so all instances share cache.
  - TTL of 5 minutes for master data.
  - Invalidate explicitly on mutation; do not rely on TTL alone.
- **Schedule lock / edit locks:** already implemented with Redis via the concurrency
  service. This is distributed locking, not caching — out of scope for cache TTL policy.

---

## F80: Redis Key Naming

All Redis keys follow a namespaced format:

```
vardiya:{namespace}:{identifier}
```

### Namespaces

| Namespace       | Purpose                                 |
| --------------- | --------------------------------------- |
| `lock`          | Distributed locks (schedule edit locks) |
| `throttle`      | Throttler storage                       |
| `jwt:blacklist` | Revoked/blacklisted JWT tokens          |
| `session`       | Session state                           |
| `cache`         | General-purpose cached data             |
| `queue`         | Queue-related keys                      |
| `ratelimit`     | Rate limiting counters                  |
| `ws:conn`       | WebSocket connection tracking           |
| `csrf`          | CSRF token storage                      |
| `lockout`       | Account lockout tracking                |

### Status

- Existing keys already follow this pattern (the lock service uses the `lock:` prefix;
  the throttler stores its counters in Redis under its own namespace).
- No key collision risk exists between subsystems because each owns a distinct namespace.
- New Redis-backed features MUST adopt this format and register their namespace here
  before introducing new keys.
