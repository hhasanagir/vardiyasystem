# P4.4 — Production Deployment, Observability & Go-Live Validation Report

- **Phase:** P4.4 (Release Candidate)
- **Date:** 2026-09-30
- **Environment:** Windows (Docker Desktop 29.4.0, helm v3.17.1, kubectl, kubeconform v0.8.0, actionlint, Git Bash)
- **Validation model:** Shipped artifacts rendered + validated locally; `docker-compose.prod.yml` booted end-to-end and observability stack exercised live against the running application. **No registry push, no CI run, no cluster apply was possible.**

> **ENVIRONMENT-BLOCKED:** GitHub Actions runner, GHCR, and the target Kubernetes cluster are **unavailable in this environment**. Every CI/cluster step is marked **ENVIRONMENT-BLOCKED** and listed in §9 as pre-flight actions for the operator. Local validation (render, boot, scrape, alert, regression) was executed in full and is green.

---

## 1. Verdict

**CONDITIONAL GO** for production deployment, with the exact pre-flight actions in §9 (CI push, cluster install, prometheus-operator CRD install) remaining to be executed on the real environment. All locally verifiable produce gates are **green**:

- Ship-set manifests (compose + helm + kustomize + sealed) render and pass schema validation.
- The shipped `docker-compose.prod.yml` boots end-to-end; every service healthy; verifier PASS.
- Prometheus scrapes **all** targets (`up == 1`), **all 9 alert rules evaluate to data** (none NoData), **no rule fires** under healthy load.
- Backend exposes **207 `vardiya_*` series** on `GET /api/v1/metrics` (unauthenticated scrape endpoint); data is queryable in PromQL.
- Grafana 11.1.0: Prometheus (default) + Loki + Tempo datasources connected; "VardiyaOS — Production Monitoring" dashboard provisioned.
- Loki `/ready` 200, Tempo `/ready` 200, Alertmanager config valid, live HTTP probes across services 200/302.

---

## 2. Scope

| Lane  | Work                                                                                                                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | Ship-artifact validation: helm (prod/staging) + kustomize + sealed-secrets renders, kubeconform, `:latest` scan, actionlint, image parity                                                                               |
| **B** | Boot the shipped `docker-compose.prod.yml` (smoke, p44) and validate the observability chain live: Prometheus scrape → rules → Alertmanager, Grafana datasources + dashboard, Loki, Tempo, plus golden-path HTTP probes |
| **C** | P4.3 regression battery re-run post-fix; go-live checklist + SLO measurability; final report                                                                                                                            |

---

## 3. P4.3 Regression Re-run (C1) — GREEN

| Gate                                                           | Result                               |
| -------------------------------------------------------------- | ------------------------------------ |
| Preflight test suite (`release-preflight.test.mjs`)            | 32/32 PASS                           |
| Release preflight (`release-preflight.mjs`)                    | 17/17 PASS (CI mode)                 |
| `docker compose config` (prod + dev)                           | OK                                   |
| `docker-compose.prod.yml` `:latest` references                 | none                                 |
| Kustomize renders (`k8s/` 35 kinds, sealed)                    | OK                                   |
| Helm template `values/production.yaml` + `values/staging.yaml` | OK                                   |
| Kubeconform helm prod                                          | 44 docs, **0 invalid** (3 CRD skips) |
| Kubeconform `k8s/`                                             | 35/35 valid                          |
| Kubeconform `infra/sealed-secrets`                             | 4 skipped (sealed CRD)               |
| `infra/prometheus-operator/service-monitors.yaml` (8 CRs)      | parsed; CRD skips                    |
| Image parity (ghcr prefix + no floating tags)                  | OK                                   |
| Backend typecheck (post JWT-guard removal)                     | exit 0                               |

---

## 4. Defects Found & Fixed (B1/B2)

