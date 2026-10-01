# VardiyaOS Release Checklist

> Standard release procedure for VardiyaOS — Radiology Shift Management System.
> Follow this checklist for every production release.

---

## Release Flow

```
Feature Branches
      │
      ▼ Develop Branch (integration)
      │
      ▼ Release Branch (stabilization)
      │
      ▼ Main Branch (production)
      │
      ▼ Tag & Deploy
```

---

## Pre-Release (T-3 days)

### Scope Definition

- [ ] Define release scope and feature set
- [ ] Identify breaking changes and migration requirements
- [ ] Review open issues/PRs targeted for this release
- [ ] Confirm all required features are merged to `develop`
- [ ] Create release branch: `release/vX.Y.Z`

### Dependency Check

- [ ] All npm dependencies are up-to-date (`npm outdated`)
- [ ] No critical or high severity advisory in npm audit
- [ ] Dependabot PRs reviewed and merged as needed
- [ ] Prisma client version is compatible with PostgreSQL version
- [ ] Node.js version matches `.nvmrc` and Docker base image

---

## Release Preparation (T-2 days)

### Code Quality

- [ ] `cd backend && npm run lint` — zero errors, zero warnings
- [ ] `cd frontend && npm run lint` — zero errors, zero warnings
- [ ] `cd backend && npx tsc --noEmit` — clean compile
- [ ] `cd frontend && npx tsc --noEmit` — clean compile
- [ ] `cd backend && npx prisma validate` — valid Prisma schema
- [ ] No `TODO`, `FIXME`, `DEBUG`, `console.log` (non-warn/error) in production code
- [ ] No commented-out code blocks

### Testing

- [ ] `cd backend && npm run test` — all tests passing
- [ ] `cd frontend && npx vitest run` — all tests passing
- [ ] `cd backend && npm run test:e2e` — all E2E tests passing
- [ ] `cd frontend && npx playwright test` — all E2E tests passing
- [ ] Code coverage ≥ 80% (backend) — check `coverage/` report
- [ ] Manual smoke test on staging environment

### Build Verification

- [ ] `cd backend && npm run build` — clean build
- [ ] `cd frontend && npm run build -- --configuration production` — clean build
- [ ] `docker compose build backend` — Dockerfile builds successfully
- [ ] `docker compose build frontend` — Dockerfile builds successfully
- [ ] `docker compose -f docker-compose.prod.yml config` — valid compose file

### Security

- [ ] `gitleaks detect` — no secrets leaked
- [ ] `npx audit-ci --critical` — zero critical vulnerabilities
- [ ] OWASP top 10 review for new endpoints
- [ ] Rate limits configured for new endpoints
- [ ] New API endpoints have proper role-based access control
- [ ] Environment variables are not hardcoded

---

## Staging Verification (T-1 day)

### Deployment

- [ ] Deploy release branch to staging environment
- [ ] Run database migrations (`npx prisma migrate deploy`)
- [ ] Run seed scripts if needed
- [ ] Verify startup health (`./scripts/startup-verify.sh`)

### Smoke Tests

#### Authentication

- [ ] User login (admin, supervisor, technician)
- [ ] Token refresh flow
- [ ] Password change
- [ ] Account lockout after failed attempts

#### Core Features

- [ ] Schedule CRUD operations
- [ ] Personnel management
- [ ] Unit management
- [ ] Swap request lifecycle
- [ ] Device incident reporting

#### Real-time Features

- [ ] WebSocket connection established
- [ ] Command center dashboard loads and auto-refreshes
- [ ] Real-time notifications received
- [ ] Presence indicators update

#### Admin Features

- [ ] Audit log accessible
- [ ] Analytics reports generate
- [ ] User management
- [ ] System configuration

### Performance

- [ ] API response times < 500ms (p95)
- [ ] WebSocket latency < 200ms
- [ ] Database query performance (no N+1 queries)
- [ ] Memory usage within limits
- [ ] No memory leaks after prolonged usage

### Integration Tests

- [ ] Slack alerting webhook fires correctly
- [ ] Email notifications (if configured)
- [ ] Push notifications
- [ ] Export functionality (Excel/PDF)

---

## Release Day (T-0)

### Final Checks

- [ ] All CI checks passing on release branch
- [ ] Changelog updated (`CHANGELOG.md`)
- [ ] Version bumped in `package.json` (backend + frontend)
- [ ] Release branch merged to `main`
- [ ] Deployment workflow triggered and green

### Database Migration

- [ ] Database migration plan reviewed
- [ ] Migration is reversible (or forward-fix is ready)
- [ ] Backup taken before migration (`./scripts/verify-backup.sh`)
- [ ] Migration applied to production
- [ ] Rollback migration script prepared

### Deployment

- [ ] Production Docker images built and pushed to registry
- [ ] Green deployment: new version deployed alongside old
- [ ] Traffic gradually shifted to new version (canary)
- [ ] Old version remains available for immediate rollback

### Post-Deployment Verification (First 15 Minutes)

```bash
# Every minute for the first 15 minutes:
while true; do
  echo "=== $(date) ==="
  curl -sf http://localhost:3000/api/v1/health | jq '{status, database, uptime}'
  sleep 60
done
```

### Monitoring

- [ ] Error rate < 0.1% (5xx responses)
- [ ] P95 latency < 500ms
- [ ] No increase in 429 (rate limit) responses
- [ ] Database connection pool < 80%
- [ ] Memory usage stable
- [ ] CPU usage stable

### Rollback Preparedness

- [ ] Rollback script ready (see `docs/devops/rollback.md`)
- [ ] Rollback image tagged and available
- [ ] Database restore backup verified
- [ ] Rollback communicated to on-call engineer

---

## Post-Release (T+1 day)

### Verification

- [ ] All production health checks passing
- [ ] No error spikes in logs
- [ ] User-reported issues collected and triaged
- [ ] Performance metrics reviewed
- [ ] Third-party integrations verified

### Documentation

- [ ] Release notes published on GitHub Releases
- [ ] API documentation updated (Swagger)
- [ ] Deployment documentation updated
- [ ] Runbooks updated for any new operational procedures
- [ ] Known issues documented

### Retrospective

- [ ] Release retrospective scheduled
- [ ] What went well
- [ ] What could be improved
- [ ] Action items tracked in project board

---

## Quick Reference

### Commands

```bash
# Version bump
npm version patch  # or minor, major
cd backend && npm version patch
cd frontend && npm version patch

# Changelog
npx conventional-changelog -p angular -i CHANGELOG.md -s

# Full validation
npm run lint && npm run typecheck && npm test && npm run build

# Deploy to staging
docker compose -f docker-compose.prod.yml up -d --build

# Check deployment
./scripts/startup-verify.sh
```

### Versioning Scheme

We follow [Semantic Versioning](https://semver.org/):

| Bump      | When                                             |
| --------- | ------------------------------------------------ |
| **MAJOR** | Breaking API changes, breaking DB schema changes |
| **MINOR** | New features, non-breaking enhancements          |
| **PATCH** | Bug fixes, security patches, minor improvements  |

### Rollback Criteria

**Rollback immediately if:**

- Error rate > 1% after 5 minutes
- P95 latency > 2 seconds
- Database connection errors
- Authentication failures for valid users
- Data integrity issues discovered

---

## Release Sign-off

| Role            | Name | Date | Signature |
| --------------- | ---- | ---- | --------- |
| Developer       |      |      |           |
| QA Lead         |      |      |           |
| DevOps          |      |      |           |
| Product Owner   |      |      |           |
| Release Manager |      |      |           |
