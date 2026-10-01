# Current Architecture

**Date:** 2026-08-20

## Technology Stack

| Layer        | Technology                           | Version |
| ------------ | ------------------------------------ | ------- |
| Frontend     | Angular                              | 21.2.x  |
| Mobile       | Capacitor                            | 8.x     |
| Backend      | NestJS                               | 10.4.x  |
| ORM          | Prisma                               | 5.22.x  |
| Database     | PostgreSQL                           | 14+     |
| Cache        | Redis / ioredis                      | —       |
| Queue        | BullMQ                               | —       |
| WebSocket    | Socket.IO                            | 4.8.x   |
| Auth         | JWT + Passport                       | —       |
| Monitoring   | OpenTelemetry + Prometheus + Grafana | —       |
| Logging      | Winston + Loki                       | —       |
| Tracing      | Tempo                                | —       |
| Load Testing | k6                                   | —       |

## Backend Structure (52 modules)

```
backend/src/
├── app.module.ts           (59 module imports — God Module)
├── main.ts                 (Bootstrap, port 3000)
├── prisma.service.ts       (PrismaClient + middleware)
├── config/                 (env.config.ts with Joi validation)
├── guards/                 (MinRole, CsrfGuard, RoleGuard)
├── interceptors/           (InactivityInterceptor)
├── filters/                (Exception filters)
├── events/                 (EventBus, EventStore, BullMQ consumer)
├── ddd/                    (UNUSED: Entity, AggregateRoot, ValueObject, etc.)
├── infrastructure/         (UNUSED: BaseRepository, UnitOfWork)
├── metrics/                (Prometheus metrics)
├── logger/                 (Winston structured logging)
├── correlation/            (Request correlation IDs)
├── models/                 (Schedule status machine)
├── modules/
│   ├── schedules/          (2,216-line God Service + 5 sub-services)
│   ├── auth/               (14 files, 8 sub-services — well decomposed)
│   ├── notifications/      (13 sub-services — well decomposed)
│   ├── rbac/               (Permission-based access control)
│   ├── personnel/          (Personnel management)
│   ├── devices/            (Device management)
│   ├── units/              (Unit management)
│   ├── analytics/          (515-line service)
│   ├── audit-log/          (681-line service)
│   ├── ... (37 more modules)
│   └── websocket/          (Socket.IO gateway)
└── prisma/
    ├── schema.prisma       (95 models, 2,932 lines)
    └── migrations/         (20 migrations)
```

## Frontend Structure (80 components, 58 services)

```
frontend/src/app/
├── app.ts / app.config.ts / app.routes.ts (48 routes)
├── core/
│   ├── scheduling/         (10 services — constraint engine, solver, fatigue)
│   ├── api/                (API service, device API)
│   ├── state/              (Signal stores)
│   ├── tokens/             (Design tokens)
│   ├── directives/         (aria-live, focus-trap, skip-link)
│   └── services/           (theme, page-context)
├── components/             (31 general components)
├── features/               (28 feature modules)
├── ui/                     (16 design system primitives)
├── shared/                 (KPI cards, page header, pipes)
├── services/               (32 services)
├── guards/                 (auth, guest)
├── interceptors/           (auth, CSRF, offline)
├── layouts/                (main, auth)
├── domain/                 (enums, models, rules)
└── directives/             (EMPTY)
```

## Data Flow

```
Angular Component
    ↓
Feature Service (schedule.service.ts — 1,427 lines)
    ↓
API Service (api.service.ts — HTTP interceptor)
    ↓
NestJS Controller (schedules.controller.ts — 529 lines, 35 endpoints)
    ↓
Domain Service (schedules.service.ts — 2,216 lines)
    ↓
Prisma Service → PostgreSQL
    ↓
WebSocket Gateway → Socket.IO → Frontend
    ↓
Event Bus → BullMQ → Handlers (audit, notifications, metrics)
```

## Authentication Flow

```
Login → JWT Access Token + Refresh Token
    ↓
localStorage storage (HIGH PRIORITY security concern)
    ↓
Auth Interceptor adds Bearer header
    ↓
JwtAuthGuard validates token
    ↓
RolesGuard checks MinRole + RBAC permissions
    ↓
Refresh Token rotation on expiry
```
