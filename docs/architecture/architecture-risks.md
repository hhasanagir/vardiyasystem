# Architecture Risks

**Date:** 2026-08-20

## Risk Matrix

| #   | Risk                                                | Severity | Category               | Effort to Fix |
| --- | --------------------------------------------------- | -------- | ---------------------- | ------------- |
| R1  | `schedules.service.ts` God Service (2,216 lines)    | CRITICAL | Maintainability        | HIGH          |
| R2  | DDD infrastructure built but unused                 | HIGH     | Architecture Debt      | MEDIUM        |
| R3  | Dual authorization (MinRole + RBAC)                 | HIGH     | Security               | MEDIUM        |
| R4  | No repository abstraction (Prisma in every service) | HIGH     | Architecture           | HIGH          |
| R5  | WebSocket injected into domain services             | HIGH     | Coupling               | MEDIUM        |
| R6  | Frontend/backend constraint duplication             | MEDIUM   | Consistency            | HIGH          |
| R7  | `plan-page` God Component (1,509 lines)             | HIGH     | Maintainability        | HIGH          |
| R8  | `firevibe-schedule` God Component (1,465 lines)     | HIGH     | Maintainability        | HIGH          |
| R9  | Frontend `schedule.service.ts` (1,427 lines)        | HIGH     | Maintainability        | MEDIUM        |
| R10 | Metrics instrumentation in business logic           | MEDIUM   | Separation of Concerns | LOW           |
| R11 | `InactivityInterceptor` bypasses service layer      | LOW      | Consistency            | LOW           |
| R12 | `PreloadAllModules` negates lazy loading            | LOW      | Performance            | LOW           |
| R13 | `forwardRef` patterns in module imports             | LOW      | Code Smell             | LOW           |
| R14 | `AppModule` with 59 imports                         | MEDIUM   | Maintainability        | LOW           |
| R15 | Token storage in localStorage                       | HIGH     | Security               | HIGH          |

## Detailed Risk Descriptions

### R1: schedules.service.ts God Service

The `SchedulesService` at 2,216 lines is the worst offender. It handles:

- CRUD operations
- Assignment validation (two separate validators)
- Override logic with role-based authorization
- Direct assignment with auto-create/auto-publish
- Shift override management
- Personal views (my shifts, my summary)
- Dashboard stats and analytics
- Duplicate/rollback/snapshot
- Reports and exports (Excel, PDF)
- Real-time notifications
- Version management

**Impact:** Untestable, unmaintainable, high coupling, violates SRP.
**Fix:** Decompose into 6-8 services (see Target Architecture).

### R2: Unused DDD Infrastructure

The `src/ddd/` directory contains a complete DDD building block library:

- `Entity<TProps>` with identity, versioning, soft-delete, domain events
- `AggregateRoot<TProps>` with event collection, commit, replay
- `ValueObject<T>` with immutable comparison
- `RepositoryPort<T>` CRUD interface
- `Command<TResult>` and `Query<TResult>` CQRS envelopes

Plus `src/infrastructure/` has:

- Two `BaseRepository` implementations (84 and 94 lines)
- `UnitOfWorkService` with AsyncLocalStorage (Global, never injected)

**None of these are used by any module.** The codebase is entirely "anemic model + Prisma-direct."

**Decision needed:** Adopt for schedules pilot, or remove to reduce confusion.

### R3: Dual Authorization System

Two global guards registered simultaneously:

1. **Legacy:** `CsrfGuard` using `@Role()`, `@MinRole()`, `@UnitScopedRole()` decorators with numeric hierarchy (50-1000)
2. **RBAC:** `PermissionGuard` using `@RequiredPermissions()` decorator with database-backed permissions

**Risk:** Potential authorization conflicts. Maintenance confusion.

### R5: WebSocket in Domain Services

`ScheduleGateway` is injected directly into:

- `SchedulesService`
- `PersonnelService`
- `SwapRequestsService`

Domain services call `gateway.broadcastPersonnelUpdate()` directly. Should use EventBus instead.

### R15: Token Storage in localStorage

JWT access and refresh tokens are stored in `localStorage`. This is vulnerable to XSS attacks. Should migrate to httpOnly cookies.