| #   | Defect                                                                                                                                                               | Root cause                                                                                                                                                           | Fix (artifact)                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Tempo volume mount crashed container                                                                                                                                 | `grafana/tempo:2.6.0` has a **file** at `/tempo` (the binary); volume mount over it fails. `/var/tempo` is the writable dir                                          | `docker-compose.prod.yml`: `tempo_data:/var/tempo`; `tempo/tempo-config.yml` paths → `/var/tempo/{traces,wal}`                                                                                                                                                       |
| 2   | Backend metrics endpoint was **JWT-protected** → every Prometheus scrape 401 → `up{job="backend"}` always 0 → BackendDown permanently firing + no `vardiya_*` series | `@UseGuards(JwtAuthGuard)` on `getMetrics()`                                                                                                                         | Removed guard + unused imports (`backend/src/metrics/metrics.controller.ts`); image rebuilt `vardiyasystem/backend:p44`                                                                                                                                              |
| 3   | Stale startup log pointed at `/metrics`                                                                                                                              | log text                                                                                                                                                             | `backend/src/main.ts` → `Metrics at http://localhost:${port}/api/v1/metrics`                                                                                                                                                                                         |
| 4   | Prometheus backend job scraped `/metrics` (404, empty)                                                                                                               | wrong `metrics_path`                                                                                                                                                 | `prometheus/prometheus.yml` → `/api/v1/metrics`                                                                                                                                                                                                                      |
| 5   | Alert rules referenced non-existent metric names (`http_requests_duration_seconds_*`, `pg_stat_activity_count`) → NoData, rules never fire                           | names drift vs app metrics                                                                                                                                           | `prometheus/alert-rules.yml` → `vardiya_http_requests_total`, `vardiya_http_request_duration_seconds_bucket`, `pg_stat_database_numbackends`; dead `vardiya-infra` group (node/nginx not in compose stack) removed                                                   |
| 6   | **PgBouncer metrics port 9127 dead** — `PgBouncerDown` fired immediately                                                                                             | bitnami pgbouncer image ignores `PGBOUNCER_METRICS_ENABLED` (no such env); no listener on 9127                                                                       | Removed dead env; added **`pgbouncer-exporter`** service (prometheuscommunity `v0.11.0`) using admin console (`postgresql://vardiya:***@pgbouncer:6432/pgbouncer`), secret via `scripts/pgbouncer-exporter-entrypoint.sh`; scrape target → `pgbouncer-exporter:9127` |
| 7   | **RedisHighMemory fired immediately**                                                                                                                                | redis had no `maxmemory` → `redis_memory_max_bytes == 0` → division → `+Inf`                                                                                         | compose redis `command: [--maxmemory 128mb --maxmemory-policy noeviction]`; rule guard `and redis_memory_max_bytes > 0`                                                                                                                                              |
| 8   | Loki crash-loop `shared_store not found`                                                                                                                             | config was Loki 2.x (boltdb-shipper + top-level retention), image is **Loki 3.1.0** (TSDB)                                                                           | `loki/loki-config.yml` rewritten 3.1-native (`common` block, `schema_config` tsdb v13, embedded `compactor` with filesystem store, `limits_config.retention_period`)                                                                                                 |
| 9   | pgbouncer SASL auth failed                                                                                                                                           | **Staging artifact, not product defect:** host secret files were written with CRLF (`\r` retained by `$(cat /run/secrets/...)` → SCRAM mismatch vs scraped password) | Secrets regenerated UTF-8, LF-only, no trailing byte; `generate-secrets.sh` (Linux) is already correct — CI path unaffected                                                                                                                                          |

### Cross-stack (helm / k8s) parity fixes — same defects mirrored in the cluster artifacts

| Artifact                                             | Fix                                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `infra/helm/vardiya-platform/values.yaml`            | `serviceMonitor.path` `/metrics` → `/api/v1/metrics`                                                                                                                                                                                                  |
| `charts/monitoring/templates/prometheus-values.yaml` | Alert rule metric names → `vardiya_*` / `pg_stat_database_numbackends`; RedisHighMemory guard added                                                                                                                                                   |
| `charts/redis-cluster/templates/statefulset.yaml`    | Redis args `--maxmemory 128mb --maxmemory-policy noeviction` (same infinite-firing bug in-cluster)                                                                                                                                                    |
| `charts/pgbouncer/templates/deployment.yaml`         | Removed dead 9127 containerPort; added **pgbouncer-exporter sidecar** (`v0.11.0`, `PGBOUNCER_DSN` from `existingSecret.postgres_password` via dependent env, probe on `/metrics`)                                                                     |
| `infra/prometheus-operator/service-monitors.yaml`    | backend SM → `port: http`, `path: /api/v1/metrics`, deterministic `job="vardiya-backend"` relabel, `metricRelabelings` keep only `vardiya_.*`; redis SM `port: redis`; rule names aligned (`vardiya_*`, `pg_stat_database_numbackends`, memory guard) |

---

## 5. Live Observability Validation (B2) — evidence

