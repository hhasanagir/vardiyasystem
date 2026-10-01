# Changelog

All notable changes to this project will be documented in this file.

## [1.0.0] - 2026-06-29

### Added

- **Production infrastructure**: Helm umbrella chart (49 files, 7 subcharts), Istio service mesh (gateway, VirtualService, DestinationRules, STRICT mTLS), ArgoCD GitOps (6 Applications), Argo Rollouts (blue-green/canary), cert-manager (3 ClusterIssuers, ECDSA P256), Unsealed Secrets (90-day rotation), Prometheus Operator (6 ServiceMonitors), OpenTelemetry Collector (HPA 2-6), NetworkPolicy + PodSecurityAdmission
- **Monitoring**: Prometheus + Grafana + Loki + Tempo + AlertManager (Docker Compose + Helm), alert rules (15+ across 4 groups), auto-provisioned datasources, health dashboard (dark mode, per-endpoint P95/P99)
- **Performance engineering**: k6 load test suite (4 scenarios + smoke + helpers), 5-tier load testing (100-5000 users), 10 composite database indexes, PgBouncer transaction pooling
- **Performance documentation**: Performance report (4 test types, 5 tiers), capacity report (10K user projection, $485-$8,200/mo cost model), optimization report (4-phase roadmap, 67-95% latency improvement target)
- **Healthcare compliance (33 modules)**:
  - **Encryption**: AES-256-GCM service with HKDF key derivation, key rotation, masking/pseudonymization
  - **Consent management**: 10 consent templates, give/withdraw/check lifecycle, auto-expiry via cron
  - **Data subject rights**: Access, erasure, rectification, restriction, portability — all automated via REST APIs
  - **Data retention**: 11 policies, 4 daily cron jobs (retention + consent expiry + DSR expiry + session cleanup)
  - **Emergency access**: Break-glass mechanism (60min default, approval/revocation, full audit trail)
  - **Breach notification**: Record/contain/notify-authority/notify-subjects/resolve workflow
  - **Processing activity register**: 8 GDPR Art. 30 activities, DPIA workflow, 6 data classifications
  - **Audit logging**: `@Log()` decorator on 28 write endpoints, AuditInterceptor (before/after capture, failure logging, response time), data classification on audit records
  - **Inactivity tracking**: 30-minute session timeout interceptor
- **Compliance documentation**: 4 reports (compliance report 6.8/10, gap analysis 33 gaps, risk matrix 28 risks, implementation roadmap 6-week plan)
- **Frontend enterprise UI**: 11 design system components + main layout rewrite + 3 feature components (dashboard, KPI overview, smart recommendations)
- **Mobile**: Capacitor 8 conversion roadmap (7-phase, 10-week plan)
- **Security**: CSRF double-submit, Helmet CSP/HSTS, rate limiting (progressive lockout 5→15min→24h), bcrypt 13 rounds, JWT short expiry + refresh rotation + blacklisting, OpenTelemetry tracing
- **CI/CD**: GitHub Actions (PR validation, deploy, weekly security scan), Dependabot (npm, Actions, Docker)
- **Documentation**: 53 files across 16 docs/ subdirectories (enterprise: SLOs, IR, on-call, DR, capacity; compliance: KVKK/GDPR/HIPAA; devops: deployment, rollback, release; performance: testing, results)

### Changed

- Prisma schema: 36 original models + 11 new compliance models + 6 new enums + 10 composite indexes
- Backend: 32 controllers → 44 controllers (12 new), 200+ endpoints → ~250 endpoints
- NestJS modules: 33 feature modules → 44 modules (7 compliance + 4 infrastructure)

### Security

- ASVS Level 2 compliant (OWASP Application Security Verification Standard)
- All 5 critical + 5 high findings from security review remediated
- Gitleaks + TruffleHog + CodeQL scanning (weekly + per-PR)
- `.nsprc` advisory suppressions for non-exploitable vulnerabilities

## [0.1.0] - 2026-05-16

### Added

- Initial release: NestJS backend, Angular frontend, PostgreSQL database
- Core features: authentication, schedule management, personnel management, shift tracking
- Basic DevOps: Docker Compose, PostgreSQL, Redis, simple CI/CD
