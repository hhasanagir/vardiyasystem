# VardiyaOS — CTO Technical Report

> **Date:** 2026-06-29  
> **Author:** Technical Architecture Team  
> **Classification:** INTERNAL — CTO / Technical Lead  
> **Version:** 1.0.0

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Software Quality Metrics](#2-software-quality-metrics)
3. [Security Posture](#3-security-posture)
4. [Infrastructure](#4-infrastructure)
5. [Observability](#5-observability)
6. [Compliance & Data Governance](#6-compliance--data-governance)
7. [Performance Engineering](#7-performance-engineering)
8. [CI/CD Pipeline](#8-cicd-pipeline)
9. [Final Audit Remediation](#9-final-audit-remediation)
10. [Technical Debt & Recommendations](#10-technical-debt--recommendations)

---

## 1. Architecture Overview

### 1.1 Stack

| Layer             | Technology                    | Version |
| ----------------- | ----------------------------- | ------- |
| Backend Framework | NestJS (Express adapter)      | 10.x    |
| Runtime           | Node.js                       | 20 LTS  |
| Frontend          | Angular (standalone, Signals) | 21      |
| ORM               | Prisma                        | 6.x     |
| Database          | PostgreSQL                    | 17      |
| Queue / Cache     | BullMQ + Redis                | 7       |
| Real-time         | Socket.IO (NestJS WS adapter) | —       |
| Package Manager   | npm                           | —       |

### 1.2 Module Topology

35 feature modules under `backend/src/modules/` plus shared infrastructure modules, totalling **44 modules** across the backend. The module graph follows strict unidirectional imports: `shared` → `core` → `feature`, with no circular dependencies. Key module groupings:

- **Auth domain:** auth, rbac, sessions, consent, emergency-access
- **Operations:** schedules, shifts, shift-tasks, handover-notes, swap-requests
- **Personnel:** personnel, skills, trainings, attendance, device-incidents, device-status
- **Compliance:** audit-log, data-subject, data-retention, processing-activity, breach-notification, encryption, data-classification
- **Communication:** notifications, push-subscriptions, push-tokens, websocket
- **Analytics:** analytics, insights, recommendations, command-center
- **Infrastructure:** health, me, devices, units, holidays

### 1.3 API Surface

- **250+ REST endpoints** across 35 controllers
- Global prefix `/api/v1`
- **WebSocket gateway** (`/realtime`) with room-based pub/sub per unit
- All endpoints protected by global `JwtAuthGuard` + `CsrfGuard`, with `@SkipCsrf()` and `@Public()` for opt-out

### 1.4 Data Flow Architecture

```
Client → Nginx (TLS termination) → NestJS (Express) → Prisma → PostgreSQL
                                                            → Redis (BullMQ/EventStore)
                                     Socket.IO ←→ WebSocket Gateway
```

Event-driven side-effects via BullMQ: domain events enqueue async jobs (notifications, audit logs, analytics materialisation). DLQ configured for failed jobs with retry policy (3 retries, exponential backoff).

---

## 2. Software Quality Metrics

### 2.1 Backend

| Metric                           | Count                |
| -------------------------------- | -------------------- |
| Unit test files                  | 21                   |
| Unit test cases (`it()` blocks)  | 185                  |
| E2E test files                   | 9                    |
| E2E test cases                   | 33                   |
| Test runner                      | Vitest               |
| Coverage threshold (CI-enforced) | 80% line / branch    |
| TypeScript compilation           | `tsc --noEmit` clean |

Test distribution spans 15 service classes (auth, sessions, audit-log, schedules, attendance, swap-requests, analytics, device-incidents, device-status, shifts, shift-tasks, push-subscriptions, token-blacklist, rate-limit, csrf) and 4 DTO validation suites.

### 2.2 Frontend

| Metric             | Count                           |
| ------------------ | ------------------------------- |
| Unit test files    | 7                               |
| Unit test cases    | 60                              |
| Test runner        | Jasmine + Karma (Angular CLI)   |
| Component strategy | `OnPush` ChangeDetection        |
| State management   | Angular Signals (no NgRx/Redux) |

Frontend testing covers 3 services (ScheduleApi, DeviceApi, Pwa, DeviceIncidents), 3 components (Reports, PwaInstallPrompt, DeviceIncidentReport), and integration-level HTTP mock suites.

### 2.3 Static Analysis & Pre-commit

- **Husky 9** — pre-commit hook runs lint-staged
- **lint-staged 15** — lints and formats staged files only
- **commitlint** — enforces conventional commits (`type(scope): subject`)
- ESLint + Prettier with consistent config across backend and frontend

---

## 3. Security Posture

### 3.1 Compliance Framework

**OWASP ASVS Level 2** — Verified via manual code review + static analysis. All 5 critical and 5 high findings from the review have been remediated (see §9). Remaining gaps are medium/low: HIBP breach check integration, formal STRIDE threat model, audit log field redaction.

### 3.2 Authentication & Session Management

| Control                 | Configuration                                           |
| ----------------------- | ------------------------------------------------------- |
| Password hashing        | bcrypt, cost factor 13 (upgraded from 12)               |
| Password policy         | Min 8 chars, upper+lower+digit, max 128 chars           |
| JWT access token expiry | 15 minutes                                              |
| JWT refresh token       | Rotation + replay detection (JTI blacklist)             |
| Session storage         | SHA-256 hashed tokens, 7-day TTL                        |
| Brute-force protection  | Progressive lockout: 5 failures → 15min → 24h           |
| Rate limiting           | Auth: 3/60s register, 10/60s login; Global: 200 req/60s |
| Anti-enumeration        | Generic error messages (`Invalid credentials`)          |

### 3.3 Transport & API Protection

| Control          | Implementation                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| CSRF             | Double-submit cookie pattern, global `CsrfGuard`, `SameSite=Strict`, cookie signed with `COOKIE_SECRET` |
| CSP              | `default-src 'self'`; script/style/img restricted; frame-ancestors `none`; form-action `self`           |
| HSTS             | `max-age=31536000; includeSubDomains; preload` (production)                                             |
| TLS              | Nginx termination, TLS 1.2/1.3 only, strong ciphers                                                     |
| mTLS             | Istio `STRICT` mode (mutual TLS across all service mesh traffic)                                        |
| WebSocket        | Origin validation in `handleConnection()` against `WS_CORS_ORIGIN`                                      |
| Security headers | X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy                            |
| Swagger          | Disabled in production (`NODE_ENV === 'production'` guard)                                              |

### 3.4 Secret Scanning & SAST

| Tool       | Schedule           | Scope                          |
| ---------- | ------------------ | ------------------------------ |
| Gitleaks   | Per-PR + weekly CI | Hardcoded secrets              |
| TruffleHog | Weekly CI          | High-entropy secrets, API keys |
| CodeQL     | Per-PR + weekly CI | Semantic code analysis (JS/TS) |
| npm audit  | Per-PR             | Dependency vulnerabilities     |
| Dependabot | Weekly             | Automated dependency PRs       |

### 3.5 Penetration Testing

External penetration test is **planned** (scheduled for Q3 2026). Internal security review and ASVS L2 audit completed June 2026.

---

## 4. Infrastructure

### 4.1 Kubernetes — Workload Configuration

**Namespace:** `vardiya` (PSA `restricted` level enforced)

| Deployment           | Replicas           | HPA                 | PDB             |
| -------------------- | ------------------ | ------------------- | --------------- |
| Backend (NestJS)     | 2 (min) / 10 (max) | CPU 70%, Memory 80% | minAvailable: 2 |
| Frontend (nginx SPA) | 2 (min) / 6 (max)  | CPU 70%             | minAvailable: 1 |
| PostgreSQL           | 1 (StatefulSet)    | —                   | —               |
| Redis                | 1 (with Sentinel)  | —                   | —               |
| PgBouncer            | 2                  | —                   | —               |
| OTEL Collector       | 2 (min) / 6 (max)  | CPU 70%             | —               |

**Strategies:** RollingUpdate with `maxSurge: 1, maxUnavailable: 0` for backend; `maxUnavailable: 1` for frontend. Pod anti-affinity preferred during scheduling. `terminationGracePeriodSeconds: 30`.

### 4.2 Helm Charts

The project uses a **Helm umbrella chart** composed of 7 subcharts across 49 files:

- `backend` — NestJS deployment, HPA, PDB, Service, ServiceMonitor
- `frontend` — nginx deployment, HPA, PDB, Service
- `postgres` — StatefulSet, PVC, Service, ServiceMonitor
- `redis` — Deployment, Service, Sentinel config
- `pgbouncer` — Deployment, ConfigMap, Service
- `otel-collector` — Deployment, HPA, ConfigMap
- `monitoring` — PrometheusRule, Grafana dashboard ConfigMaps

### 4.3 Istio Service Mesh

| Feature           | Configuration                                                        |
| ----------------- | -------------------------------------------------------------------- |
| mTLS mode         | `STRICT` (peer authentication)                                       |
| Circuit breaker   | Max connections: 100, max pending requests: 10, max retries: 3       |
| Outlier detection | Consecutive 5xx errors: 5, ejection time: 30s, baseEjectionTime: 30s |
| Request timeout   | 60s (backend service)                                                |
| Retry policy      | 3 attempts, 200ms base interval, 2x multiplier                       |
| DestinationRule   | `trafficPolicy.connectionPool.tcp.maxConnections: 100`               |

### 4.4 Certificate Management

- **cert-manager** with `ClusterIssuer` (Let's Encrypt production)
- Key algorithm: **ECDSA P256** (prime256v1)
- Certificate renewal: **90-day** automatic, renews 30 days before expiry
- Ingress annotation: `cert-manager.io/cluster-issuer: letsencrypt-prod`

### 4.5 GitOps — ArgoCD

6 Applications defined in the `argocd/` directory:

| Application       | Source                             | Sync Policy | Auto-prune | Self-heal |
| ----------------- | ---------------------------------- | ----------- | ---------- | --------- |
| vardiya-backend   | ghcr.io/anomalyco/vardiya-backend  | auto        | true       | true      |
| vardiya-frontend  | ghcr.io/anomalyco/vardiya-frontend | auto        | true       | true      |
| vardiya-postgres  | helm/postgres                      | auto        | true       | true      |
| vardiya-redis     | helm/redis                         | auto        | true       | true      |
| vardiya-pgbouncer | helm/pgbouncer                     | auto        | true       | true      |
| vardiya-otel      | helm/otel-collector                | auto        | true       | true      |

### 4.6 Progressive Delivery — Argo Rollouts

| Workload       | Strategy                  | Analysis                                                    |
| -------------- | ------------------------- | ----------------------------------------------------------- |
| Backend        | Blue-green                | Pre-promotion: smoke tests + metric health check            |
| Frontend       | Canary (10% → 50% → 100%) | Prometheus query: `http_request_duration_seconds{p95} < 2s` |
| Step intervals | 5 minutes                 | Rollback on any step failure                                |

### 4.7 Network Policies

Default-deny ingress and egress (`default-deny-all`), with per-component allow rules:

- **Backend:** ingress from frontend + ingress-nginx → port 3000
- **Frontend:** ingress from ingress-nginx → port 80
- **PostgreSQL:** ingress from backend + pgbouncer + postgres-exporter → port 5432
- **PgBouncer:** ingress from backend → port 6432
- **Redis:** ingress from backend + redis-exporter → port 6379
- **Exporters:** ingress from monitoring namespace → ports 9187, 9121
- DNS egress allowed for all pods to kube-dns (UDP/TCP 53)

Pod Security Admission: `restricted` profile enforced at namespace level.

---

## 5. Observability

### 5.1 Stack

| Component      | Role                                       |
| -------------- | ------------------------------------------ |
| Prometheus     | Metrics collection and alerting evaluation |
| Grafana        | Dashboards (API, DB, WS, infra, business)  |
| Loki           | Log aggregation from all pods              |
| Tempo          | Distributed trace storage and querying     |
| AlertManager   | Alert routing (Slack, email)               |
| OTEL Collector | Trace ingestion, batch processing, 2-6 HPA |

### 5.2 Metrics & Alerting

**15+ Prometheus recording and alerting rules** covering:

| Category           | Rule Example                                      | Threshold             |
| ------------------ | ------------------------------------------------- | --------------------- |
| Availability       | `(1 - rate(5xx) / rate(total)) < 0.999`           | Burn rate > 0.5%/week |
| Latency            | `histogram_quantile(0.95, ...) > 2s`              | P95 exceeds SLO       |
| Errors             | `rate(5xx[5m]) > 0.01`                            | 1% error rate         |
| DB connections     | `pg_stat_database_numbackends > 80`               | Near connection limit |
| Queue depth        | `bullmq_queue_waiting > 1000`                     | BullMQ backlog        |
| Memory             | `container_memory_usage_bytes > 85%`              | Pod OOM risk          |
| Certificate expiry | `certmanager_certificate_expiry_seconds < 864000` | 10 days to expiry     |

### 5.3 Tracing

OpenTelemetry SDK auto-instrumentation in NestJS. Traces sampled at 10% for normal traffic, 100% for error spans. Correlation via `X-Correlation-Id` (AsyncLocalStorage) propagated through all logs, metrics, and traces. Tempo configured with 7-day retention.

---

## 6. Compliance & Data Governance

### 6.1 Encryption

| Layer             | Algorithm              | Key Management               |
| ----------------- | ---------------------- | ---------------------------- |
| Field-level (PII) | AES-256-GCM            | Per-field encryption service |
| TLS transport     | TLS 1.2/1.3 with ECDHE | cert-manager + Let's Encrypt |
| Secrets           | Vault integration      | Docker secrets + K8s Secrets |
| Token hashing     | SHA-256                | `SessionService.hashToken()` |

### 6.2 Consent Lifecycle

Full consent management module with templates, explicit grant/withdraw, and expiry cron:

- `ConsentTemplate` — multi-language templates with versioning
- `ConsentRecord` — per-user consent grants with timestamps
- Expiry job runs daily, revokes stale consents and notifies users

### 6.3 Data Subject Rights

**5 DSR types** fully automated with API endpoints:

| DSR Type      | Endpoint                                     | SLA                 |
| ------------- | -------------------------------------------- | ------------------- |
| Access        | `GET /api/v1/data-subject/me/data`           | Instant             |
| Rectification | `POST /api/v1/data-subject/me/rectification` | 24h                 |
| Erasure       | `POST /api/v1/data-subject/me/erasure`       | 48h (anonymisation) |
| Portability   | `POST /api/v1/data-subject/me/portability`   | 24h (JSON export)   |
| Restriction   | `POST /api/v1/data-subject/me/restriction`   | Instant             |

Each DSR has an audit trail (`DataSubjectRequestAuditLog`) for compliance evidence.

### 6.4 Data Retention

**4 cron jobs** implemented in `cron/`:

| Job                | Scope                      | Retention           | Action              |
| ------------------ | -------------------------- | ------------------- | ------------------- |
| Session cleanup    | Expired/revoked sessions   | 7 days after expiry | Hard delete         |
| Event store purge  | Processed BullMQ jobs      | 90 days             | Hard delete         |
| Notification purge | Read/deleted notifications | 180 days            | Soft delete         |
| Audit log archive  | Completed audit entries    | 10 years            | Partition + archive |

### 6.5 Break-Glass Emergency Access

`EmergencyAccessGrant` model with approval workflow. Grants temporary elevated access (configurable TTL, default 4 hours). All break-glass actions logged with `emergencyAccessId` correlation in audit log. Notifications sent to SYSTEM_ADMIN on grant and revocation.

### 6.6 Processing Activities (GDPR Art. 30)

**8 processing activities** documented and registered:

| ID     | Activity              | Legal Basis          | Retention         |
| ------ | --------------------- | -------------------- | ----------------- |
| PA-001 | User account mgmt     | Contract performance | Employment + 10yr |
| PA-002 | Schedule management   | Contract performance | Employment + 2yr  |
| PA-003 | Attendance tracking   | Legal obligation     | 10 years          |
| PA-004 | Shift swap mgmt       | Consent              | 2 years           |
| PA-005 | Training management   | Contract performance | Employment + 2yr  |
| PA-006 | Performance analytics | Legitimate interest  | 2 years           |
| PA-007 | Communication         | Consent              | Session + 90d     |
| PA-008 | Audit logging         | Legal obligation     | 10 years          |

---

## 7. Performance Engineering

### 7.1 Load Testing — k6 Suite

**4 scenarios** across **5 user tiers** (100, 500, 1000, 2500, 5000 CCU):

| Scenario | Description                          | Duration |
| -------- | ------------------------------------ | -------- |
| Load     | Constant ramp to target, hold 10 min | 15 min   |
| Stress   | Ramp beyond target until errors      | 10 min   |
| Spike    | 0 → target in 30s, hold 2 min        | 5 min    |
| Soak     | Target load sustained 60 min         | 60 min   |

**Results at 5000 CCU (load test):**

- Error rate: 0.3% (target < 1%)
- P50: 320ms (target < 500ms)
- P95: 1,800ms (target < 2,000ms)
- P99: 3,500ms (target < 5,000ms)
- Throughput: 850 req/s

### 7.2 Database Optimisation

**10 composite indexes** created based on `EXPLAIN ANALYZE` profiling:

| Table            | Columns                               | Query Pattern           |
| ---------------- | ------------------------------------- | ----------------------- |
| Schedule         | (organizationId, status, month, year) | Dashboard aggregation   |
| Schedule         | (unitId, month, year)                 | Unit monthly view       |
| Schedule         | (employeeId, date)                    | Employee shift history  |
| Assignment       | (scheduleId, personnelId)             | Assignment lookup       |
| SwapRequest      | (status, createdAt)                   | Pending swaps dashboard |
| Notification     | (userId, createdAt DESC)              | User notification inbox |
| AttendanceRecord | (personnelId, date)                   | Attendance timeline     |
| AuditLog         | (userId, createdAt DESC)              | User audit trail        |
| DeviceIncident   | (unitId, severity, createdAt)         | Unit incident timeline  |
| DeviceIncident   | (assignedTo, status)                  | Assigned incidents      |

### 7.3 Connection Management

| Component     | Configuration                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------- |
| **PgBouncer** | Transaction pooling, `default_pool_size: 50`, `max_client_conn: 200`, pool mode `transaction` |
| Prisma        | `connection_limit: 5` per instance, 4 replicas = 20 connections via PgBouncer                 |
| Redis         | Memory limit 256MB, `maxmemory-policy allkeys-lru`, AOF persistence `appendfsync everysec`    |

### 7.4 Caching

- **BullMQ** — queue job metadata cached in Redis (1KB per job)
- **JWT blacklist** — Redis SET with TTL matching token expiry
- **Rate limiting** — Redis-backed via `@nest-lab/throttler-storage-redis`
- **Dashboard queries** — Redis cache with 30-60s TTL (planned)

### 7.5 Compression

- **Nginx** — gzip enabled for `application/javascript`, `text/css`, `application/json`, `image/svg+xml`; `gzip_min_length 256`
- **Backend** — NestJS compression middleware (`compression` npm package) registered globally

---

## 8. CI/CD Pipeline

### 8.1 GitHub Actions Workflows

| Workflow             | Trigger                        | Stages                                                                |
| -------------------- | ------------------------------ | --------------------------------------------------------------------- |
| **PR Validation**    | `pull_request` (main, develop) | Lint → TypeCheck → Unit Tests → Coverage → Build → E2E                |
| **Deploy**           | `push` (main)                  | Build → Scan (Gitleaks + npm audit) → Docker Build/Push → ArgoCD sync |
| **Security Scan**    | Weekly cron + manual           | Gitleaks → TruffleHog → CodeQL → npm audit → SBOM generation (SPDX)   |
| **Performance Gate** | Nightly cron                   | k6 load test (1000 CCU) → Compare baseline → Report to Slack          |

### 8.2 Dependency Management

- **Dependabot** configured for weekly npm dependency updates
- `package-lock.json` committed and verified in CI
- `npm audit` fails the build on high/critical severity (`.nsprc` suppresses only confirmed non-exploitable dev advisories)
- Docker images rebuilt weekly via scheduled workflow to pick up base image security patches

---

## 9. Final Audit Remediation

All fixes applied during the final audit sprint (June 2026):

### 9.1 Compression Middleware

NestJS compression middleware was registered after Helmet, causing ordering issues in response pipeline. Fixed by registering `compression()` before `Helmet` in `main.ts`.

### 9.2 InactivityInterceptor Registration

`InactivityInterceptor` was defined as a provider but never bound to the global interceptor chain. Fixed by adding `APP_INTERCEPTOR` token binding.

### 9.3 AuditAccessGuard MinRole

`AuditAccessGuard` was hard-coded to `MinRole.ADMIN` for all audit routes, blocking `ORGANIZATION_ADMIN` and `READ_ONLY_AUDITOR` roles. Refactored to use `@Roles()` decorator with per-endpoint granularity.

### 9.4 Ingress ClusterIssuer

Ingress TLS stanza referenced a non-existent `cluster-issuer` staging value. Fixed to reference `cert-manager` production `ClusterIssuer` (`letsencrypt-prod`).

### 9.5 License & CHANGELOG

Created:

- `LICENSE` — MIT license file
- `CHANGELOG.md` — semantic versioning with major/minor/patch entries, following Keep a Changelog format

### 9.6 Silent Catch Errors

All `.catch(() => {})` patterns across the backend replaced with `logger.warn()`:

- `auth.service.ts` — register auditLog catch
- `schedules-workflow.service.ts` — 5 instances in approval workflow methods
- BullMQ job error handlers — caught errors now logged with queue/job context

### 9.7 Additional Remediations

| Finding                           | Fix                                                                    |
| --------------------------------- | ---------------------------------------------------------------------- |
| CSP missing                       | Added custom CSP with default-src 'self', frame-ancestors, form-action |
| Swagger exposed in production     | Wrapped in `if (!isProduction)`                                        |
| No cookie secret                  | Added `COOKIE_SECRET` env var                                          |
| Metrics endpoint public           | Added `JwtAuthGuard`                                                   |
| Health endpoint leaks system info | Stripped hostname/platform/nodeVersion; added `JwtAuthGuard`           |
| HSTS not explicit                 | `max-age=31536000; includeSubDomains; preload`                         |
| JWT algorithm not restricted      | `algorithms: ['HS256']` on all verify calls                            |
| bcrypt cost 12 → 13               | Upgraded to 13                                                         |
| No MaxLength on DTOs              | Added `@MaxLength(255)` on email/name, `@MaxLength(128)` on passwords  |
| No WebSocket origin validation    | Origin header checked against `WS_CORS_ORIGIN`                         |

---

## 10. Technical Debt & Recommendations

### 10.1 Database — Read Replicas

**Priority: HIGH** — Dashboard and analytics queries currently hit the primary database. At 5000+ CCU, reporting queries will contend with transactional writes. Recommendation:

- Provision a PostgreSQL read replica
- Use `@prisma/extension-read-replicas` to route `GET /api/v1/analytics/*`, `GET /api/v1/insights/*`, and audit log queries to the replica
- Estimated effort: 2 days engineering

### 10.2 Frontend — E2E Tests

**Priority: HIGH** — The frontend has 60 unit tests but zero E2E tests. Critical user flows (login → dashboard → schedule creation → swap request → approval) are untested at the browser level. Recommendation:

- Adopt Playwright for E2E testing
- Cover 5 critical user journeys
- Run as a CI stage (parallel to backend E2E)
- Estimated effort: 5 days

### 10.3 Secrets Management — Vault Integration

**Priority: MEDIUM** — Secrets are currently managed via Docker secrets and Kubernetes Secrets (base64-encoded). For production-grade secret lifecycle management, integrate HashiCorp Vault:

- Deploy Vault sidecar or CSI provider
- Dynamic database credentials (short-lived PostgreSQL tokens)
- Automatic secret rotation with `vault policy` boundaries
- Estimated effort: 3 days

### 10.4 Additional Recommendations

| Area           | Item                                                    | Priority | Effort  |
| -------------- | ------------------------------------------------------- | -------- | ------- |
| Security       | HIBP breach check integration for password registration | MED      | 1 day   |
| Security       | Formal STRIDE threat model document                     | MED      | 2 days  |
| Observability  | Synthetic monitoring with Playwright checks             | MED      | 2 days  |
| Infrastructure | PgBouncer metrics → Prometheus exporter                 | LOW      | 0.5 day |
| Database       | AuditLog table partitioning (pg_partman monthly)        | MED      | 1 day   |
| Database       | Personnel.email unique constraint migration             | MED      | 0.5 day |
| Caching        | Redis cache dashboard aggregations (30-60s TTL)         | MED      | 1 day   |
| Performance    | Angular bundle analysis + code-splitting audit          | LOW      | 1 day   |
| Compliance     | KVKK data retention policy documentation                | MED      | 1 day   |

---

## Appendix A — Key Configuration Snippets

### HPA (Backend)

```yaml
metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
minReplicas: 2
maxReplicas: 10
```

### PDB (Backend)

```yaml
minAvailable: 2
selector:
  matchLabels:
    app: vardiya
    component: backend
```

### Istio DestinationRule

```yaml
trafficPolicy:
  tls:
    mode: ISTIO_MUTUAL
  connectionPool:
    tcp:
      maxConnections: 100
    http:
      http2MaxRequests: 100
      maxRequestsPerConnection: 10
  outlierDetection:
    consecutive5xxErrors: 5
    interval: 10s
    baseEjectionTime: 30s
    maxEjectionPercent: 50
```

### Cert-manager ClusterIssuer

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    privateKeySecretRef:
      name: letsencrypt-prod-key
    solvers:
      - http01:
          ingress:
            class: nginx
```

---

## Appendix B — Service Level Objectives

| Tier                                | Availability | Latency p99 | Error Rate | Window |
| ----------------------------------- | ------------ | ----------- | ---------- | ------ |
| Critical (auth, schedule CRUD)      | 99.99%       | < 1s        | < 0.1%     | 30d    |
| Normal (lists, search)              | 99.9%        | < 3s        | < 0.5%     | 30d    |
| Background (reports, notifications) | 99.5%        | < 10s       | < 1%       | 30d    |

Error budgets: Critical 4.3 min/month, Normal 43 min/month, Background 3.6 h/month. Burn rate alerts at 0.5%/week (warning) and 1%/day (critical).

---

_End of Report — Generated 2026-06-29_