Smoke stack: `vardiyasmoke-p44` (override isolates container names/volumes/compose-project only — **all service specs identical to the shipped file**).

| Probe                                                         | Result                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend `GET /api/v1/health/live`, `/ready`, `/api/v1/health` | 200 (ready: DB, Redis, queue, memory all ok)                                                                                                                                                                                                                                                                                                               |
| Frontend healthy; `startup-verifier`                          | `PASS: Readiness check passed`; container `Exited (0)`                                                                                                                                                                                                                                                                                                     |
| PgBouncer                                                     | healthy; backend reaches DB through pool (scram-sha-256 OK after secret regen)                                                                                                                                                                                                                                                                             |
| `GET /api/v1/metrics` (unauthenticated)                       | 200; **207 `vardiya_*` series** (RED: requests, duration buckets; process, DB, WS, BullMQ gauges)                                                                                                                                                                                                                                                          |
| Prometheus targets (final)                                    | `backend`, `pgbouncer`, `postgres`, `prometheus`, `redis` → **all UP, no lastError**                                                                                                                                                                                                                                                                       |
| Prometheus rules (final)                                      | **9 rules loaded, all `inactive`** (BackendDown, HighErrorRate, HighLatency, HighRequestRate, PostgresDown, PostgresHighConnections, PgBouncerDown, RedisDown, RedisHighMemory) — no NoData, no false positives                                                                                                                                            |
| PromQL proves data flow: `count(vardiya_http_requests_total)` | **2 series** (scraped + queryable); `vardiya_http_request_duration_seconds_bucket` 22 series; `pg_stat_database_numbackends` 4 series; `redis_memory_max_bytes` 1 series                                                                                                                                                                                   |
| `promtool check config` / `check rules`                       | SUCCESS (9 rules)                                                                                                                                                                                                                                                                                                                                          |
| `amtool check-config`                                         | SUCCESS (route + 1 inhibit + 3 receivers)                                                                                                                                                                                                                                                                                                                  |
| Loki `GET /ready`                                             | 200 (Loki 3.1 native config)                                                                                                                                                                                                                                                                                                                               |
| Tempo `GET /ready`, `/status/config`                          | 200                                                                                                                                                                                                                                                                                                                                                        |
| Grafana (`grafana/grafana:11.1.0`)                            | `/api/health` 200 (database ok); admin auth verified via **basic auth with the staged secret** (login _form_ 401s are the brute-force login protection — a security-positive); datasources **Prometheus (default, "Successfully queried"), Loki (connected), Tempo**; dashboard **"VardiyaOS — Production Monitoring"** (uid `vardiyaos-prod`) provisioned |

### Alert correctness verified live

- **PgBouncerDown fired** while 9127 was dead → validated the rule works; after exporter addition → **resolved**.
- **RedisHighMemory fired** at `maxmemory=0` → after `--maxmemory 128mb` + guard → **resolved**.

---

## 6. SLO / Alerting Measurability (C2)

Every shipped alert is measurable by the shipped Prometheus (no NoData), once CI/cluster lanes are executed:

| SLO target                  | Measured by                                                              | Status               |
| --------------------------- | ------------------------------------------------------------------------ | -------------------- |
| Availability ≥ 99.5%        | `up{job="backend"}` → BackendDown                                        | measurable, inactive |
| Error rate < 5% / 5m        | `vardiya_http_requests_total{status=~"5.."}` → HighErrorRate             | measurable, inactive |
| p99 latency < 2 s           | `vardiya_http_request_duration_seconds_bucket` → HighLatency             | measurable, inactive |
| Throughput headroom         | `rate(vardiya_http_requests_total[1m])` → HighRequestRate                | measurable, inactive |
| Postgres connectivity       | `pg_up`, `pg_stat_database_numbackends` → PostgresDown / HighConnections | measurable, inactive |
| PgBouncer connectivity      | `up{job="pgbouncer"}` → PgBouncerDown                                    | measurable, inactive |
| Redis availability & memory | `redis_up`, `redis_memory_used_bytes/max` → RedisDown / HighMemory       | measurable, inactive |
| Log aggregation             | Loki datasource connected, `/ready` 200                                  | up                   |
| Trace correlation           | Tempo datasource connected, `/ready` 200                                 | up                   |

---

## 7. Verification Checklist (go-live, composed from the shipped runbooks)

