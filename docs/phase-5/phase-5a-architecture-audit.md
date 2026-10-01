# Phase 5A: Architecture & Domain Audit Report

**VardiyaOS — Hospital Operations Management Platform**

| Field       | Value                                              |
| ----------- | -------------------------------------------------- |
| **Date**    | 2026-08-25                                         |
| **Status**  | COMPLETE                                           |
| **Author**  | VardiyaOS Architecture Team                        |
| **Scope**   | Full codebase audit for Phase 5B Scheduling Engine |
| **Verdict** | PHASE 5B READY: YES (with caveats)                 |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State Overview](#2-current-state-overview)
3. [Technology Stack](#3-technology-stack)
4. [Backend Architecture](#4-backend-architecture)
5. [Frontend Architecture](#5-frontend-architecture)
6. [Database Schema Analysis](#6-database-schema-analysis)
7. [Domain Model (DDD Analysis)](#7-domain-model-ddd-analysis)
8. [Scheduling Domain Deep Dive](#8-scheduling-domain-deep-dive)
9. [Constraint System Analysis](#9-constraint-system-analysis)
10. [Conflict Detection System](#10-conflict-detection-system)
11. [Fairness Engine](#11-fairness-engine)
12. [Scoring Model](#12-scoring-model)
13. [Schedule Generation — Current State](#13-schedule-generation--current-state)
14. [Service Line Architecture](#14-service-line-architecture)
15. [Resource Types](#15-resource-types)
16. [Data Flow Analysis](#16-data-flow-analysis)
17. [API Surface Analysis](#17-api-surface-analysis)
18. [Security Architecture](#18-security-architecture)
19. [Testing Strategy](#19-testing-strategy)
20. [Performance Characteristics](#20-performance-characteristics)
21. [Known Technical Debt](#21-known-technical-debt)
22. [Gap Analysis: Current vs Required](#22-gap-analysis-current-vs-required)
23. [Top 10 Risks](#23-top-10-risks)
24. [Top 10 Architectural Findings](#24-top-10-architectural-findings)
25. [Top 10 Recommended Next Steps](#25-top-10-recommended-next-steps)
26. [Recommendations](#26-recommendations)
27. [Recommended Implementation Order](#27-recommended-implementation-order)
28. [Phase 5B Readiness Assessment](#28-phase-5b-readiness-assessment)

---

## 1. Executive Summary

VardiyaOS is a production-grade Hospital Operations Management Platform focused on **Imaging** and **Radiation Oncology** departments. Phases 1-4 + 4.1 are complete (Production Readiness Score: 89/100).

### Key Metrics

| Metric                       | Value                                |
| ---------------------------- | ------------------------------------ |
| Prisma Models                | **95**                               |
| Prisma Enums                 | **48**                               |
| NestJS Modules               | **66** (registered in app.module.ts) |
| Angular Routes               | **43**                               |
| Angular Components           | **98**                               |
| TypeScript Files (FE)        | **246**                              |
| Hard Constraints             | **12** (ConstraintEngine)            |
| Violation Rules              | **20**                               |
| Conflict Codes               | **10**                               |
| Domain Events                | **9** (schedule lifecycle)           |
| Frontend Scheduling Services | **13** (core/scheduling/)            |
| Test Files (Schedule)        | **6** (security + regression + DTO)  |

### Architecture Summary

- **Backend:** NestJS 10.4 + Prisma 5.22 + PostgreSQL + Redis/BullMQ/Socket.IO
- **Frontend:** Angular 21.2 + PrimeNG 21 + signals-based state management
- **Domain:** DDD with aggregates, entities, value objects, events, repository ports
- **Scheduling:** Two parallel implementations — legacy Prisma-direct (active) + DDD refactor (partially active)

### Verdict

**PHASE 5B READY: YES** — The existing constraint system, fairness engine, scoring model, and DDD domain layer provide a strong foundation. The new scheduling engine should be built on top of existing domain primitives rather than replacing them.

---

## 2. Current State Overview

### What Exists

| Feature                     | Status        | Notes                                                                                                            |
| --------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Manual schedule creation    | ✅ Production | PrismaScheduleRepository                                                                                         |
| Auto-generation (genetic)   | ⚠️ Basic      | `ScheduleAutoGeneratorService` — greedy, no optimization loop                                                    |
| Constraint validation       | ✅ Production | `ConstraintEngine` — 12 hard constraints                                                                         |
| Conflict detection          | ✅ Production | `ConflictCode` enum, `Conflict` model, `createConflict()`                                                        |
| Fairness calculation        | ✅ Production | `FairnessEngine` — night/weekend/holiday/workload dimensions                                                     |
| Scoring                     | ✅ Production | `ScoringModel` — weighted average (coverage 35%, fairness 30%, workload 25%, preference 10%)                     |
| Schedule workflow           | ✅ Production | Draft → Under Review → Approved → Published → Archived                                                           |
| Approval workflow           | ✅ Production | Four-eyes principle, role-based, idempotent                                                                      |
| Override system             | ✅ Production | Role-restricted, reason-tracked, overridable constraints                                                         |
| Version snapshots           | ✅ Production | `ScheduleSnapshot`, rollback support                                                                             |
| Publish validation          | ✅ Production | Hard-violation check before publish                                                                              |
| Real-time updates           | ✅ Production | Socket.IO gateway                                                                                                |
| Dry-run / Preview           | ⚠️ Partial    | Backend `preview()` method exists; frontend `previewSchedule()` API call exists; no dedicated dry-run simulation |
| Optimization engine         | ❌ Missing    | Frontend has `ConstraintSolverService.optimize()` (genetic algorithm) but backend has no equivalent              |
| Multi-service-line          | ❌ Missing    | No `ServiceLine` model; unit-type-based separation only                                                          |
| Candidate evaluation        | ❌ Missing    | Backend has no candidate generation for optimization                                                             |
| Load balancing across units | ❌ Missing    | No cross-unit scheduling intelligence                                                                            |

### Parallel Code Trees

Three directory trees exist for schedules:

```
backend/src/modules/schedules/                    ← ACTIVE (6 services + DDD domain/)
backend/src/modules/schedules/schedules/           ← DUPLICATE (314 TS errors, excluded from build)
backend/src/modules/schedules/domain/              ← DDD domain layer (partially integrated)
```

The active layer uses `SchedulesService` (legacy Prisma-direct) and `SchedulesDDDController` (DDD aggregate with DTO mapping). The `ScheduleApplicationService` provides the DDD application layer.

---

## 3. Technology Stack

### Backend

| Component          | Version | Purpose                                       |
| ------------------ | ------- | --------------------------------------------- |
| NestJS             | 10.4    | HTTP framework                                |
| Prisma             | 5.22    | ORM + migrations                              |
| PostgreSQL         | 14+     | Primary database                              |
| Redis              | 7+      | Throttler storage, caching, distributed locks |
| BullMQ             | —       | Job queue (schedule generation)               |
| Socket.IO          | 4.8     | Real-time updates                             |
| JWT                | —       | Authentication                                |
| Vitest             | 4.1     | Test runner                                   |
| pgcrypto           | —       | UUID generation                               |
| citext             | —       | Case-insensitive text                         |
| btree_gin          | —       | GIN index support                             |
| pg_stat_statements | —       | Query performance                             |
| ltree              | —       | Hierarchical paths (device.path, role.path)   |

### Frontend

| Component        | Version | Purpose              |
| ---------------- | ------- | -------------------- |
| Angular          | 21.2    | SPA framework        |
| PrimeNG          | 21.1.6  | UI component library |
| @primeng/themes  | 21.0.4  | Theme engine         |
| @angular/cdk     | 21.2.8  | Component Dev Kit    |
| RxJS             | 7.8     | Reactive extensions  |
| Socket.IO Client | 4.8     | Real-time updates    |
| Chart.js         | 4.5     | Data visualization   |
| Capacitor        | 8.4     | Mobile deployment    |
| TypeScript       | 5.9     | Type system          |

---

## 4. Backend Architecture

### Module Registration (66 modules)

```
PrismaModule, AuthModule, SchedulesModule, PersonnelModule, UnitsModule,
AuditLogModule, HolidaysModule, SwapRequestsModule, DevicesModule,
WebsocketModule, HealthModule, InsightsModule, NotificationsModule,
ShiftsModule, MeModule, HandoverNotesModule, DeviceIncidentsModule,
PushSubscriptionsModule, PushTokensModule, AttendanceModule, AnalyticsModule,
ShiftTasksModule, DeviceStatusModule, SkillModule, TrainingModule,
RecommendationsModule, SupervisorModule, CommandCenterModule, VaultModule,
AlertingModule, CorrelationModule, MetricsModule, EventBusModule,
RbacModule, EncryptionModule, ConsentModule, DataSubjectModule,
DataRetentionModule, EmergencyAccessModule, BreachNotificationModule,
DataClassificationModule, ProcessingActivityModule, HierarchyModule,
OrganizationHierarchyModule, DutyRosterModule, InfrastructureModule,
AssetManagementModule, BiomedicalModule, ConsumablesModule, InventoryModule,
ProcurementModule, ContractsModule, SuppliersModule, QualityModule,
RadiationSafetyModule, DeviceLifecycleModule, SmartInventoryModule,
SupervisorCenterModule, PersonnelGroupsModule, DistributedLockModule,
ScheduleJobQueueModule, InfrastructureModule (distributed lock)
```

### Global Guards & Interceptors

| Guard/Interceptor          | Type            | Purpose                                |
| -------------------------- | --------------- | -------------------------------------- |
| `ThrottlerGuard`           | APP_GUARD       | Global rate limiting (200/min default) |
| `CsrfGuard`                | APP_GUARD       | CSRF protection                        |
| `CorrelationInterceptor`   | APP_INTERCEPTOR | Request correlation IDs                |
| `TenantContextInterceptor` | APP_INTERCEPTOR | Multi-tenant context                   |
| `InactivityInterceptor`    | APP_INTERCEPTOR | Session inactivity timeout             |

### Schedules Module Structure

```
schedules.module.ts                        ← Module definition
├── controllers/
│   ├── schedules.controller.ts            ← Legacy REST (Prisma-direct)
│   └── schedules-ddd.controller.ts        ← DDD REST (aggregate + DTO)
├── services/
│   ├── schedules.service.ts               ← Legacy CRUD (Prisma-direct)
│   ├── schedule-application.service.ts    ← DDD Application Service
│   ├── schedule-auto-generator.service.ts ← Genetic algorithm generator
│   ├── schedules-workflow.service.ts      ← Status transitions
│   ├── schedules-export.service.ts        ← Export functionality
│   └── schedule-alert.service.ts          ← Schedule alerts
├── domain/
│   ├── aggregates/schedule.aggregate.ts   ← DDD Aggregate Root (561 lines)
│   ├── entities/
│   │   ├── assignment.entity.ts           ← Assignment entity (170 lines)
│   │   └── assignment-collection.ts       ← Collection pattern
│   ├── value-objects/                     ← PersonnelId, Date, ShiftType, TimeSlot
│   ├── constraints/
│   │   ├── constraint.interface.ts        ← HardConstraint, ViolationRule (20 rules)
│   │   ├── constraint-engine.ts           ← ConstraintEngine class
│   │   └── hard-constraints.ts            ← 12 concrete constraint classes
│   ├── models/
│   │   ├── conflict.ts                    ← ConflictCode (10 codes), ConflictSeverity
│   │   ├── validation-result.ts           ← ValidationResult, CoverageMetrics, etc.
│   │   ├── fairness-engine.ts             ← FairnessEngine, FairnessResult
│   │   ├── scoring-model.ts               ← ScoringModel, ScoringConfiguration
│   │   ├── generation.ts                  ← GenerationConfiguration, ScheduleGenerationResult
│   │   ├── master-data.ts                 ← MasterDataSnapshot, validation functions
│   │   ├── seeded-random.ts               ← Deterministic RNG
│   │   └── version-snapshot.ts            ← VersionSnapshotRecord
│   ├── events/                            ← 9 domain events
│   ├── repositories/
│   │   └── schedule-repository.port.ts    ← Repository port interfaces
│   ├── services/
│   │   └── scheduling-logger.ts           ← Domain logging
│   ├── commands/                          ← CQRS commands
│   └── constants.ts                       ← Domain constants
├── infrastructure/
│   └── prisma-schedule.repository.ts      ← Repository implementation
├── dto/                                   ← DTOs (ScheduleResponseDto, etc.)
├── guards/
│   └── schedule-access.guard.ts           ← Tenant access guard (fail-closed)
├── job-queue/
│   ├── schedule-job-queue.module.ts       ← BullMQ integration
│   └── schedule-job-status.service.ts     ← Job status tracking
└── __tests__/                             ← Security tests
```

---

## 5. Frontend Architecture

### Route Map (43 entries)

```
/ → /login (redirect)
/login → LoginComponent (guestGuard)
/register → RegisterComponent (guestGuard)
/onboarding → OnboardingComponent (guestGuard)
/app (MainLayoutComponent, authGuard)
  /app/dashboard → DashboardComponent
  /app/live-tracking → LiveTrackingComponent (roleGuard: medical_engineer)
  /app/mr-plan → PlanPageComponent {unit='mr'}
  /app/bt-plan → PlanPageComponent {unit='bt'}
  /app/rontgen-plan → PlanPageComponent {unit='rontgen'}
  /app/nukleer-tip-plan → PlanPageComponent {unit='nukleer'}
  /app/onkoloji-plan → PlanPageComponent {unit='onkoloji'}
  /app/supervizor-plan → PlanPageComponent {unit='supervizor'}
  /app/firevibe-schedule → FirevibeScheduleComponent
  /app/schedules → SCHEDULING_ROUTES (lazy, roleGuard: supervisor)
    /app/schedules/:unitId/:year/:month → ScheduleWorkspaceComponent
  /app/duty-roster → DutyRosterComponent (roleGuard: supervisor)
  /app/employees → EmployeesComponent (rbacGuard: personnel.read)
  /app/leave-management → LeaveManagementComponent
  /app/swap-requests → SwapRequestsComponent
  /app/reports → ReportsComponent (rbacGuard: analytics.read)
  /app/performance → PerformanceComponent (roleGuard: supervisor)
  /app/fairness-analysis → FairnessAnalysisComponent (roleGuard: supervisor)
  /app/audit → AuditCenterComponent (roleGuard: supervisor)
  /app/trainings → TrainingListComponent (roleGuard: supervisor)
  /app/skills → SkillMatrixComponent (roleGuard: supervisor)
  /app/approval-center → ApprovalCenterComponent (roleGuard: supervisor)
  /app/handover-notes → HandoverNotesComponent
  /app/device-incidents → DeviceIncidentReportComponent
  /app/management-dashboard → ManagementDashboardComponent (roleGuard: supervisor)
  /app/settings → SettingsComponent (rbacGuard: organization.update)
  /app/my-shifts → MyShiftsComponent
  /app/profile → ProfileComponent
  /app/my-day → MyDayComponent
  /app/shifts → ShiftsComponent (roleGuard: supervisor)
  /app/command-center → CommandCenterComponent (roleGuard: supervisor)
  /app/notifications → NotificationCenterComponent
  /app/kpi-overview → KpiOverviewComponent (roleGuard: supervisor)
  /app/smart-recommendations → SmartRecommendationsComponent (roleGuard: supervisor)
  /app/enterprise/assets → AssetManagementComponent
  /app/assets → AssetManagementComponent (alias)
  /app/assets/:id → AssetDetailComponent
  /app/enterprise/biomedical → BiomedicalComponent
  /app/enterprise/consumables → ConsumablesComponent
  /app/enterprise/procurement → ProcurementComponent
  /app/enterprise/contracts → ContractsComponent
  /app/enterprise/suppliers → SuppliersComponent
  /app/enterprise/quality → QualityComponent
  /app/enterprise/radiation-safety → RadiationSafetyComponent
  /app/enterprise/inventory → InventoryComponent
/** → /login (wildcard)
```

### Scheduling Feature (40 files)

```
features/scheduling/
├── scheduling.routes.ts
├── styles/tokens.scss
├── utils/grid-utils.ts
├── store/schedule.store.ts              ← Signals-based store (36+ computed values)
├── models/
│   ├── schedule.models.ts              ← Schedule, AssignmentDTO interfaces
│   ├── conflict.models.ts              ← ConflictDTO
│   ├── validation.models.ts            ← ValidationResult
│   ├── fairness.models.ts              ← FairnessResult, WorkloadScore
│   ├── coverage.models.ts              ← CoverageMetrics
│   ├── generation.models.ts            ← GenerationConfig, AlgorithmType
│   ├── master-data.models.ts           ← Personnel, Device, ShiftTemplate
│   └── error.models.ts                 ← ScheduleError types
├── services/
│   ├── schedule-api.service.ts         ← HTTP API client
│   ├── schedule-command.service.ts     ← Command dispatching
│   ├── schedule-realtime.service.ts    ← WebSocket handler
│   └── offline-guard.ts                ← Offline detection
└── components/
    ├── schedule-grid/                  ← Main grid component
    ├── schedule-toolbar/               ← Toolbar component
    ├── filter-bar/                     ← Filter bar
    ├── search-input/                   ← Search input
    ├── view-switcher/                  ← View mode switcher
    ├── personnel-view/                 ← Personnel-centric view
    ├── device-view/                    ← Device-centric view
    ├── mobile-day-view/                ← Mobile day view
    ├── generate-dialog/                ← Schedule generation dialog
    ├── publish-dialog/                 ← Publish confirmation
    ├── approval-panel/                 ← Approval workflow panel
    ├── audit-panel/                    ← Audit trail panel
    ├── conflict-panel/                 ← Conflict list panel
    ├── conflict-view/                  ← Conflict detail view
    ├── coverage-panel/                 ← Coverage metrics panel
    ├── coverage-view/                  ← Coverage detail view
    ├── fairness-panel/                 ← Fairness metrics panel
    ├── validation-panel/               ← Validation results panel
    ├── version-panel/                  ← Version history panel
    └── version-compare/                ← Version diff view
```

### Core Scheduling Services (Frontend)

| Service                                         | Purpose                                             | Lines |
| ----------------------------------------------- | --------------------------------------------------- | ----- |
| `constraint-solver.service.ts`                  | Genetic algorithm solver (`solve()` + `optimize()`) | ~350  |
| `constraint-validator.service.ts`               | Individual assignment validation                    | ~150  |
| `comprehensive-constraint-validator.service.ts` | Full schedule validation                            | ~200  |
| `conflict-detector.service.ts`                  | Conflict detection (person/device overlap, rest)    | ~250  |
| `fairness-balancer.service.ts`                  | Fairness metrics calculation                        | ~180  |
| `fatigue-engine.service.ts`                     | Fatigue scoring                                     | ~120  |
| `rebalance-engine.service.ts`                   | Swap-based rebalancing                              | ~300  |
| `recommendation-engine.service.ts`              | Smart swap recommendations                          | ~450  |
| `scheduling-engine.service.ts`                  | Orchestrator (validator + conflict + fairness)      | ~200  |
| `schedule-generator.service.ts`                 | Schedule generation with constraints                | ~350  |
| `solver-validation.service.ts`                  | Pre/post optimization validation                    | ~200  |
| `scheduling.models.ts`                          | Internal model types                                | ~100  |
| `index.ts`                                      | Barrel exports                                      | ~20   |

---

## 6. Database Schema Analysis

### Overview

- **95 models** across 2952 lines of Prisma schema
- **48 enums** covering domain types
- **5 PostgreSQL extensions**: pgcrypto, citext, btree_gin, pg_stat_statements, ltree
- **24 migrations** to date
- **Multi-tenant**: `organizationId` on most models

### Key Scheduling-Related Models

| Model                 | Table                    | Purpose                         | Key Relations                                                                  |
| --------------------- | ------------------------ | ------------------------------- | ------------------------------------------------------------------------------ |
| `Schedule`            | `schedules`              | Monthly schedule container      | → Unit, Organization, User, Assignment[], ScheduleSnapshot[], ScheduleApproval |
| `Assignment`          | `assignments`            | Individual shift assignment     | → Schedule, Personnel, Device, Unit, PersonnelGroup, PersonShiftTemplate       |
| `ScheduleApproval`    | `schedule_approvals`     | Approval workflow state         | → Schedule (1:1)                                                               |
| `ScheduleSnapshot`    | `schedule_snapshots`     | Version snapshots for rollback  | → Schedule                                                                     |
| `Personnel`           | `personnel`              | Staff members                   | → Unit, PersonnelGroup, Assignment[], SwapRequest[], PersonnelSkill[]          |
| `Device`              | `devices`                | Imaging/treatment equipment     | → Unit, Room, Assignment[], Shifts[], DutyRoster[]                             |
| `PersonnelGroup`      | `personnel_groups`       | Staff grouping within units     | → Unit, Personnel[], PersonShiftTemplate[], Assignment[]                       |
| `PersonShiftTemplate` | `person_shift_templates` | Shift pattern templates         | → Unit, PersonnelGroup, Assignment[]                                           |
| `Shifts`              | `shifts`                 | Device shift definitions        | → Organization, Unit, Device, ShiftDateOverride[]                              |
| `AssignmentSlot`      | `assignment_slots`       | Time-slot reservation           | → Room, Device                                                                 |
| `DutyRoster`          | `duty_roster`            | Daily duty roster entries       | → Organization, Unit, Device, Personnel                                        |
| `Holiday`             | `holidays`               | Public holidays                 | (standalone)                                                                   |
| `SwapRequest`         | `swap_requests`          | Shift swap requests             | → Personnel (requester/target), Assignment (from/to)                           |
| `Conflict`            | `conflicts`              | Detected conflicts (persistent) | → User (resolver)                                                              |
| `Recommendation`      | `recommendations`        | AI/algorithm recommendations    | → User (creator)                                                               |

### Key Enums

| Enum                 | Values                                                                                                                                                     | Used By                                        |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `UnitType`           | mr, bt, rontgen, nukleer, onkoloji, ultrason, anjiyo, mamografi, kemik_dansitometri, floroskopi, pet_ct, spect_ct, linak, simutasyon_ct, mobil, supervizor | Unit                                           |
| `ShiftType`          | day, evening, night, morning, off, leave, sick, training, backup                                                                                           | Assignment, Shifts, DutyRoster, AssignmentSlot |
| `AssignmentKind`     | device, person                                                                                                                                             | Assignment                                     |
| `AssignmentSource`   | manual, auto_generated, override, swap, template, import                                                                                                   | Assignment                                     |
| `ScheduleStatus`     | draft, under_review, approved, published, archived, rejected                                                                                               | Schedule                                       |
| `DeviceMode`         | vardiya, polyclinic                                                                                                                                        | Device                                         |
| `DutyRosterRole`     | sorumlu_tekniker, tekniker, yardimci_tekniker, supervisor, radyolog                                                                                        | DutyRoster                                     |
| `UserRole`           | system_admin, hospital_admin, imaging_director, supervisor, medical_engineer, senior_technician, technician, assistant_technician, secretary, guest        | User                                           |
| `ConflictSeverity`   | CRITICAL, WARNING, INFO                                                                                                                                    | Conflict                                       |
| `RecommendationType` | SWAP, COVERAGE, FAIRNESS, FATIGUE                                                                                                                          | Recommendation                                 |

### Assignment Unique Constraints

```prisma
@@unique([scheduleId, deviceId, date, shiftType, personnelType])  // Device-based uniqueness
@@unique([personnelId, date, shiftType])                            // Person-based uniqueness
```

These constraints enforce that:

1. A device can only have one assignment per shift type per day within a schedule
2. A person can only have one assignment per shift type per day (global)

---

## 7. Domain Model (DDD Analysis)

### DDD Building Blocks Present

| Building Block      | Present | Location                                                                     |
| ------------------- | ------- | ---------------------------------------------------------------------------- |
| Aggregate Root      | ✅      | `Schedule` aggregate (`domain/aggregates/schedule.aggregate.ts`, 561 lines)  |
| Entity              | ✅      | `Assignment` entity (`domain/entities/assignment.entity.ts`, 170 lines)      |
| Value Object        | ✅      | `PersonnelId`, `Date`, `ShiftType`, `TimeSlot` (`domain/value-objects/`)     |
| Domain Event        | ✅      | 9 events (`domain/events/`)                                                  |
| Repository Port     | ✅      | `ScheduleRepositoryPort` (`domain/repositories/schedule-repository.port.ts`) |
| Repository Impl     | ✅      | `PrismaScheduleRepository` (`infrastructure/prisma-schedule.repository.ts`)  |
| Application Service | ✅      | `ScheduleApplicationService` (`schedule-application.service.ts`)             |
| Domain Service      | ⚠️      | Only `SchedulingLogger` in `domain/services/`                                |
| CQRS Commands       | ✅      | `domain/commands/` directory exists                                          |
| Entity Collection   | ✅      | `AssignmentCollection` pattern                                               |

### Schedule Aggregate

The `Schedule` aggregate is the core DDD construct:

- **Identity:** `Schedule` (uuid)
- **Invariants enforced:**
  - Status transitions follow workflow (draft → under_review → approved → published)
  - Version verification (optimistic concurrency)
  - Four-eyes principle (submitter ≠ approver)
  - Hard-violation check before publish
  - Distributed lock for publish and rollback operations
- **Methods:** `addAssignment()`, `overrideAssignment()`, `updateAssignment()`, `removeAssignment()`, `submitForReview()`, `approve()`, `reject()`, `publish()`, `archive()`, `revertToDraft()`, `rollback()`
- **Events emitted:** AssignmentAdded, AssignmentChanged, AssignmentOverridden, AssignmentRemoved, ScheduleCreated, ScheduleGenerated, ScheduleRolledBack, ScheduleStatusChanged, ScheduleValidated

### Assignment Entity

- **Identity:** `Assignment` (uuid)
- **Properties:** personnelId, deviceId, unitId, personnelGroupId, shiftTemplateId, kind, source, date, shiftType, startTime, endTime, personnelType, isConfirmed, overrideReason, overriddenBy, overriddenAt
- **Value Objects:** `PersonnelId`, `DeviceId`, `Date` (with `dayOfWeek`, `isWeekend`, `daysUntil()`), `ShiftType` (with `isNightShift`, `isWorking`, `isNonWorking`), `TimeSlot` (with `overlaps()`)

---

## 8. Scheduling Domain Deep Dive

### Two Active Implementations

#### Implementation A: Legacy (Prisma-Direct)

- **Controller:** `SchedulesController` → `SchedulesService`
- **Flow:** HTTP → Controller → Service → Prisma → DB
- **Used by:** Most frontend endpoints, mobile views
- **Characteristics:** Simple, no DDD overhead, direct DB access

#### Implementation B: DDD (Partially Active)

- **Controller:** `SchedulesDDDController` → `ScheduleApplicationService` → `PrismaScheduleRepository`
- **Flow:** HTTP → Controller → ApplicationService → Domain → Repository → Prisma → DB
- **Used by:** Newer endpoints, DTO-mapped responses
- **Characteristics:** DDD patterns, domain events, optimistic concurrency, DTO mapping

#### Integration Point

Both implementations share:

- Same database (Prisma schema)
- Same `ScheduleValidationService` (constraint engine)
- Same `ScheduleAccessGuard` (security)
- Same `ScheduleEventBus` (domain events)

### Schedule Lifecycle

```
                    ┌──────────────┐
                    │   draft      │ ← createSchedule()
                    └──────┬───────┘
                           │ addAssignment(), updateAssignment(), removeAssignment()
                           │ generateSchedule(), overrideAssignment()
                    ┌──────▼───────┐
                    │ under_review │ ← submitForReview()
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │                         │
       ┌──────▼───────┐         ┌──────▼───────┐
       │  approved    │         │  rejected    │
       └──────┬───────┘         └──────┬───────┘
              │                         │
              │                    revertToDraft()
              │                         │
       ┌──────▼───────┐                 │
       │  published   │ ← publish()     │ (back to draft)
       └──────┬───────┘                 │
              │                         │
       ┌──────▼───────┐                 │
       │  archived    │ ← archive()     │
       └──────────────┘                 │
              │                         │
              └────── rollback() ───────┘
                    (back to published with old version)
```

---

## 9. Constraint System Analysis

### Architecture

```
ConstraintEngine (12 HardConstraint instances)
    ↓ validates
Assignment → ConstraintContext
    ↓ produces
ValidationReport { violations[], hasBlocking, hasOverridable }
    ↓ mapped to
Conflict { code, severity, message, context }
    ↓ aggregated into
ValidationResult { hardViolations, softViolations, coverage, fatigue, fairness, workload, score }
```

### 12 Hard Constraints

| #   | Class                                | ViolationRule             | Severity | Overridable | Description                                     |
| --- | ------------------------------------ | ------------------------- | -------- | ----------- | ----------------------------------------------- |
| 1   | `PersonnelIsActiveConstraint`        | INACTIVE_PERSONNEL        | BLOCKING | No          | Personnel must be active                        |
| 2   | `DeviceIsRequiredConstraint`         | DEVICE_REQUIRED           | BLOCKING | No          | Device assignments need a device                |
| 3   | `NoOverlappingAssignmentsConstraint` | TIME_OVERLAP              | BLOCKING | No          | No time overlaps per person                     |
| 4   | `RequiredRestConstraint`             | REQUIRED_REST_NOT_MET     | BLOCKING | Yes         | Minimum 8h rest between shifts                  |
| 5   | `NightShiftEligibilityConstraint`    | NOT_NIGHT_ELIGIBLE        | BLOCKING | No          | Only night-eligible for night shifts            |
| 6   | `OffDayConflictConstraint`           | OFF_DAY_CONFLICT          | BLOCKING | Yes         | Respect configured off days                     |
| 7   | `PersonnelInUnitConstraint`          | PERSONNEL_NOT_IN_UNIT     | BLOCKING | No          | Personnel must be in assigned unit              |
| 8   | `PersonnelInGroupConstraint`         | PERSONNEL_NOT_IN_GROUP    | BLOCKING | No          | Personnel must be in assigned group             |
| 9   | `DeviceSkillsConstraint`             | PERSON_DEVICE_NOT_ALLOWED | BLOCKING | Yes         | Personnel skills must match device requirements |
| 10  | `TemplateValidationConstraint`       | TEMPLATE_NOT_FOUND        | BLOCKING | No          | Shift template must exist and match             |
| 11  | `GroupSlotOccupiedConstraint`        | GROUP_SLOT_OCCUPIED       | BLOCKING | Yes         | Group slot must not be occupied                 |
| 12  | `RequiredRestConstraintNew`          | REST_RULE_VIOLATION       | BLOCKING | No          | 1+ day rest between consecutive nights          |

### ConstraintEngine API

```typescript
class ConstraintEngine {
  validate(assignment, existingAssignments, personnelLookup, deviceLookup, holidays, templates, groups): ValidationReport
  validateWithOverride(..., overrideRules: string[]): ValidationReport
  canOverride(..., overrideRules: string[]): { canOverride, blockingViolations }
}
```

### Lookup Interfaces

The constraint engine uses in-memory lookup maps for performance:

```typescript
PersonnelLookup   → Map<string, PersonnelInfo>    (name, role, skills, deviceSkills, nightEligible, offDays, maxWeeklyHours)
DeviceLookup      → Map<string, DeviceInfo>       (code, name, mode, requiredSkills, workDays, isActive)
ShiftTemplateLookup → Map<string, ShiftTemplateInfo> (name, shiftType, startTime, endTime, isActive)
GroupLookup       → Map<string, GroupInfo>         (name, code, isActive)
```

These are built by `ScheduleValidationService` from Prisma queries, scoped to the relevant unit.

---

## 10. Conflict Detection System

### ConflictCode Enum (10 codes)

| Code                    | Label (Turkish)        | Description                                  |
| ----------------------- | ---------------------- | -------------------------------------------- |
| `PERSON_OVERLAP`        | Personel Çakışması     | Two assignments for same person at same time |
| `DEVICE_OVERLAP`        | Cihaz Çakışması        | Two assignments for same device at same time |
| `REST_VIOLATION`        | Dinlenme İhlali        | Insufficient rest between shifts             |
| `QUALIFICATION_MISSING` | Yetersiz Yeterlilik    | Personnel lacks required skills              |
| `LEAVE_CONFLICT`        | İzin Çakışması         | Assignment conflicts with approved leave     |
| `AVAILABILITY_CONFLICT` | Uygunluk Çakışması     | Personnel/device unavailable                 |
| `COVERAGE_MISSING`      | Eksik Kadro            | Required shift not covered                   |
| `MAX_WORK_EXCEEDED`     | Maksimum Çalışma Aşımı | Weekly hour limit exceeded                   |
| `RULE_VIOLATION`        | Kural İhlali           | Generic rule violation                       |
| `OFF_DAY_CONFLICT`      | İzin Günü Çakışması    | Assigned on configured off day               |

### ConflictSeverity Weights

```typescript
INFO     → 1
WARNING  → 3
ERROR    → 7
CRITICAL → 10
```

### Mapping: ViolationRule → ConflictCode

The `ScheduleValidationService` maps the 20 `ViolationRule` values to the 10 `ConflictCode` values for persistence and UI display.

---

## 11. Fairness Engine

### FairnessEngine

Located at `domain/models/fairness-engine.ts` (112 lines).

**Dimensions:**

| Dimension        | Weight | Calculation                                         |
| ---------------- | ------ | --------------------------------------------------- |
| Night shifts     | 25%    | Coefficient of variation of night counts per person |
| Weekend shifts   | 20%    | CV of weekend working-day counts                    |
| Holiday shifts   | 15%    | CV of holiday working-day counts                    |
| Workload (hours) | 40%    | CV of total hours per person (weighted more)        |

**Formula:**

```
score = max(0, 100 - CV × 100)  // for night/weekend/holiday
workload_score = max(0, 100 - CV × 80)  // slightly more lenient
overall = night×0.25 + weekend×0.20 + holiday×0.15 + workload×0.40
```

**Output:**

```typescript
interface FairnessResult {
  overallScore: number;
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetail[]; // per-person breakdown
}
```

---

## 12. Scoring Model

### ScoringModel

Located at `domain/models/scoring-model.ts` (89 lines).

**Default Weights:**

| Factor               | Weight |
| -------------------- | ------ |
| Coverage             | 35%    |
| Fairness             | 30%    |
| Workload             | 25%    |
| Preference (fatigue) | 10%    |

**Preference Score Calculation:**

```
score = 100
if maxConsecutiveDays > 6: score -= (maxConsecutiveDays - 6) × 10
if minRestHours < 8:       score -= (8 - minRestHours) × 5
if overtimeHours > 0:       score -= overtimeHours × 2
```

**Overall Score:**

```
overall = weightedSum - (penalties × penaltyMultiplier)
overall = clamp(overall, 0, 100)
```

---

## 13. Schedule Generation — Current State

### Backend: `ScheduleAutoGeneratorService` (637 lines)

- **Algorithm:** Greedy with constraint validation
- **API:**
  - `preview(userId, dto)` — generates without persisting
  - `generate(userId, dto)` — generates and persists
  - `applyGeneratedSchedule(userId, dto)` — applies generated assignments to a schedule
- **Flow:**
  1. Load unit, personnel, devices, shifts from Prisma
  2. For each day in month, for each device shift, for each device:
     - Find eligible personnel (active, skills match, not already assigned)
     - Create assignment with constraint validation
  3. Return assignments + summary + warnings

### Frontend: `ConstraintSolverService` (350 lines)

- **Algorithm:** Genetic algorithm with population-based optimization
- **API:**
  - `solve(schedule, config)` — generates initial schedule
  - `optimize(schedule)` — optimizes existing schedule
- **Flow:**
  1. Initialize population (multiple random schedules)
  2. Evaluate fitness (constraint violations, fairness, coverage)
  3. Select parents, crossover, mutate
  4. Repeat for maxIterations
  5. Return best candidate

### Gap Analysis

| Capability              | Backend               | Frontend           | Required for Phase 5B |
| ----------------------- | --------------------- | ------------------ | --------------------- |
| Greedy generation       | ✅                    | ✅                 | ✅                    |
| Genetic algorithm       | ❌                    | ✅                 | ✅                    |
| Constraint validation   | ✅ (12 constraints)   | ✅ (comprehensive) | ✅                    |
| Fairness optimization   | ⚠️ (calculation only) | ✅ (balancer)      | ✅                    |
| Workload balancing      | ⚠️ (calculation only) | ✅                 | ✅                    |
| Fatigue scoring         | ❌                    | ✅                 | ✅                    |
| Candidate generation    | ❌                    | ✅                 | ✅                    |
| Candidate scoring       | ❌                    | ✅                 | ✅                    |
| Swap recommendation     | ❌                    | ✅                 | ✅                    |
| Rebalancing             | ❌                    | ✅                 | ✅                    |
| Dry-run simulation      | ⚠️ (preview only)     | ❌                 | ✅                    |
| Multi-service-line      | ❌                    | ❌                 | ✅                    |
| Cross-unit optimization | ❌                    | ❌                 | ✅                    |

---

## 14. Service Line Architecture

### Current State

**No `ServiceLine` model exists.** The closest analog is the unit hierarchy:

```
Organization → Directorate → Department → Unit → Area → Room
                                                          ↕
                                                       Device
```

Service lines are implicitly defined by `UnitType`:

| Service Line           | Unit Types                                                                                     | Domain             |
| ---------------------- | ---------------------------------------------------------------------------------------------- | ------------------ |
| **Imaging**            | mr, bt, rontgen, ultrason, anjiyo, mamografi, kemik_dansitometri, floroskopi, pet_ct, spect_ct | Diagnostic imaging |
| **Radiation Oncology** | nukleer, onkoloji, linak, simutasyon_ct                                                        | Cancer treatment   |
| **Supervision**        | supervizor                                                                                     | Management         |
| **Mobile**             | mobil                                                                                          | Mobile units       |

### Implication for Phase 5B

The scheduling engine must support **domain-specific scheduling strategies** per service line:

- **Imaging:** Device-centric scheduling (each MRI/CT has shift patterns), patient-slot-driven, polyclinic vs vardiya modes
- **Radiation Oncology:** Treatment-plan-driven scheduling, longer sessions, Linac-specific constraints, dose constraints

**Recommendation:** Use a strategy pattern with `ServiceLineScheduler` interface, not a monolithic if/else.

---

## 15. Resource Types

Resource types are **discovered from the existing repository**, not invented:

### Personnel Types

| Type                   | Description                 | Source                    |
| ---------------------- | --------------------------- | ------------------------- |
| `technician`           | Default, general technician | `Personnel.role` (string) |
| `senior_technician`    | Senior technician           | `UserRole` enum           |
| `medical_engineer`     | Medical engineer            | `UserRole` enum           |
| `radyolog`             | Radiologist                 | `DutyRosterRole` enum     |
| `supervisor`           | Shift supervisor            | `UserRole` enum           |
| `assistant_technician` | Assistant technician        | `UserRole` enum           |

### Device Types (by UnitType)

| Unit Type   | Device Examples            | Mode               |
| ----------- | -------------------------- | ------------------ |
| `mr`        | MRI scanners               | vardiya/polyclinic |
| `bt`        | CT scanners                | vardiya/polyclinic |
| `rontgen`   | X-ray machines             | vardiya/polyclinic |
| `nukleer`   | Nuclear medicine equipment | vardiya            |
| `onkoloji`  | Linac, simulation CT       | vardiya            |
| `ultrason`  | Ultrasound machines        | vardiya/polyclinic |
| `anjiyo`    | Angiography suites         | vardiya            |
| `mamografi` | Mammography units          | vardiya/polyclinic |

### Shift Types

| Type       | Time           | Description    |
| ---------- | -------------- | -------------- |
| `day`      | 08:00-16:00    | Day shift      |
| `evening`  | 16:00-00:00    | Evening shift  |
| `night`    | 00:00-08:00    | Night shift    |
| `morning`  | (configurable) | Morning shift  |
| `off`      | —              | Day off        |
| `leave`    | —              | On leave       |
| `sick`     | —              | Sick leave     |
| `training` | —              | Training day   |
| `backup`   | —              | On-call/backup |

### Shift Modes

| Mode         | Description                              |
| ------------ | ---------------------------------------- |
| `vardiya`    | Standard shift-based operation           |
| `polyclinic` | Polyclinic/OPD operation (shorter slots) |

---

## 16. Data Flow Analysis

### Schedule Generation Flow

```
Frontend                    Backend                     Database
   │                           │                           │
   ├─ POST /schedules/generate ─→ ScheduleAutoGenerator    │
   │                           │  ├─ Load Unit             │
   │                           │  ├─ Load Personnel        │
   │                           │  ├─ Load Devices          │
   │                           │  ├─ Load Shifts           │
   │                           │  ├─ For each day:         │
   │                           │  │   For each device:     │
   │                           │  │     Find eligible       │
   │                           │  │     personnel           │
   │                           │  │     Validate constraints│
   │                           │  │     Create assignment   │
   │                           │  └─ Return result          │
   │                           │                           │
   │ ← 200 {assignments[]} ────│                           │
   │                           │                           │
   ├─ POST /schedules/:id/apply ─→ ScheduleApplicationSvc  │
   │                           │  ├─ Load schedule (locked)│
   │                           │  ├─ validateSchedule()    │
   │                           │  ├─ schedule.publish()    │
   │                           │  └─ PrismaScheduleRepo   │
   │                           │                           │
   │ ← 200 {schedule} ─────────│                           │
```

### Real-Time Update Flow

```
Backend                    WebSocket                 Frontend
   │                           │                       │
   ├─ ScheduleEventBus ───────→│                       │
   │  (Domain Event)           │                       │
   │                           ├─ schedule.gateway.ts  │
   │                           │  (broadcast)          │
   │                           │                       │
   │                           ├─ emit('schedule:changed') ─→ ScheduleStore
   │                           │                       │  (update signals)
```

---

## 17. API Surface Analysis

### Legacy Endpoints (`SchedulesController`)

| Method | Path                                       | Purpose                         |
| ------ | ------------------------------------------ | ------------------------------- |
| GET    | `/schedules`                               | List schedules (with filters)   |
| GET    | `/schedules/:id`                           | Get schedule by ID              |
| POST   | `/schedules`                               | Create new schedule             |
| PUT    | `/schedules/:id`                           | Update schedule                 |
| DELETE | `/schedules/:id`                           | Delete schedule                 |
| POST   | `/schedules/:id/assignments`               | Add assignment                  |
| PUT    | `/schedules/:id/assignments/:assignmentId` | Update assignment               |
| DELETE | `/schedules/:id/assignments/:assignmentId` | Remove assignment               |
| POST   | `/schedules/:id/override`                  | Override assignment with reason |
| POST   | `/schedules/:id/submit-for-review`         | Submit for review               |
| POST   | `/schedules/:id/approve`                   | Approve schedule                |
| POST   | `/schedules/:id/reject`                    | Reject schedule                 |
| POST   | `/schedules/:id/publish`                   | Publish schedule                |
| POST   | `/schedules/:id/archive`                   | Archive schedule                |
| POST   | `/schedules/:id/revert-to-draft`           | Revert to draft                 |
| POST   | `/schedules/:id/rollback`                  | Rollback to previous version    |
| POST   | `/schedules/generate`                      | Generate schedule               |
| POST   | `/schedules/generate/preview`              | Preview generation              |
| POST   | `/schedules/:id/generate`                  | Generate for specific schedule  |
| GET    | `/schedules/:id/validate`                  | Validate schedule               |
| GET    | `/schedules/:id/snapshots`                 | List version snapshots          |
| GET    | `/schedules/:id/conflicts`                 | Get schedule conflicts          |

### DDD Endpoints (`SchedulesDDDController`)

| Method | Path                                                    | Purpose                     |
| ------ | ------------------------------------------------------- | --------------------------- |
| GET    | `/schedules-ddd/:unitType/:year/:month`                 | Get schedule (DTO-enriched) |
| POST   | `/schedules-ddd/:unitType/:year/:month/assignments`     | Add assignment (DDD)        |
| PUT    | `/schedules-ddd/:unitType/:year/:month/assignments/:id` | Update assignment (DDD)     |
| DELETE | `/schedules-ddd/:unitType/:year/:month/assignments/:id` | Remove assignment (DDD)     |

### Other Scheduling-Related Endpoints

| Module                  | Endpoints                                |
| ----------------------- | ---------------------------------------- |
| `SwapRequestsModule`    | `/swap-requests` — CRUD + approve/reject |
| `HolidaysModule`        | `/holidays` — CRUD                       |
| `ShiftsModule`          | `/shifts` — CRUD for shift definitions   |
| `DutyRosterModule`      | `/duty-roster` — CRUD                    |
| `PersonnelGroupsModule` | `/personnel-groups` — CRUD               |
| `TrainingModule`        | `/trainings` — CRUD                      |
| `SkillModule`           | `/skills` — CRUD                         |
| `AttendanceModule`      | `/attendance` — clock in/out             |
| `RecommendationsModule` | `/recommendations` — AI recommendations  |

---

## 18. Security Architecture

### Authentication

- JWT tokens (access + refresh)
- `AuthSession` tracking with device info
- `TokenBlacklist` for revoked tokens
- `AuthAttempt` logging with lockout

### Authorization

- **Role-Based:** `UserRole` enum (10 roles)
- **Permission-Based:** `RbacRoleName` + `Permission` model (module + action)
- **Guard Chain:** `ThrottlerGuard → CsrfGuard → AuthGuard → RoleGuard → RbacGuard → ScheduleAccessGuard`

### Multi-Tenancy

- `organizationId` on most models
- `ScheduleAccessGuard` enforces tenant isolation (fail-closed)
- `TenantContextInterceptor` sets tenant context per request

### Schedule-Specific Security

| Check                  | Location                                          | Description                                                |
| ---------------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| Tenant isolation       | `ScheduleAccessGuard`                             | Fail-closed, verifies unit belongs to organization         |
| Role restrictions      | `@Roles()` decorator                              | supervisor, imaging_director, system_admin, hospital_admin |
| Permission checks      | `@Permissions()` decorator                        | schedule.create, schedule.publish, etc.                    |
| Override authorization | `ScheduleApplicationService.overrideAssignment()` | Only specific roles can override                           |
| Four-eyes principle    | `ScheduleApplicationService.approve()`            | Submitter cannot be approver                               |
| Optimistic concurrency | `schedule.verifyVersion()`                        | Prevents concurrent modifications                          |
| Distributed lock       | `DistributedLockService`                          | Prevents concurrent publish/rollback                       |
| Idempotency            | `ScheduleApplicationService.checkIdempotency()`   | Prevents duplicate operations                              |
| Rate limiting          | `ThrottlerGuard`                                  | 200 requests/minute                                        |
| CSRF                   | `CsrfGuard`                                       | Cross-site request forgery protection                      |

---

## 19. Testing Strategy

### Test Runner

- **Vitest 4.1.9** — must use `npx vitest run <specific-file>` (singular files; `npx vitest run` without args hangs)
- **Known issue:** `npx vitest run` without specific file hangs indefinitely

### Test Files (Schedule Module)

| File                              | Tests | Purpose                             |
| --------------------------------- | ----- | ----------------------------------- |
| `security-closure-4.1.spec.ts`    | 38    | Security closure behavioral tests   |
| `security-invariants.spec.ts`     | 12    | Security invariant regression tests |
| `device-shift-visibility.spec.ts` | 14    | DTO mapping tests                   |
| `constraint-engine.spec.ts`       | —     | Constraint validation tests         |
| `fairness-engine.spec.ts`         | —     | Fairness calculation tests          |
| `schedule-validation.spec.ts`     | —     | Validation orchestration tests      |

### Test Results

- **38/38** security closure tests: PASS
- **12/12** security invariant regression tests: PASS
- **14/14** DTO tests: PASS
- **2** analytics tests: FAIL (pre-existing, missing `holiday` prisma mock)

### Coverage Gaps

| Area                | Test Coverage | Gap                                |
| ------------------- | ------------- | ---------------------------------- |
| ConstraintEngine    | ✅            | Comprehensive                      |
| FairnessEngine      | ⚠️            | Missing `holiday` mock integration |
| ScheduleGeneration  | ❌            | No generation tests                |
| ScheduleWorkflow    | ❌            | No workflow transition tests       |
| ScheduleRollback    | ❌            | No rollback tests                  |
| SwapRequests        | ❌            | No swap workflow tests             |
| Frontend scheduling | ❌            | No frontend scheduling tests       |

---

## 20. Performance Characteristics

### Current Performance Profile

| Operation                                | Estimated Time | Bottleneck                                            |
| ---------------------------------------- | -------------- | ----------------------------------------------------- |
| Schedule query (list)                    | <100ms         | Prisma query                                          |
| Schedule query (single with assignments) | <200ms         | Prisma relation loading                               |
| Add assignment (single)                  | <100ms         | Constraint validation + DB write                      |
| Validate schedule (full)                 | 1-5s           | N×M constraint checks (N assignments × M constraints) |
| Generate schedule (greedy)               | 2-10s          | Iterative assignment creation                         |
| Publish (with validation)                | 2-5s           | Full validation + distributed lock                    |
| Real-time broadcast                      | <50ms          | Socket.IO emit                                        |

### Constraint Validation Complexity

- **Per assignment:** O(N × M) where N = existing assignments, M = 12 constraints
- **Full schedule validation:** O(K × N × M) where K = total assignments
- **For a typical month:** ~30 personnel × 30 days × 3 shifts = ~2,700 assignments
- **Validation:** 2,700 × 2,700 × 12 = ~87M operations (optimized with lookup maps → O(K × M))

### Database Indexes (Scheduling)

```sql
-- Schedule
@@unique([unitId, month, year])
@@index([status])
@@index([createdById])
@@index([unitId, createdAt])
@@index([organizationId])
@@index([organizationId, status])

-- Assignment
@@unique([scheduleId, deviceId, date, shiftType, personnelType])
@@unique([personnelId, date, shiftType])
@@index([personnelId, date])
@@index([deviceId])
@@index([date])
@@index([scheduleId])
@@index([scheduleId, personnelId])
@@index([scheduleId, date])
@@index([unitId])
@@index([personnelGroupId])
@@index([kind])
```

---

## 21. Known Technical Debt

### Critical

| #    | Issue                                                      | Impact                               | Files                                                      |
| ---- | ---------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| TD-1 | `schedules/schedules/` duplicate directory (314 TS errors) | Build noise, developer confusion     | `backend/src/modules/schedules/schedules/`                 |
| TD-2 | `src/src/` duplicate dead code tree                        | Build noise, confusion               | `backend/src/src/`                                         |
| TD-3 | Two parallel scheduling implementations (legacy + DDD)     | Code duplication, maintenance burden | `schedules.controller.ts` vs `schedules-ddd.controller.ts` |

### Moderate

| #    | Issue                                                                         | Impact                                           | Location                                       |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------- |
| TD-4 | `Personnel.role` is plain string, not enum                                    | No DB-level role validation                      | `Personnel` model                              |
| TD-5 | Frontend `ConstraintSolverService` exists but backend has no equivalent       | Frontend-only optimization, not server-validated | `core/scheduling/constraint-solver.service.ts` |
| TD-6 | `ScheduleAutoGeneratorService` uses greedy only                               | Suboptimal schedule quality                      | `schedule-auto-generator.service.ts`           |
| TD-7 | Fairness calculation in `FairnessEngine` doesn't consider seniority weighting | Junior/senior parity issues                      | `fairness-engine.ts`                           |
| TD-8 | No soft constraint system (only hard constraints with overridable flag)       | Limited constraint flexibility                   | `hard-constraints.ts`                          |

### Low

| #     | Issue                                                                 | Impact                | Location                    |
| ----- | --------------------------------------------------------------------- | --------------------- | --------------------------- |
| TD-9  | `src/src/` directory with `auth/`, `personnel/`, `prisma/` duplicates | Dead code, confusion  | `backend/src/src/`          |
| TD-10 | Analytics tests fail (missing `holiday` mock)                         | 2 test failures       | `analytics.service.spec.ts` |
| TD-11 | No database seeding for schedule-specific test data                   | Tests rely on live DB | `__tests__/`                |

---

## 22. Gap Analysis: Current vs Required

### For Phase 5B Scheduling Engine

| Requirement                    | Current State                             | Gap                                                     | Priority |
| ------------------------------ | ----------------------------------------- | ------------------------------------------------------- | -------- |
| Genetic algorithm optimization | Frontend only                             | Backend needs `ScheduleOptimizerService`                | HIGH     |
| Candidate generation           | Frontend only                             | Backend needs candidate evaluation                      | HIGH     |
| Candidate scoring              | Frontend only                             | Backend needs scoring integration                       | HIGH     |
| Soft constraint system         | None                                      | Need `SoftConstraint` interface + implementations       | HIGH     |
| Multi-service-line scheduling  | UnitType enum only                        | Need `ServiceLine` strategy pattern                     | HIGH     |
| Dry-run simulation             | `preview()` exists but no full simulation | Need dry-run API with full constraint/fairness checking | HIGH     |
| Swap recommendation engine     | Frontend only                             | Backend needs recommendation generation                 | MEDIUM   |
| Load balancing across units    | None                                      | Need cross-unit intelligence                            | MEDIUM   |
| Fatigue-aware scheduling       | Frontend fatigue engine only              | Backend needs fatigue scoring                           | MEDIUM   |
| Seniority-aware fairness       | None (CV-based only)                      | Need seniority weighting in fairness                    | MEDIUM   |
| Consecutive night rules        | Basic (1-day gap)                         | Need configurable rules per unit                        | MEDIUM   |
| Device maintenance awareness   | None                                      | Need maintenance schedule integration                   | LOW      |
| Holiday-aware generation       | Basic (holiday check exists)              | Need holiday weighting in generation                    | LOW      |
| Export/shift swap automation   | Basic                                     | Need intelligent swap matching                          | LOW      |

### For Production Readiness

| Requirement    | Current State              | Gap                                               |
| -------------- | -------------------------- | ------------------------------------------------- |
| Load testing   | None                       | Need k6/Artillery scripts for schedule generation |
| Monitoring     | Basic (Prometheus metrics) | Need scheduling-specific dashboards               |
| Alerting       | Basic                      | Need constraint violation alerts                  |
| Backup/restore | Prisma migrations only     | Need schedule-specific backup strategy            |

---

## 23. Top 10 Risks

| #   | Risk                                                                                                   | Severity | Mitigation                                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------- |
| 1   | **Genetic algorithm in frontend only** — optimization not validated server-side                        | HIGH     | Build backend optimizer with server-side validation                        |
| 2   | **No `ServiceLine` abstraction** — all units treated identically                                       | HIGH     | Introduce strategy pattern before adding Radiation Oncology-specific rules |
| 3   | **Parallel code trees** — `schedules/schedules/` causes build confusion                                | MEDIUM   | Delete duplicate directory                                                 |
| 4   | **`Personnel.role` as string** — no DB-level constraint on valid roles                                 | MEDIUM   | Add enum or check constraint                                               |
| 5   | **No soft constraints** — only hard + overridable                                                      | MEDIUM   | Design soft constraint interface                                           |
| 6   | **Frontend scheduling services not used server-side** — fairness, fatigue, rebalancing are client-only | MEDIUM   | Extract shared domain logic                                                |
| 7   | **No load testing** — schedule generation performance unknown at scale                                 | MEDIUM   | Add performance benchmarks                                                 |
| 8   | **Two controller implementations** — legacy + DDD                                                      | LOW      | Plan migration path                                                        |
| 9   | **No seniority weighting** in fairness                                                                 | LOW      | Add seniority dimension to FairnessEngine                                  |
| 10  | **2 analytics test failures** — pre-existing                                                           | LOW      | Fix `holiday` mock in test                                                 |

---

## 24. Top 10 Architectural Findings

| #   | Finding                                                                                                                        | Impact                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| 1   | **95 Prisma models, 48 enums** — very large schema for a scheduling system                                                     | Schema complexity is high; need modular Prisma schemas or careful migration strategy |
| 2   | **DDD Aggregate Root pattern is well-implemented** — Schedule aggregate enforces invariants, emits events, supports versioning | Strong foundation for Phase 5B; new features can build on existing domain            |
| 3   | **ConstraintEngine is production-quality** — 12 hard constraints with lookup-optimized validation                              | Can be extended with soft constraints without breaking changes                       |
| 4   | **Frontend has 13 scheduling services** — most logic lives client-side                                                         | Server-side equivalents needed for production scheduling                             |
| 5   | **`FairnessEngine` uses CV-based scoring** — fair but doesn't consider seniority or preferences                                | Need weighted fairness with seniority dimension                                      |
| 6   | **No `ServiceLine` model** — service line is implicit from UnitType                                                            | Must introduce before Radiation Oncology-specific scheduling                         |
| 7   | **Two scheduling controllers** — legacy + DDD                                                                                  | Migration path needed; DDD should become primary                                     |
| 8   | **Schedule generation is greedy-only on backend** — no optimization loop                                                       | Frontend has genetic algorithm; backend needs equivalent                             |
| 9   | **Security is comprehensive** — 38 behavioral tests, fail-closed guard, four-eyes principle                                    | Security is solid; no changes needed for Phase 5B                                    |
| 10  | **No dry-run/simulation mode** — preview exists but no full simulation with scoring                                            | Critical for Phase 5B; supervisors need to evaluate before applying                  |

---

## 25. Top 10 Recommended Next Steps

| #   | Step                                                                                           | Priority | Effort        |
| --- | ---------------------------------------------------------------------------------------------- | -------- | ------------- |
| 1   | **Build backend `ScheduleOptimizerService`** — port genetic algorithm from frontend to backend | HIGH     | 2-3 weeks     |
| 2   | **Introduce `SoftConstraint` interface** — extend ConstraintEngine with soft constraints       | HIGH     | 1 week        |
| 3   | **Create `ServiceLineScheduler` strategy pattern** — separate Imaging vs Radiation Oncology    | HIGH     | 1-2 weeks     |
| 4   | **Build dry-run API** — full simulation with scoring, no DB persistence                        | HIGH     | 1 week        |
| 5   | **Extract shared domain logic** — move fairness, fatigue, scoring to shared backend services   | MEDIUM   | 1 week        |
| 6   | **Delete `schedules/schedules/` duplicate** — clean up 314 TS errors                           | MEDIUM   | 1 hour        |
| 7   | **Add performance benchmarks** — k6 scripts for schedule generation                            | MEDIUM   | 3 days        |
| 8   | **Fix 2 analytics test failures** — add `holiday` mock                                         | LOW      | 1 hour        |
| 9   | **Plan DDD migration path** — deprecate legacy controller                                      | LOW      | Planning only |
| 10  | **Add seniority dimension to FairnessEngine** — weight fairness by seniority                   | LOW      | 2 days        |

---

## 26. Recommendations

### Architecture

1. **Keep existing constraint engine** — extend with soft constraints, don't replace
2. **Build backend optimizer** — don't rely on frontend-only optimization
3. **Introduce strategy pattern for service lines** — critical for Radiation Oncology
4. **Migrate to DDD primary** — deprecate legacy controller gradually
5. **Shared domain logic** — fairness, fatigue, scoring should be backend-only

### Database

1. **Don't create `ServiceLine` model** — use strategy pattern in code, UnitType in DB
2. **Don't add more enums to `Personnel.role`** — use RBAC system instead
3. **Keep Prisma schema as-is** — 95 models is large but stable

### Testing

1. **Add generation tests** — test ScheduleAutoGeneratorService
2. **Add workflow tests** — test status transitions
3. **Add performance benchmarks** — k6/Artillery for schedule generation
4. **Fix analytics tests** — add `holiday` mock

### Frontend

1. **Defer frontend optimization** — server-side optimizer is priority
2. **Keep existing scheduling services** — they work as client-side preview
3. **Add dry-run UI** — show scoring before applying

---

## 27. Recommended Implementation Order

### Phase 5B: Scheduling Engine (Recommended Sequence)

| Step | Feature                                               | Dependencies                     | Effort    |
| ---- | ----------------------------------------------------- | -------------------------------- | --------- |
| 1    | Delete `schedules/schedules/` duplicate               | None                             | 1 hour    |
| 2    | Add `SoftConstraint` interface + 3-4 soft constraints | ConstraintEngine                 | 1 week    |
| 3    | Build `ScheduleOptimizerService` (genetic algorithm)  | ConstraintEngine, FairnessEngine | 2-3 weeks |
| 4    | Build dry-run API (POST `/schedules/dry-run`)         | ScheduleOptimizerService         | 1 week    |
| 5    | Create `ServiceLineScheduler` strategy pattern        | UnitType enum                    | 1-2 weeks |
| 6    | Extract fairness/fatigue/scoring to backend services  | FairnessEngine, ScoringModel     | 1 week    |
| 7    | Build swap recommendation engine (backend)            | FairnessEngine, ConstraintEngine | 1 week    |
| 8    | Add seniority weighting to FairnessEngine             | FairnessEngine                   | 2 days    |
| 9    | Add performance benchmarks                            | ScheduleOptimizerService         | 3 days    |
| 10   | Integration testing                                   | All above                        | 1 week    |

**Total estimated effort:** 8-10 weeks

---

## 28. Phase 5B Readiness Assessment

### PHASE 5B READY: YES

| Criterion                   | Status | Evidence                                                  |
| --------------------------- | ------ | --------------------------------------------------------- |
| Constraint system exists    | ✅     | 12 hard constraints, ConstraintEngine, 20 violation rules |
| Fairness engine exists      | ✅     | FairnessEngine, 4 dimensions, CV-based scoring            |
| Scoring model exists        | ✅     | ScoringModel, weighted average, configurable weights      |
| Domain model exists         | ✅     | DDD Aggregate, Entity, ValueObject, Events, Repository    |
| Security is solid           | ✅     | 38/38 tests, fail-closed, four-eyes, RBAC                 |
| Database schema is complete | ✅     | 95 models, all scheduling entities present                |
| API surface is defined      | ✅     | Legacy + DDD controllers, full CRUD + workflow            |
| Frontend has working UI     | ✅     | 40 files, signals-based store, 28 computed values         |
| Generation exists (basic)   | ✅     | Greedy backend, genetic frontend                          |
| Version control works       | ✅     | ScheduleSnapshot, rollback, optimistic concurrency        |

### What's Needed for Phase 5B

| Item                      | Priority | Can Start Immediately                             |
| ------------------------- | -------- | ------------------------------------------------- |
| Backend optimizer service | HIGH     | YES (fairness, scoring, constraint engines exist) |
| Soft constraints          | HIGH     | YES (ConstraintEngine extensible)                 |
| Service line strategy     | HIGH     | YES (UnitType enum exists)                        |
| Dry-run API               | HIGH     | YES (preview() exists as starting point)          |
| Shared domain logic       | MEDIUM   | YES (extraction, not creation)                    |
| Performance benchmarks    | MEDIUM   | YES (existing endpoints testable)                 |

### Blockers

| Blocker       | Status | Resolution |
| ------------- | ------ | ---------- |
| None critical | —      | —          |

### Pre-Phase 5B Cleanup (Recommended)

1. Delete `schedules/schedules/` duplicate (1 hour)
2. Fix 2 analytics test failures (1 hour)
3. Document `ServiceLine` strategy pattern design (1 day)

---

_Report generated: 2026-08-25_
_Phase 5A Status: COMPLETE_
_Phase 5B Status: READY TO BEGIN_
