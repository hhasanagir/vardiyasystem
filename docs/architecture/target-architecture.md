# Target Architecture

**Date:** 2026-08-20

## Overview

Target architecture for VardiyaOS Phase 2+ evolution. This document defines the ideal state — NOT the current state. Implementation should be incremental and non-breaking.

---

## Backend Target Structure

```
backend/src/
├── main.ts
├── app.module.ts                    (Feature modules only, ~10 imports)
│
├── domain/                          [DOMAIN LAYER - No NestJS deps]
│   ├── scheduling/
│   │   ├── entities/
│   │   │   ├── schedule.entity.ts
│   │   │   ├── assignment.entity.ts
│   │   │   └── shift-override.entity.ts
│   │   ├── value-objects/
│   │   │   ├── shift-type.vo.ts
│   │   │   ├── time-range.vo.ts
│   │   │   └── violation.vo.ts
│   │   ├── aggregate-root/
│   │   │   └── schedule-root.ts
│   │   ├── events/
│   │   │   ├── schedule-created.event.ts
│   │   │   ├── assignment-added.event.ts
│   │   │   └── schedule-published.event.ts
│   │   ├── rules/
│   │   │   ├── rest-rule.ts
│   │   │   ├── night-eligibility.rule.ts
│   │   │   ├── device-conflict.rule.ts
│   │   │   └── workload-balance.rule.ts
│   │   └── ports/
│   │       ├── schedule.repository.port.ts
│   │       └── assignment.repository.port.ts
│   ├── personnel/
│   ├── devices/
│   └── auth/
│
├── application/                     [APPLICATION LAYER - Use cases]
│   ├── scheduling/
│   │   ├── create-schedule.use-case.ts
│   │   ├── add-assignment.use-case.ts
│   │   ├── validate-assignment.use-case.ts
│   │   ├── publish-schedule.use-case.ts
│   │   └── rollback-schedule.use-case.ts
│   └── auth/
│
├── infrastructure/                  [INFRASTRUCTURE LAYER]
│   ├── persistence/
│   │   ├── prisma/
│   │   │   ├── schedule.repository.ts
│   │   │   ├── assignment.repository.ts
│   │   │   └── prisma.module.ts
│   │   └── redis/
│   ├── messaging/
│   │   ├── event-bus.adapter.ts
│   │   └── bullmq.adapter.ts
│   ├── websocket/
│   │   └── schedule.gateway.ts
│   └── auth/
│       ├── jwt.strategy.ts
│       └── session.service.ts
│
├── presentation/                    [PRESENTATION LAYER]
│   ├── controllers/
│   │   ├── schedules.controller.ts  (~80 lines, delegates to use cases)
│   │   └── auth.controller.ts
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts          (unified, single system)
│   │   └── permission.guard.ts
│   ├── interceptors/
│   │   ├── audit.interceptor.ts
│   │   ├── metrics.interceptor.ts
│   │   └── correlation.interceptor.ts
│   └── dto/
│
└── shared/                          [CROSS-CUTTING]
    ├── event-bus/
    ├── audit/
    ├── notification/
    └── metrics/
```

## Frontend Target Structure

```
frontend/src/app/
├── core/                            [Singleton services, guards, interceptors]
│   ├── auth/
│   ├── api/
│   ├── guards/
│   ├── interceptors/
│   └── state/
│
├── shared/                          [Reusable components, pipes, directives]
│   ├── components/
│   ├── pipes/
│   └── directives/
│
├── features/                        [Feature modules with lazy loading]
│   ├── scheduling/
│   │   ├── scheduling.routes.ts
│   │   ├── schedule-workspace/      [Replaces plan-page + firevibe-schedule]
│   │   │   ├── schedule-workspace.component.ts
│   │   │   ├── toolbar/
│   │   │   ├── calendar-view/
│   │   │   ├── grid-view/
│   │   │   ├── assignment-editor/
│   │   │   ├── conflict-panel/
│   │   │   ├── validation-panel/
│   │   │   └── summary/
│   │   ├── assignment-dialog/
│   │   ├── auto-generate/
│   │   └── services/               [schedule-api.service.ts ~200 lines]
│   ├── personnel/
│   ├── devices/
│   ├── dashboard/
│   ├── admin/
│   └── ...
│
├── ui/                              [Design system — atomic components]
│
└── domain/                          [Shared types, enums, models]
```

## Scheduling Engine Target

```
Backend:
  ScheduleController (80 lines)
      ↓
  CreateScheduleUseCase / AddAssignmentUseCase / ...
      ↓
  ScheduleAggregate (Domain Entity)
      ↓
  ScheduleRepository (Port) ← PrismaRepository (Adapter)
      ↓
  EventBus → AuditHandler / NotificationHandler / MetricsHandler

Frontend:
  ScheduleWorkspaceComponent (orchestrator ~200 lines)
      ├── ToolbarComponent
      ├── CalendarViewComponent
      ├── GridViewComponent
      ├── AssignmentEditorComponent
      ├── ConflictPanelComponent
      ├── ValidationPanelComponent
      └── SummaryComponent

  schedule-api.service.ts (~200 lines)
  constraint-engine.service.ts (~300 lines)
```

## Key Design Principles

1. **Domain Independence:** Domain layer has zero NestJS/Prisma/HTTP imports
2. **Use Cases over Services:** Each business operation is a focused use case class
3. **Repository Pattern:** Prisma is an implementation detail behind port interfaces
4. **Event-Driven:** Domain events trigger cross-cutting concerns (audit, notifications, metrics)
5. **Single Auth System:** Complete migration to RBAC, remove legacy MinRole
6. **Component Decomposition:** No component > 300 lines, no service > 300 lines
