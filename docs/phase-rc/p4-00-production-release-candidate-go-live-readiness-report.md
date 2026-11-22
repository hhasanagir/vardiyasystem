# P4.0 — Production Release Candidate: Go-Live Readiness Report

**Status:** P4.0 = COMPLETE — **GO** (conditional on the CI-only steps listed in §6)
**Date:** 2026-09-29
**Scope decision:** Verify the *shipped* production topology — the exact `docker-compose.prod.yml`
artefact — end to end on a Docker host. Earlier phases validated tests and the browser product; none
had ever booted the actual production compose file, proxied the real `nginx` edge, or exercised the
backup/restore pair against the release database. P4.0 exists to close exactly that gap before
anything is pushed.

---

## 1. Motivation

The go-live decision turns on one question the regression gates cannot answer by themselves: *does
the assembled release, as shipped in `docker-compose.prod.yml`, actually boot and serve on a clean
Docker host?* The unit, backend-E2E and browser gates (§4) run against the dev layout — a separate
`postgres:15`, a separate listener set, no `pgbouncer`, no `nginx` edge, no named secrets. P4.0
therefore:

- rendered the production compose file with real generated secrets and a smoke-only env;
- launched the full stack on remapped ports (`vardiyasmoke-*`), with `postgres` at `15432`,
  `redis` at `16379`, `pgbouncer` at `16432`, `backend` at `13000`, `frontend` at `18080`;
- probed the edge exactly the way a browser and a realtime client do;
- ran the release `startup-verifier`, the `backup-db.sh` / `verify-backup.sh` pair, the preflight
  script, and the kustomize render;
- re-ran the three regression gates to their final numbers (§4).

Every blocker found was fixed in the product itself, re-built, and re-verified. The complete change
list for this release candidate is §3.

## 2. Production topology under test

| Component | Image / version | Smoke port | Cross-check |
| --- | --- | --- | --- |
| postgres | `postgres:15-alpine` | 15432 | 32 migrations applied; `pg_dump` restore verified |
| pgbouncer | `bitnamilegacy/pgbouncer:1.24.1-debian-12-r10` | 16432 | transaction pooling across the backend pool |
| redis | `redis:7-alpine` | 16379 | used by Bull queues / throttler in production shape |
| backend | `vardiyasystem/backend:preflight-check` | 13000 | `/live` 200, `/ready` all-checks-ok |
| frontend | `vardiyasystem/frontend:preflight-check` | 18080 | SPA asset serving, `/socket.io/` proxying |
| startup-verifier | (run-once container) | — | exit 0, "PASS: Readiness check passed" |

Images were built from the repo root with the `preflight-builder` buildx instance (the default
builder on this host is broken and is ignored by the pipeline).

## 3. Defects found and fixed in the release candidate

### 3a. `ENCRYPTION_MASTER_KEY` was required but not wired (boot blocker, fixed)

`EncryptionService` throws unless the master key is set and at least 64 hex characters
(`backend/src/modules/encryption/encryption.service.ts`). No compose file, secret generator or
deploy script supplied it, so the production backend could not boot. Wired end to end:

- `docker-compose.prod.yml`: `encryption_master_key` external secret, listed on the backend service,
  exported as `ENCRYPTION_MASTER_KEY` in the command;
- `scripts/generate-secrets.sh`: new REQUIRED entry `encryption_master_key.txt` (hex) so a fresh
  secret set is always complete;
- `deploy.yml`: the deploy chain generates the key with `openssl rand -hex 32`;
- `secrets/README.md`: documented ("All seven files"); preflight fixture extended accordingly.

With the key present, the backend boots and `ready` reports every probe green.

### 3b. pgbouncer only ever pooled the "postgres" database (boot blocker, fixed)

The bitnami pgbouncer entrypoint keys the `[databases]` section off the `PGBOUNCER_DATABASE`
environment variable (image default `postgres`), not off `POSTGRESQL_DATABASE`. The compose file set
only the latter, so the pool advertised `dbname=postgres` and the backend failed with
`no such database: vardiyasystem`. Fixed by setting `PGBOUNCER_DATABASE: ${POSTGRES_DB:-vardiyasystem}`;
the generated `pgbouncer.ini` then reads
`[databases] vardiyasystem=host=postgres port=5432 dbname=vardiyasystem` and the backend's database
readiness probe passes through the pool.

### 3c. The frontend image served the nginx welcome page (asset packaging, fixed)

The Angular 21 build emits to `dist/frontend/browser`; the Dockerfile copied `dist/frontend`, so the
container served the stock nginx page instead of the SPA. Now `COPY --from=builder
/app/dist/frontend/browser /usr/share/nginx/html`. The edge serves the real title, deep links fall
back to the SPA (`/app/...` → 200), and unknown `/api/v1/*` paths return the backend's 404 instead of
an SPA fallback.

### 3d. `/socket.io/` was not proxied by nginx (realtime outage in production shape, fixed)

The client connects with `io(wsUrl + '/realtime')` — namespace `/realtime` over the default
engine.io path `/socket.io/`. nginx had no location for it, so the SPA fallback swallowed the
handshake with a 200 HTML page and the websocket never upgraded. `frontend/nginx.conf` now proxies
`/socket.io/` with correct upgrade headers, `limit_req` and 24h timeouts; polling handshake returns
200 with a `sid` and the websocket upgrade answers **101** through the edge.

### 3e. The readiness `memory` probe false-flagged on every boot (fixed)

