# VardiyaOS Deployment Guide

> Enterprise-grade deployment documentation for VardiyaOS — Radiology Shift Management System.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Docker Deployment](#docker-deployment)
5. [Kubernetes Deployment](#kubernetes-deployment)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Database Management](#database-management)
8. [Monitoring & Observability](#monitoring--observability)
9. [Backup & Recovery](#backup--recovery)
10. [Security](#security)

---

## Architecture Overview

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Client     │────▶│   Nginx       │────▶│   Backend    │
│  (Browser)   │     │  (Reverse     │     │  (NestJS)    │
│              │     │   Proxy)      │     │  :3000       │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                │
                        ┌───────────────────────┼───────────┐
                        │                       │           │
                   ┌────▼─────┐          ┌──────▼────┐ ┌───▼────┐
                   │  Redis   │          │ PostgreSQL │ │ Vault  │
                   │  :6379   │          │   :5432    │ │(opt.)  │
                   └──────────┘          └────────────┘ └────────┘
```

### Components

| Component      | Technology           | Purpose                                           |
| -------------- | -------------------- | ------------------------------------------------- |
| **Backend**    | NestJS (Node.js 20)  | REST API + WebSocket server                       |
| **Frontend**   | Angular 19           | Single-page application                           |
| **PostgreSQL** | 17                   | Primary data store                                |
| **Redis**      | 7                    | Distributed rate limiting, caching, session store |
| **Nginx**      | 1.27                 | Reverse proxy, TLS termination, rate limiting     |
| **Vault**      | HashiCorp (optional) | Secret management                                 |

### Network Architecture (Production)

```
Internet ──▶ HTTPS :443 ──▶ Nginx ──▶ :3000 Backend
                                    ──▶ /static  Frontend SPA
                                    ──▶ /realtime WebSocket
```

---

## Prerequisites

### Required Tools

| Tool           | Version | Purpose                |
| -------------- | ------- | ---------------------- |
| Docker         | 27+     | Container runtime      |
| Docker Compose | 2.29+   | Local orchestration    |
| Node.js        | 20 LTS  | Local development      |
| PostgreSQL     | 17      | Local database         |
| Redis          | 7       | Local cache (optional) |

### Infrastructure Requirements (Production)

| Resource | Minimum   | Recommended |
| -------- | --------- | ----------- |
| CPU      | 2 cores   | 4 cores     |
| RAM      | 4 GB      | 8 GB        |
| Disk     | 20 GB SSD | 50 GB SSD   |
| Database | 1 GB RAM  | 2 GB RAM    |
| Network  | 100 Mbps  | 1 Gbps      |

### Required Secrets (GitHub Secrets)

For CI/CD, configure these in your GitHub repository under **Settings > Secrets and variables > Actions**:

| Secret                  | Description                                |
| ----------------------- | ------------------------------------------ |
| `SLACK_WEBHOOK_URL`     | Slack webhook for deployment notifications |
| `DOCKER_REGISTRY_TOKEN` | Container registry access token            |
| `SENTRY_DSN`            | Error tracking DSN (optional)              |

---

## Environment Setup

### 1. Clone & Install

```bash
git clone https://github.com/anomalyco/vardiyasystem.git
cd vardiyasystem

# Install root dependencies (husky, commitlint)
npm ci

# Install backend dependencies
cd backend && npm ci && cd ..

# Install frontend dependencies
cd frontend && npm ci && cd ..
```

### 2. Configure Environment

```bash
cp .env.production.example .env
# Edit .env with your production values
```

**Critical environment variables:**

| Variable                   | Required | Description                               |
| -------------------------- | -------- | ----------------------------------------- |
| `DATABASE_URL`             | ✅       | PostgreSQL connection string (pooled)     |
| `DATABASE_DIRECT_URL`      | ✅       | PostgreSQL direct connection (migrations) |
| `JWT_ACCESS_TOKEN_SECRET`  | ✅       | JWT signing key (64+ hex chars)           |
| `JWT_REFRESH_TOKEN_SECRET` | ✅       | JWT refresh signing key (64+ hex chars)   |
| `REDIS_URL`                | ✅       | Redis connection string                   |
| `SLACK_WEBHOOK_URL`        | ❌       | Alerting webhook                          |
| `FRONTEND_URL`             | ✅       | CORS origin                               |

### 3. Generate Secrets

```bash
# JWT secrets (64 bytes hex-encoded)
openssl rand -hex 64 > secrets/jwt_access_secret.txt
openssl rand -hex 64 > secrets/jwt_refresh_secret.txt

# Database password
openssl rand -base64 32 > secrets/db_password.txt

# Slack webhook
echo "https://hooks.slack.com/services/..." > secrets/slack_webhook.txt
```

### 4. Initialize Database

```bash
# Using Docker Compose
docker compose up -d postgres

# Run migrations
cd backend && npx prisma migrate deploy

# Seed data
npx ts-node prisma/seed.ts
```

---

## Docker Deployment

### Development

```bash
# Full stack
docker compose up --build

# Individual services
docker compose up backend frontend

# With database only
docker compose up postgres
```

### Production

```bash
# Deploy full stack
docker compose -f docker-compose.prod.yml up -d --build

# Verify deployment
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs backend --tail=50

# Check health
curl http://localhost:3000/api/v1/health
```

### Docker Compose Files

| File                      | Purpose                                             |
| ------------------------- | --------------------------------------------------- |
| `docker-compose.yml`      | Development stack with hot-reload                   |
| `docker-compose.prod.yml` | Production stack with secrets, limits, healthchecks |

### Secrets Management

Secrets are mounted as files in `/run/secrets/` inside containers. The backend reads `*_FILE` env vars (e.g., `DB_PASSWORD_FILE=/run/secrets/db_password`) with fallback to regular env vars.

```bash
# File-based secrets (production)
echo "my-secret-password" > secrets/db_password.txt

# Environment variable fallback (development)
export DB_PASSWORD=my-secret-password
```

---

## Kubernetes Deployment

> For enterprise Kubernetes deployments, see `k8s/` manifests (not included in this repo).

### Recommended Manifests Structure

```
k8s/
├── namespace.yaml
├── configmap.yaml
├── secrets.yaml          # ExternalSecret (SealedSecret) for GitOps
├── postgres/
│   ├── statefulset.yaml
│   ├── service.yaml
│   └── pvc.yaml
├── redis/
│   ├── deployment.yaml
│   └── service.yaml
├── backend/
│   ├── deployment.yaml   # RollingUpdate strategy
│   ├── service.yaml
│   ├── hpa.yaml
│   └── pdb.yaml
├── frontend/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── hpa.yaml
├── ingress.yaml           # TLS with cert-manager
└── network-policy.yaml
```

### Key Kubernetes Considerations

- **Readiness probe**: `GET /api/v1/health/ready`
- **Liveness probe**: `GET /api/v1/health/live`
- **Resource limits**: CPU/Memory as defined in docker-compose.prod.yml
- **HPA**: CPU > 70% scales from 2 to 10 replicas
- **Pod Disruption Budget**: minAvailable: 1
- **RollingUpdate**: maxSurge: 1, maxUnavailable: 0

---

## CI/CD Pipeline

### Workflows

| Workflow            | Trigger            | Purpose                                |
| ------------------- | ------------------ | -------------------------------------- |
| `pr-validation.yml` | PR to main/develop | Validate code quality, tests, security |
| `deploy.yml`        | Push to main       | Build, test, deploy to production      |
| `security-scan.yml` | Weekly / manual    | Full security audit + SBOM             |

### Pipeline Diagram

```
PR Created
    │
    ▼
┌─────────────────────┐
│ PR Validation        │
│ ├── Lint & TypeCheck │
│ ├── Unit Tests       │
│ ├── Build Check      │
│ ├── Docker Build     │
│ ├── E2E Tests        │
│ ├── Security Scan    │
│ └── Compose Validate │
└─────────┬───────────┘
          │ All passed
          ▼
    Merge to main
          │
          ▼
┌─────────────────────┐
│ Production Deploy    │
│ ├── Validate         │
│ ├── Unit Tests       │
│ ├── Security Scan    │
│ ├── Build & Push     │
│ ├── Integration Test │
│ └── Create Release   │
└─────────────────────┘
```

### Required GitHub Secrets

Configure these in your repository:

```
Repository secrets:
  GHCR_TOKEN            # GitHub Container Registry token
  SLACK_WEBHOOK_URL     # Deployment notifications

Environment 'production' secrets:
  DEPLOY_SSH_KEY        # SSH key for deploy server
  DEPLOY_HOST           # Deploy server hostname
  DEPLOY_USER           # Deploy SSH user
```

---

## Database Management

### Migrations

```bash
# Create new migration
cd backend
npx prisma migrate dev --name describe_change

# Apply to production
npx prisma migrate deploy

# Reset (development only)
npx prisma migrate reset
```

### Backup & Restore

```bash
# Backup
pg_dump -h localhost -U vardiya -d vardiyasystem \
  --format=custom \
  --file=backups/vardiya_$(date +%Y%m%d_%H%M%S).dump

# Restore
./scripts/restore-db.ps1 backups/vardiya_20250101_000000.dump

# Verify backup
./scripts/verify-backup.sh backups/vardiya_20250101_000000.dump
```

**Backup Schedule (Production):**

| Frequency | Type                            | Retention |
| --------- | ------------------------------- | --------- |
| Hourly    | WAL archive                     | 24 hours  |
| Daily     | Full backup (custom format)     | 30 days   |
| Weekly    | Full backup + encrypted offsite | 90 days   |
| Monthly   | Full backup + cold storage      | 1 year    |

### Connection Pooling

- Application connections use PgBouncer-compatible pooled URLs (`DATABASE_URL`)
- Direct connections for migrations (`DATABASE_DIRECT_URL`)
- Pool size: 5 connections per instance

---

## Monitoring & Observability

### Health Endpoints

| Endpoint                   | Purpose         | Expected Response                |
| -------------------------- | --------------- | -------------------------------- |
| `GET /api/v1/health/live`  | Liveness probe  | `{"status":"ok"}`                |
| `GET /api/v1/health/ready` | Readiness probe | `{"status":"ok","checks":{...}}` |
| `GET /api/v1/health`       | Full report     | System metrics, DB status        |

### Logging

- **Format**: Structured JSON (Winston)
- **Transport**: Daily rotate file (`/var/log/vardiya/vardiya-api-%DATE%.log`)
- **Retention**: 14 days
- **Max size**: 20 MB per file
- **Levels**: error, warn, info, http, debug

### Alerting

| Event                    | Severity | Channel       |
| ------------------------ | -------- | ------------- |
| Server startup           | info     | Slack         |
| Readiness degradation    | warning  | Slack         |
| Critical device incident | critical | Slack + Email |
| Backup failure           | critical | Slack         |
| Deployment               | info     | Slack         |

### Metrics to Monitor

- Request rate, latency (p50/p95/p99), error rate
- Database connection pool usage
- Memory/CPU per container
- Disk usage for logs and backups
- SSL certificate expiry
- Rate limit hit counts

---

## Backup & Recovery

### Automated Backups

Backup verification runs daily at 03:00 via the `backup-cron` service:

```
docker compose -f docker-compose.prod.yml logs backup-cron
```

### Verification Checks

1. File size ≥ 1 KB
2. Gzip integrity check (for compressed files)
3. `pg_restore --list` archive readability
4. Table data count from TOC

---

## Security

### Rate Limiting (Nginx)

| Zone         | Rate  | Burst | Endpoint             |
| ------------ | ----- | ----- | -------------------- |
| login        | 5/s   | 10    | `/api/auth/login`    |
| register     | 2/s   | 5     | `/api/auth/register` |
| auth_refresh | 10/s  | 10    | `/api/auth/refresh`  |
| api_general  | 100/s | 30    | `/api/*` (other)     |
| ws_connect   | 10/s  | 5     | `/realtime`          |

### Security Headers (Nginx)

```http
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'; ...
```

### Dependency Scanning

- **NPM Audit**: Run on every PR; critical severity fails CI
- **Dependabot**: Weekly automated PRs for dependency updates
- **Gitleaks**: Secret scanning on every PR and weekly

### Container Security

- Non-root user (`vardiya`) in all containers
- Read-only root filesystem (recommended in K8s)
- `tini` as init process (backend) — proper SIGTERM handling
- `SIGQUIT` for nginx graceful shutdown
- No shell access in production containers
- `apk del` build dependencies in multi-stage builds
