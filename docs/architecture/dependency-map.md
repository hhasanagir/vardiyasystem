# Dependency Map

**Date:** 2026-08-20

## Backend Module Dependencies

### Core Infrastructure (imported by most modules)

```
PrismaService ← All modules
AuditLogService ← Schedules, Personnel, Auth, Devices, SwapRequests
ScheduleGateway ← Schedules, Personnel
NotificationEventService ← Schedules, Personnel, SwapRequests, Devices
EventBusService ← Schedules, Personnel, Devices
MetricsService ← Schedules, Auth
```

### Module Dependency Graph (key modules)

```
AuthModule
  └── imports: RbacModule, PersonnelModule (via forwardRef)
  └── exports: AuthService, TokenService

PersonnelModule
  └── imports: WebsocketModule (via forwardRef), UnitsModule
  └── injects: ScheduleGateway (via forwardRef)

SchedulesModule
  └── imports: PersonnelModule, UnitsModule, DevicesModule, SkillsModule
  └── injects: PrismaService, AuditLogService, ScheduleGateway,
               NotificationEventService, MetricsService, EventBusService,
               UnitsService, SchedulesWorkflowService

RbacModule (@Global)
  └── provides: PermissionGuard (APP_GUARD)
  └── imports: PrismaService

WebsocketModule
  └── imports: AuthModule (potential cycle via PersonnelModule)
```

## Frontend Service Dependencies

### Schedule Feature Chain

```
PlanPageComponent
  └── ScheduleService (1,427 lines — API calls)
  └── SchedulingEngineService (orchestrator)
      └── ConstraintValidatorService
      └── ComprehensiveConstraintValidatorService
      └── ConflictDetectorService
      └── FatigueEngineService
      └── FairnessBalancerService
      └── RebalanceEngineService
      └── RecommendationEngineService
      └── ScheduleGeneratorService
```

### Auth Feature Chain

```
LoginComponent
  └── AuthService (auth state, tokens)
      └── ApiService (HTTP)
  └── AuthInterceptor (attaches tokens)
  └── AuthGuard / RoleGuard / RbacGuard
```

## Package Dependencies

### Backend (66 total: 48 prod + 18 dev)

**Heavy:**

- `@prisma/client` 5.22
- `@nestjs/*` 10.4 (15+ packages)
- `bullmq` + `ioredis`
- `socket.io` + `@nestjs/websockets`
- `passport` + `@nestjs/jwt` + `@nestjs/passport`
- `firebase-admin` + `web-push` (push notifications)
- `winston` + `nest-winston`
- `helmet`
- `exceljs` + `pdfkit` (export)
- `prom-client` + `@opentelemetry/*` (observability)
- `class-validator` + `class-transformer`

### Frontend (44 total: 31 prod + 13 dev)

**Heavy:**

- `@angular/*` 21.2 (12+ packages)
- `primeng` 21.1 + `primeicons`
- `chart.js` 4.5
- `socket.io-client` 4.8
- `@angular/service-worker` (PWA)
- `@capacitor/*` 8.x (10 packages for mobile)
- `rxjs` 7.8