`checkMemory` used the V8 heap ratio (`heapUsed/heapTotal`), which sits around 0.83 in a healthy,
unloaded process. `health.controller.ts` now reads the cgroup limit (`/sys/fs/cgroup/memory.max`
v2 / `memory.limit_in_bytes` v1) and warns only when resident RSS exceeds 90% of the container
limit, falling back to the heap ratio with a 256 MiB floor. After the fix `ready` reports
`"status":"ok"` (measured RSS 141 MiB against the image's 512 MiB cap).

### 3f. Frontend healthcheck used `localhost` (IPv6 trap, fixed)

The Docker healthcheck hit `http://localhost/health`, which resolves to `::1`; the nginx listener is
IPv4-only, so the probe failed with connection refused. It now targets `http://127.0.0.1/health` and
the container reports healthy.

### 3g. Backup and verification scripts could not read their own archives (fixed)

`backup-db.sh` piped `pg_dump` through `gzip` but `verify-backup.sh` (and the internal integrity
self-check) fed the gzip-wrapped PGDMP archive straight to `pg_restore --list`, which failed under
`set -e`. Both scripts now decompress to a temp file first, capture the TOC without `head`
(SIGPIPE), and clean up via `trap`. End-to-end on the smoke database: `backup-db.sh` exit 0
("Backup integrity check: PASSED"), `verify-backup.sh` exit 0 (gzip + pg_restore-read + 98 tables
with data).

### 3h. The backend E2E lockout test was timing-dependent (test-infra fix)

`e2e/auth.e2e-spec.ts`'s `resetThrottleBudget` cleared only `ThrottlerStorageService._storage`. In
`@nestjs/throttler` v6.7.1 the hit counters live in a second structure (`hitExpirations`), and
`pruneExpiredHits` resurrected them on the next login, so the 8-attempt loop hit 429 before the
lockout threshold. The reset now calls the public `onApplicationShutdown()` (clears both structures,
the sweep re-registers lazily). Verified: 9/9 in this file, 85/85 in the suite — no change to
production code.

### 3i. The CI preflight flag was not what the script read (CI-path fix)

`pr-validation.yml` invoked the preflight with `SKIP_ENVIRONMENT_CHECKS: '1'`, but
`release-preflight.mjs` only honoured `--skip-environment`, so the secret-contract check would run in
an environment with no secret files. The script now honours both
(`argv --skip-environment` or the `SKIP_ENVIRONMENT_CHECKS` env). Verified: 13/13 checks with the
env unset, 12/12 with it set (secret-contract excluded), 24/24 in the preflight test-suite.

## 4. Final gate evidence (all re-run on 2026-09-29)

| Gate | Command | Result |
| --- | --- | --- |
| Preflight tests | `node --test scripts/release-preflight.test.mjs` | 24/24 pass |
| Preflight checks (local secrets) | `node scripts/release-preflight.mjs` | 13/13 pass |
| Preflight checks (CI env) | `SKIP_ENVIRONMENT_CHECKS=1 node scripts/release-preflight.mjs` | 12/12 pass (secret-contract skipped) |
| Backend unit | `npm test` (backend) | **1172/1172** (104 files, exit 0) |
| Backend E2E | `npm run test:e2e` (backend) | **85/85** (10 files, exit 0) |
| Browser acceptance | `npm --prefix e2e test` | **44/44** (1 worker, exit 0) |
| Production boot smoke | production compose, all services | backend live 200 / ready ok, frontend healthy |
| Startup verification | `startup-verifier` container | exit 0, "Startup verification COMPLETED" |
| Backup/restore | `backup-db.sh` + `verify-backup.sh` | both exit 0; 86 KiB `.sql.gz`, 98 tables |
| kustomize render | `kubectl kustomize k8s` (+ sealed-secrets) | exit 0, 35 manifests (one `commonLabels` deprecation warning) |
| Build + lint gate | `npm run build`, `npm run typecheck` | clean; pre-existing baseline lint errors unchanged |

The single unit-suite flake seen earlier today (`5b3-performance-failure.spec.ts`, a 100 ms timing
assertion) passed 12/12 in isolation and the full suite is green; the browser-suite flake observed on
a loaded shared dev database (audit/personnel timing) was absent on a clean re-run (§5).

## 5. Findings that are not blockers

- **PostgreSQL versions are inconsistent between CI and the shipped artefact.** The release stack is
  `postgres:15-alpine` everywhere it actually deploys and where it was smoke-verified:
  `docker-compose.prod.yml`, `k8s/postgres-statefulset.yaml`, the Helm chart default
  (`infra/helm/vardiya-platform`, version `"15"`), the dev compose, and the smoke run. The CI test
  service containers in `deploy.yml` and `pr-validation.yml` use `postgres:17`. CI therefore never
  validates the exact major that ships. Recommendation for P4.1: point the CI service containers at
  `postgres:15-alpine` (or deliberately bump the whole artefact set to 17 and re-run smoke) — one
  line per workflow, no functional change expected; doing it at release time would add risk with no
  payoff, so it is deliberately parked.
- The browser suite runs against a shared dev database and is state-sensitive: a prior run's
  in-hour audit events can push the rapid-change suspicious panel past "exactly 1", and the
  personnel search assertion counts the roster before it converges. Both are harness-level
  sensitivities of long standing, not product regressions (they cleared on a clean re-run 44/44). A
  single JVM-style cleanup before the browser run is the only local prerequisite.

## 6. Decision: GO

All gates that can be executed from this environment are green, and every boot blocker found in the
*actual shipped compose file* was fixed, re-built and re-verified against the smoke stack. Release
readiness verdict: **GO**.

Two steps remain environment-bound and were only executable on the CI host, not locally:
- GHCR image push + the deploy workflow run with real sealed secrets (needs GitHub / cluster access);
- apply + reconcile on the target cluster (needs the cluster).

They are tracked as P4.1 items together with the postgres version alignment and the kustomize
`commonLabels` warning. If any of those CI-only runs fail, P4.0 reverts to NO-GO pending the fix —
this report's verdict covers everything verifiable off-pipeline.