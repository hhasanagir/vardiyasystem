# VardiyaSystem

Radyoloji birimleri için akıllı vardiya yönetim sistemi. MR, BT, Röntgen, Nükleer Tıp ve RONK birimlerinde personel planlaması, vardiya çizelgesi oluşturma, çakışma tespiti ve iş yükü dengeleme.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Angular 21  │────▶│  NestJS 10   │────▶│  PostgreSQL  │
│  Standalone  │     │  API / WSS   │     │  + Prisma    │
│  Signals     │◀────│  JWT Auth    │◀────│  + Redis     │
└──────────────┘     └──────────────┘     └──────────────┘
```

## Tech Stack

| Layer     | Technology                                   |
| --------- | -------------------------------------------- |
| Frontend  | Angular 21, Signals, PrimeNG 21, Chart.js    |
| Backend   | NestJS 10, Prisma 5, Passport JWT, Socket.IO |
| Database  | PostgreSQL 16                                |
| Test (BE) | Vitest + Supertest                           |
| Test (FE) | Vitest + Playwright                          |
| CI/CD     | GitHub Actions, Docker, ghcr.io              |

## Features

- **Personnel Management**: 4-step enterprise wizard, role/unit assignment, device skill tracking
- **Schedule Planning**: Drag-and-drop grid, triple-shift support, monthly calendar view
- **Conflict Detection**: Double booking, rest period, overtime, fairness constraints
- **Approval Workflow**: Submit → Review → Approve/Publish with version history
- **Swap Requests**: Peer-to-peer shift swapping with supervisor approval
- **Executive Dashboard**: KPI metrics, unit health cards, activity feed
- **Multi-tenant**: Organization-level isolation, role-based access control
- **Real-time**: WebSocket notifications for assignments and approvals
- **5 Units**: MR, BT, Röntgen, Nükleer Tıp, RONK

## Quick Start

### Prerequisites

- Node.js 22+
- PostgreSQL 16+
- npm

### Local Setup

```bash
# 1. Install dependencies
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 2. Configure environment
cp backend/.env.example backend/.env

# 3. Edit backend/.env with your database credentials:
#    DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/vardiyasystem?schema=public"
#    JWT_ACCESS_TOKEN_SECRET="generate-a-random-64-char-string"
#    JWT_REFRESH_TOKEN_SECRET="generate-another-random-64-char-string"

# 4. Apply database migrations
cd backend && npx prisma generate && npx prisma migrate deploy && cd ..

# 5. Start development servers
cd backend && npm run start:dev   # http://localhost:3000
cd frontend && npm start          # http://localhost:4200
```

### Docker

```bash
# Create .env file for Docker (see docker-compose.yml for env vars)
cp backend/.env.example backend/.env

docker compose up -d
# Backend: http://localhost:3000
# Frontend: http://localhost:4200
# Swagger: http://localhost:3000/api/docs
```

### Environment Variables

| Variable                       | Required   | Default                 | Description                                                  |
| ------------------------------ | ---------- | ----------------------- | ------------------------------------------------------------ |
| `DATABASE_URL`                 | Yes        | —                       | PostgreSQL connection string                                 |
| `JWT_ACCESS_TOKEN_SECRET`      | Yes (prod) | dev fallback            | JWT signing secret (min 16 chars)                            |
| `JWT_REFRESH_TOKEN_SECRET`     | Yes (prod) | dev fallback            | JWT refresh token secret                                     |
| `JWT_ACCESS_TOKEN_EXPIRES_IN`  | No         | `15m`                   | Access token TTL                                             |
| `JWT_REFRESH_TOKEN_EXPIRES_IN` | No         | `7d`                    | Refresh token TTL                                            |
| `PORT`                         | No         | `3000`                  | Backend API port                                             |
| `FRONTEND_URL`                 | No         | `http://localhost:4200` | CORS origin                                                  |
| `WS_CORS_ORIGIN`               | No         | `http://localhost:4200` | WebSocket CORS origin                                        |
| `SEED_ADMIN_PASSWORD`          | No         | `admin123`              | Seed password; ignored by the app when `NODE_ENV=production` |
| `SEED_TECHNICIAN_PASSWORD`     | No         | `technician123`         | `prisma/seed.ts` only; never read by the app                 |
| `NODE_ENV`                     | No         | `development`           | Environment mode                                             |

## Test Accounts

| Email                   | Password      | Role         |
| ----------------------- | ------------- | ------------ |
| admin@hospital.com      | admin123      | system_admin |
| technician@hospital.com | technician123 | technician   |

> **Note**: Passwords above are defaults when running with `SEED_ADMIN_PASSWORD` and `SEED_TECHNICIAN_PASSWORD` environment variables. Change these in production.
>
> User seeding runs only outside production: `SeedService` skips `ensureUsers()`
> when `NODE_ENV=production`, so production first-deploy bootstrap must run
> `npm run seed` (in `backend/`) explicitly. App restarts never reset seed
> accounts.

## Project Structure

```
├── frontend/          # Angular 21 SPA
│   ├── src/app/
│   │   ├── components/   # Page components (employees, shifts, reports, landing)
│   │   ├── features/     # Feature modules (plans, onkoloji, operations)
│   │   ├── services/     # API services
│   │   ├── core/         # State management, scheduling engine, interceptors
│   │   └── domain/       # Models, enums, business rules
│   ├── Dockerfile
│   └── nginx.conf
├── backend/           # NestJS API
│   ├── src/modules/     # Feature modules (auth, personnel, schedules, etc.)
│   ├── src/services/    # Business logic services
│   ├── prisma/          # Schema + migrations
│   ├── .env.example     # Environment template
│   └── e2e/             # E2E test suite
├── e2e/               # Playwright tests
├── docker-compose.yml
└── .github/workflows/ # CI/CD pipeline
```

## Scripts

### Backend

| Command                 | Description                     |
| ----------------------- | ------------------------------- |
| `npm run start:dev`     | Development server (hot reload) |
| `npm test`              | Unit tests                      |
| `npm run test:e2e`      | E2E tests                       |
| `npm run test:coverage` | Coverage report (80% threshold) |
| `npm run seed`          | Run database seed script        |

### Frontend

| Command         | Description                    |
| --------------- | ------------------------------ |
| `npm start`     | Development server (port 4200) |
| `npm run build` | Production build               |
| `ng lint`       | Lint check                     |

## Testing

- **20 E2E tests**: Auth (6), Authorization (2), Schedule Workflow (6), Personnel Smoke (6)
- **Unit tests**: Backend services (auth, schedules, swap-requests), Frontend services (schedule-api, device-api, reports)
- **Coverage threshold**: 80% (backend)
- **CI**: GitHub Actions runs all tests on every push

## Security

- All secrets are environment-variable driven
- `JWT_ACCESS_TOKEN_SECRET` and `JWT_REFRESH_TOKEN_SECRET` are required in production
- Seed passwords (`SEED_ADMIN_PASSWORD`, `SEED_TECHNICIAN_PASSWORD`) have NO default in production
- Production never seeds users on app boot: `SeedService` skips `ensureUsers()` when `NODE_ENV=production`, so restarts cannot reset or re-create the well-known seed accounts
- `.env` files are gitignored; use `.env.example` as template
- Never commit `.env` files to the repository

## License

Proprietary — internal hospital use.