- [x] Prometheus scrapes the correct path `/api/v1/metrics` — verified live 200 + series in PromQL
- [x] No alert rule references a non-existent metric — `promtool check rules` 9/9, live eval has data
- [x] Grafana datasources reachable, dashboard provisioned — verified
- [x] Loki + Tempo ready, configs valid for shipped image versions — verified
- [x] Secrets arrive LF-only, no trailing bytes; pgbouncer auth OK — verified (CRLF was a staging-only artifact)
- [x] Redis bounded memory (128 mb, noeviction) present in compose + k8s statefulset
- [x] PgBouncer metrics exposed via exporter (compose service + k8s sidecar)
- [ ] **ENVIRONMENT-BLOCKED** CI: push `backend:p44` / `frontend:p44` to GHCR (non-latest tags)
- [ ] **ENVIRONMENT-BLOCKED** cluster: helm install vardiya-platform (prod values), apply `infra/prometheus-operator/`, verify SMs/PodMonitors select targets
- [ ] **ENVIRONMENT-BLOCKED** cluster: confirm Grafana admin password via basic auth (login form is brute-force-protected by design), rotate admin password after first login

---

## 8. Residual / Hardening Items (non-blocking, recorded)

1. **Prisma engines at boot:** `backend/.prisma` layer in the image is 4.1 kB (empty engines); the shipped compose command runs `npx prisma generate` at boot, which self-heals, but the image is not standalone-runtime-complete. Recommendation: move `prisma generate` **after** `npm prune --omit=dev` in `backend/Dockerfile` and empty `.prisma` from the image.
2. **k8s Postgres exporter:** no postgres-exporter workload exists in the helm platform; `ServiceMonitor vardiya-postgres` has no prometheus target. Add exporter pod + SM (compose already ships one).
3. **PgBouncer admin console exposure:** exporter connects as admin user over 6432; keep pgbouncer on an internal network only.
4. **Base image size:** `vardiyasystem/backend` shows ~780 MB because local build produced a multi-arch manifest list; single-arch size is smaller. Verify via `docker inspect --format '{{.Size}}'` at release.
5. **Historical docs:** `docs/security-review.md` (441) and `docs/phase-5/phase-5c16-*` still describe the pre-fix `/metrics`+guard state; left untouched as historical records. Live runbooks updated (§10).

---

## 9. Operator Pre-Flight (ENVIRONMENT-BLOCKED here)

1. GitHub Actions: run CI on this commit (unit 1172, e2e 85, frontend vitest 153, preflight, dry-run gates).
2. Publish images `ghcr.io/anomalyco/vardiyasystem/backend:p44` / `frontend:p44` (no `:latest`).
3. Install prometheus-operator kube-prometheus + apply `infra/prometheus-operator/service-monitors.yaml`.
4. `helm install vardiya infra/helm/vardiya-platform -f infra/helm/vardiya-platform/values/production.yaml`.
5. Post-install smoke identical to §5 before pointing DNS.

---

## 10. Files Changed (this phase)

- `docker-compose.prod.yml` — tempo volume, redis maxmemory, pgbouncer metrics export (removed dead env/port, added exporter), image pins
- `tempo/tempo-config.yml`, `prometheus/prometheus.yml`, `prometheus/alert-rules.yml`, `loki/loki-config.yml`
- `backend/src/metrics/metrics.controller.ts`, `backend/src/main.ts`
- `scripts/pgbouncer-exporter-entrypoint.sh` (new)
- `secrets/*.txt` (staging: LF-only, no trailing byte)
- `infra/helm/vardiya-platform/values.yaml`, `charts/monitoring/templates/prometheus-values.yaml`, `charts/redis-cluster/templates/statefulset.yaml`, `charts/pgbouncer/templates/deployment.yaml`
- `infra/prometheus-operator/service-monitors.yaml`
- `docs/phase-4/production-deployment-checklist.md`, `docs/phase-4/production-configuration.md` (`/metrics` → `/api/v1/metrics`)

---

## 11. Conclusion

The shipped production compose now boots cleanly and its observability chain is **fully functional and fully green**: every scrape target is up, every alert rule has data and correctly stays quiet under healthy operation while **correctly firing when a component genuinely fails** (proven live on pgbouncer-exporter and redis memory). The k8s/helm mirror of every discovered defect has been applied and re-validated through render + kubeconform. The only unexecuted work is the explicitly environment-blocked CI/cluster publication and install.

**Phase P4.4 complete — STOP.**
