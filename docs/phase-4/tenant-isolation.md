# Phase 4: Tenant Isolation Architecture

**Date:** 2026-08-23
**Scope:** Multi-tenancy enforcement across HTTP, Prisma, and WebSocket layers

---

## Multi-Tenant Architecture

VardiyaOS uses a **single database, shared schema** model with row-level tenant discrimination via an `organizationId` column. There are no separate schemas or databases per tenant; every tenant boundary is enforced in application code.

The tenant hierarchy is `Organization` (`backend/prisma/schema.prisma:359`) → `Unit` (`schema.prisma:462`) → operational rows (`Schedule`, `Assignment`, …). Of the 95 models in `schema.prisma`, **15 carry a direct `organizationId` column**:

| Model                 | Schema location    | Column    |
| --------------------- | ------------------ | --------- |
| `UserRoleAssignment`  | schema.prisma:259  | `String?` |
| `User`                | schema.prisma:290  | `String?` |
| `Unit`                | schema.prisma:467  | `String?` |
| `DutyRoster`          | schema.prisma:564  | `String`  |
| `Device`              | schema.prisma:679  | `String?` |
| `Shifts`              | schema.prisma:718  | `String`  |
| `PersonnelGroup`      | schema.prisma:760  | `String?` |
| `PersonShiftTemplate` | schema.prisma:783  | `String?` |
| `Schedule`            | schema.prisma:808  | `String?` |
| `AuditLog`            | schema.prisma:948  | `String?` |
| `Recommendation`      | schema.prisma:1034 | `String`  |
| `Conflict`            | schema.prisma:1071 | `String`  |
| `InviteCode`          | schema.prisma:1096 | `String`  |
| `Notification`        | schema.prisma:1169 | `String`  |
| `EnterpriseAsset`     | schema.prisma:2063 | `String?` |

Isolation is enforced in **four layers**, each independently verifying tenancy:

1. **Identity layer** — `organizationId` is baked into the JWT at login (`backend/src/modules/auth/auth.service.ts:457-464`) and refreshed from the DB on every authenticated HTTP request via `JwtStrategy.validate()` (`backend/src/modules/auth/jwt.strategy.ts:35-57`, backed by `AuthService.validateUser()` selecting `organizationId`/`unitId` at `auth.service.ts:433-445`).
2. **Context propagation layer** — `TenantContextInterceptor` opens an AsyncLocalStorage scope per request (`backend/src/infrastructure/tenant-context.interceptor.ts:16-36`).
3. **Database layer** — a global Prisma middleware injects `organizationId` into queries (`backend/src/infrastructure/prisma/middleware/tenant.middleware.ts:14-55`), registered in `PrismaService.onModuleInit()` (`backend/src/prisma.service.ts:23`).
4. **Resource/presentation layers** — `ScheduleAccessGuard` on REST controllers and explicit checks inside the WebSocket gateway.

---

## Tenant Context Propagation (AsyncLocalStorage → Prisma middleware)

### Context storage

The context is a module-level `AsyncLocalStorage<{ organizationId: string }>` exported from the middleware file itself:

```ts
// backend/src/infrastructure/prisma/middleware/tenant.middleware.ts:4
export const tenantContext = new AsyncLocalStorage<{
  organizationId: string;
}>();
```

### Activation per HTTP request

`TenantContextInterceptor` is registered globally as an `APP_INTERCEPTOR` (`backend/src/app.module.ts:175-178`), ordered after `CorrelationInterceptor` and before `InactivityInterceptor`. Because Nest runs guards before interceptors, `request.user` is already populated by `JwtAuthGuard` when it executes (documented in the interceptor header, `tenant-context.interceptor.ts:12-13`).

Behavior (`tenant-context.interceptor.ts:17-36`):

- Reads `request.user.organizationId` (line 21).
- If the user has **no** organization (e.g., platform admins, unclaimed accounts), it passes through **without opening a store** — the Prisma middleware stays dormant for that request (lines 23-25).
- Otherwise it wraps the downstream handler+interceptor chain in `tenantContext.run({ organizationId }, ...)` (lines 27-35). The manual Observable bridging keeps the ALS context alive across RxJS async boundaries.

### Consumption in Prisma middleware

`createTenantMiddleware()` is attached first among the three global middlewares (tenant → soft-delete → optimistic locking, `prisma.service.ts:23-25`) and consults the store on every query:

- No store → unconditional pass-through (`tenant.middleware.ts:19-20`). **Fail-open by design.**
- Model not in `TENANT_MODELS` → pass-through (`tenant.middleware.ts:22-23`).
- `create` → force-injects `data.organizationId`, overriding any caller-supplied value (lines 27-34).
- Read/update/delete/count/aggregate → injects `where.organizationId` **only if the caller did not specify one** (lines 36-52). Callers can therefore _narrow_ (e.g., repo passing both `organizationId` and `unitId`, see `backend/src/modules/schedules/infrastructure/prisma-schedule.repository.ts:67-72`) but never _widen_ beyond their own tenant.

`tenantContext.run` is invoked from exactly one place — the interceptor (verified by grep). WebSocket handlers, cron jobs, queue workers, and seed scripts run with **no store**, relying entirely on explicit filtering (see Known Limitations).

---

## Database-Level Isolation (organizationId on 15+ models, Prisma middleware injection)

### The `TENANT_MODELS` whitelist

```ts
// backend/src/infrastructure/prisma/middleware/tenant.middleware.ts:6-10
const TENANT_MODELS = new Set([
  "Schedule",
  "Assignment",
  "Personnel",
  "Device",
  "Unit",
  "ShiftTask",
  "HandoverNote",
  "DeviceIncident",
  "AttendanceRecord",
  "SwapRequest",
  "Notification",
  "Training",
  "Skill",
  "Shifts",
  "AssignmentSlot",
]);
```

**Critical observation:** this list and the physical schema have drifted. Only 5 of the 15 whitelisted models actually have an `organizationId` column (`Schedule`, `Device`, `Unit`, `Notification`, `Shifts`). The other 10 (`Assignment`, `Personnel`, `ShiftTask`, `HandoverNote`, `DeviceIncident`, `AttendanceRecord`, `SwapRequest`, `Training`, `Skill`, `AssignmentSlot`) have **no such column** in `schema.prisma` (e.g., `Assignment` spans schema.prisma:873-920 with no `organizationId` field). Conversely, column-bearing models like `AuditLog`, `Recommendation`, `Conflict`, `InviteCode`, `EnterpriseAsset`, `DutyRoster`, `PersonnelGroup`, `PersonShiftTemplate`, `User`, `UserRoleAssignment` are **not** in the whitelist and receive no automatic injection. Consequences are detailed under Findings (#1).

### Injection semantics

For whitelisted models with an active store:

- **Writes:** `data.organizationId` is stamped server-side; clients cannot spoof another tenant even if they send the field (`tenant.middleware.ts:29-32` spread order puts the store value last).
- **Reads:** `where.organizationId` is appended unless already present (`tenant.middleware.ts:49-51`), so tenant scoping composes with domain filters instead of being replaced by them.

Child rows that lack their own column (`Assignment`, snapshots, etc.) inherit tenancy transitively through their parent `scheduleId` relation — the repository always scopes children by `scheduleId` inside the save transaction (`prisma-schedule.repository.ts:117-149`), and the parent schedule itself is org-filtered.

### Physical safeguards

- `schedules.organizationId` was added with backfill from `units.organizationId` plus an FK in migration `20260821000000_assignment_source_and_tenant_isolation/migration.sql:11-25`.
- Tenant-scoped indexes exist: `@@index([organizationId])` and `@@index([organizationId, status])` on Schedule (schema.prisma:829-830), `notifications_organizationId_idx` (`20260522000001_v2_enterprise_hardening/migration.sql:28`), and composite `(organizationId, createdAt)` on audit_logs (`20260823000000_add_schedule_audit_indexes/migration.sql:7-8`).
- Per-tenant uniqueness: `units_organizationId_code_key` and `devices_organizationId_code_key` (initial baseline migration, lines 311, 314).

There is **no Postgres RLS**; the middleware is the only automatic DB-level control (see Known Limitations).

---

## API-Level Isolation (resource authorization, ScheduleAccessGuard)

`ScheduleAccessGuard` (`backend/src/modules/schedules/guards/schedule-access.guard.ts:13-64`) is the resource-level boundary for all schedule ID routes, applied on both controllers:

- Legacy: `@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)` — `backend/src/modules/schedules/schedules.controller.ts:54`
- DDD: same trio — `backend/src/modules/schedules/schedules-ddd.controller.ts:42`

Decision flow:

1. Unauthenticated → `ForbiddenException` (guard:20-22).
2. `system_admin` bypasses entirely, before any DB hit (guard:24-26) — verified by test that asserts `findUnique` is _not_ called (security-invariants.spec.ts:174-177).
3. Loads `{ unitId, organizationId }` for `params.id` (guard:33-36); unknown id → 404 (guard:38-40).
4. **Primary check:** if both parties have an `organizationId`, they must match or access is denied with _"schedule belongs to another organization"_ (guard:42-47).
5. **Fallback for legacy null-org rows:** compares `unitId`; on mismatch it resolves the schedule's unit → organization and rejects cross-org again (guard:49-61). This two-hop verification covers rows created before the backfill migration.

Controller-level tenant propagation complements the guard: `findAll` passes `user.organizationId` into the repository filter (schedules.controller.ts:95, consumed at prisma-schedule.repository.ts:72), and analytics/dashboard endpoints derive their entire dataset from the token identity rather than client input (schedules.controller.ts:323, 330).

---

## WebSocket Isolation (subscription tenant boundary, room-level filtering)

The realtime plane (`/realtime` namespace, `backend/src/modules/websocket/schedule.gateway.ts:45-51`) does **not** go through Nest guards/interceptors, so it re-implements the tenant boundary explicitly.

### Connection authentication

`handleConnection` extracts the JWT from `handshake.auth.token` or the Authorization header (gateway:222-229), verifies it with `algorithms: ['HS256']` pinned (gateway:231), and copies claims onto the socket: `organizationId` and `unitId` at gateway:236-237. Connections without a valid token are disconnected. Origin allow-list and per-IP rate limiting run before token verification (gateway:197-220).

### Subscription boundaries (gateway:330-375)

- **`subscribe:organization`** (gateway:330-346): the requested `organizationId` must equal `client.organizationId`; mismatch emits `error: Unauthorized organization access` and refuses the `join`. Room name: `org:{organizationId}` (gateway:340).
- **`subscribe:schedule`** (gateway:348-390):
  1. Loads the schedule's `{ organizationId, unitId }` (gateway:353-356).
  2. **Tenant check:** if socket org ≠ schedule org → emit `Access denied: cross-tenant schedule subscription`, log a warning tagged `Tenant isolation:`, and return **before joining the room** (gateway:363-367).
  3. **Unit check:** non-`system_admin`/non-`hospital_admin` users whose `unitId` differs from the schedule's unit are blocked with `cross-unit schedule subscription` (gateway:369-373).
  4. Only then is `schedule:{id}` joined (gateway:375) and sync state (lock/viewers/version) emitted (gateway:377-387).

### Room-level filtering

All fan-out is room-scoped: lock events target `schedule:{id}` rooms (e.g., `emitWithDedup(\`schedule:${id}\`, ...)`at gateway:315-319, 417+), personal events target`user:{userId}` (join at gateway:275), and presence broadcasts are addressed per organization (`broadcastPresenceUpdate(orgId)` on connect/disconnect, gateway:284-286, 322-324). A socket can therefore never receive another tenant's events without having passed the subscription checks above.

On disconnect, per-user edit locks held in any schedule room are released and the release event is re-broadcast to the owning room (gateway:308-320), preventing lock leakage across tenants sharing a Redis-backed lock registry.

---

## Unit Scoping (unitId enforcement at controller, guard, and WS layers)

Unit is a sub-tenant boundary (department within a hospital). It is enforced differently at each layer:

| Layer               | Mechanism                                                                                                                                                                                     | Reference                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Controller (list)   | Unit-scoped roles (`isUnitScopedRole`, `backend/src/guards/min-role.ts:38-45`) get `unitId` **forced** to their own unit; supplying another unit's id → 403 `"Bu birime erişim yetkiniz yok"` | schedules.controller.ts:88-93       |
| Repository (query)  | `where.unitId` composed with `where.organizationId`                                                                                                                                           | prisma-schedule.repository.ts:68,72 |
| REST resource guard | Unit comparison only in the legacy fallback branch (when schedule/org ids are null); when organizations match, the guard approves regardless of unit                                          | schedule-access.guard.ts:42-61      |
| WebSocket           | Hard unit check on schedule subscription, admin roles exempted                                                                                                                                | schedule.gateway.ts:369-373         |

Design implication: for same-organization requests, unit isolation on REST is enforced through **query narrowing** (users can only list/see their unit's data) rather than through the resource guard, while WebSocket subscriptions enforce it positively. The guard's early return on org match (guard:46) means a same-org user who knows a foreign-unit schedule UUID can address single-resource endpoints subject to downstream business rules — see Findings (#3).

---

## Cross-Tenant Prevention (IDOR protection, two-layer verification)

### Two independent verifications per request

A cross-tenant IDOR attempt against `/schedules/{id}` must survive:

1. **Route guard** — `ScheduleAccessGuard` compares the row's `organizationId` with the token identity (guard:42-47).
2. **Query middleware** — even if a route lacks the guard, any subsequent Prisma read of a whitelisted, column-bearing model is re-scoped by `where.organizationId` derived from the ALS store (tenant.middleware.ts:49-51). Example: `GET /schedules/by-unit/:unitId` carries a `:unitId` path param, so `ScheduleAccessGuard`'s `params.id` check passes vacuously (guard:28-31); the defense is the middleware injecting org into the compound `findUnique` at prisma-schedule.repository.ts:54-56, causing a cross-tenant lookup to return `null`.

The WebSocket layer performs a third, structurally independent check because interceptors do not apply there (gateway:363-367).

### Server-side stamping

Client-supplied `organizationId` values cannot escalate writes: the middleware overwrites `data.organizationId` with the store value (tenant.middleware.ts:29-32), and the controller derives analytics scopes from `req.user`, never from the body.

### Concurrency safety around shared resources

`DistributedLockService` (`backend/src/infrastructure/distributed-lock.service.ts`) prevents split-brain mutations of the same schedule across horizontally scaled instances:

- Fair acquire via Redis `SET key value PX ttl NX` with owner-stamped lockIds (lines 14-32, key prefix `lock:` at line 9).
- Owner-checked release through a Lua compare-and-delete, so an expired lock's new owner cannot be evicted by the old holder (lines 34-52).
- `withLock<T>` wrapper guaranteeing release on success or failure (lines 54-69).

It is used per-resource by the application service: `withLock('schedule:publish:{id}', ...)` and `withLock('schedule:rollback:{id}', ...)` (`backend/src/modules/schedules/schedule-application.service.ts:126,167`). Lock keys are **not** tenant-prefixed, but keys embed UUID schedule ids and locks are only acquired post-authorization, so this is a consistency mechanism, not an isolation boundary.

---

## Tenant Isolation Test Coverage

Tests live in `backend/src/modules/schedules/__tests__/security-invariants.spec.ts` (vitest, penetration-style suite "F61" starting at line 57).

**F73: Tenant Isolation Invariants** (spec:112-148):

- _Repository scoping_ (spec:113-124): instantiates the real `PrismaScheduleRepository` against a mocked Prisma client and asserts `findAll({ organizationId })` produces `where: { organizationId }` — locking in the repo-layer contract consumed by the controller (schedules.controller.ts:95).
- _Same-tenant child rows_ (spec:126-148): drives `repo.save()` through a mocked `$transaction` and asserts assignment lookups are keyed by `scheduleId` and the schedule upsert targets `where.id` — i.e., children are managed strictly within their parent's scope. Note this test asserts schedule-scoped (not org-scoped) child access, matching the transitive inheritance design described above.

**F61: Cross-Unit Authorization** (spec:151-178):

- Constructs a `ScheduleAccessGuard` where the schedule has `organizationId: null, unitId: 'unit-A'` and the requester belongs to org-B/unit-B; asserts rejection with `ForbiddenException` matching `/another organization/` and verifies the exact Prisma probe `findUnique({ where: { id }, select: { unitId, organizationId } })` (spec:155-171).
- Asserts the `system_admin` bypass short-circuits **without touching the database** (spec:173-177).

**Coverage gaps:** there is no test executing `createTenantMiddleware()` itself (injection logic, spoof-overwrite, non-whitelisted actions), no integration/e2e test issuing a real cross-tenant HTTP request end-to-end, and no automated test for the WS `subscribe:schedule` tenant/unit rejections (gateway:363-373). The middleware is currently validated only indirectly through repository tests.

---

## Known Limitations

1. **Whitelist/schema drift (highest impact).** 10 of 15 `TENANT_MODELS` entries lack an `organizationId` column (see Database-Level Isolation). Once the ALS store is active — which is the case for every authenticated request since the interceptor was registered globally (app.module.ts:175-178) — any top-level Prisma operation in the intercepted actions on those models receives an unknown-field `where`/`data` argument, which Prisma rejects with a validation error. Symmetrically, ten column-bearing models are unprotected by the middleware. The whitelist must be regenerated from `schema.prisma`.
2. **Fail-open context.** Absence of an ALS store disables scoping silently (tenant.middleware.ts:19-20). All non-HTTP execution contexts — WS handlers, schedulers, job queues, seeds — run unscoped and depend on each developer remembering explicit `organizationId` filters.
3. **WS identity claims don't match the signer.** `generateToken` emits `{ sub, email, role, organizationId, jti, rbacLevel }` (auth.service.ts:457-464; refresh path re-signs identically via auth.service.ts:294), but the gateway reads `payload.id`, `payload.name`, and `payload.unitId` (gateway:233-235). Consequently `client.userId`/`userName` resolve to `undefined` and `client.unitId` is always unset — the unit branch at gateway:369-373 is effectively dead code for tokens produced by the current signer, weakening WS unit isolation (the org check still functions because `payload.organizationId` exists).
4. **Guard skips unit check on org match.** schedule-access.guard.ts:46 returns `true` as soon as organizations match, so same-org cross-unit access to single resources is allowed by design and relies on query narrowing and WS checks.
5. **Middleware action gaps.** `upsert`, `createMany`, `findUniqueOrThrow`, and `findFirstOrThrow` are not in the intercepted action set (tenant.middleware.ts:36-45). The core save path uses `upsert` heavily (prisma-schedule.repository.ts:97,113,133,149), so those operations are neither org-filtered nor org-stamped by the middleware; correctness depends on callers and guards.
6. **Nullable tenancy columns.** `Schedule.organizationId` is nullable (schema.prisma:808). Rows predating the backfill (migration `20260821000000`, lines 19-21) may be NULL and become invisible to org-scoped reads; users whose `organizationId` is null bypass the interceptor entirely (tenant-context.interceptor.ts:23-25).
7. **Stale duplicate source trees.** `backend/src/src/**` and `backend/src/modules/schedules/schedules/**` contain older copies of live files — including a `prisma-schedule.repository.ts` whose `findAll` builds `where` **without** `organizationId` (its lines 65-69 vs. the wired copy at `modules/schedules/infrastructure/prisma-schedule.repository.ts:67-72`). They are not imported (module wiring: schedules.module.ts:13), but any future refactor importing the wrong path silently drops tenant filtering. Recommend deletion.
8. **No database-native isolation.** Without RLS, any direct DB access, reporting pipeline, or SQL injection elsewhere bypasses all of the above.

---

## Findings & Risk Classification

| #   | Finding                                                                                                                                                                               | Severity            | Evidence                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------- |
| 1   | `TENANT_MODELS` whitelist diverged from schema: 10 whitelisted models lack the column (runtime validation errors once store active); 10 column-bearing models receive no auto-scoping | **HIGH**            | tenant.middleware.ts:6-10 vs schema.prisma:873-920 et al.; interceptor live at app.module.ts:175-178 |
| 2   | WS handshake expects `id`/`name`/`unitId` claims the JWT signer never emits → WS unit-isolation check is a no-op; presence/edit-lock attribution keyed to `undefined` userId          | **HIGH**            | gateway:233-237 vs auth.service.ts:457-464                                                           |
| 3   | Same-org requests skip unit verification in `ScheduleAccessGuard`; unit boundary on REST depends solely on query narrowing                                                            | MEDIUM              | schedule-access.guard.ts:42-47                                                                       |
| 4   | Fail-open tenant context outside HTTP scope; no opt-in scoping for jobs/WS                                                                                                            | MEDIUM              | tenant.middleware.ts:19-20; sole `tenantContext.run` call site is the interceptor                    |
| 5   | `upsert`/`createMany`/`*OrThrow` actions bypass middleware injection; save path relies on them                                                                                        | MEDIUM              | tenant.middleware.ts:36-45; prisma-schedule.repository.ts:97-155                                     |
| 6   | Stale duplicated source trees include a pre-isolation repository copy without org filter — silent-regression hazard                                                                   | MEDIUM              | `backend/src/modules/schedules/schedules/infrastructure/prisma-schedule.repository.ts:65-69`         |
| 7   | Nullable `organizationId` columns + null-org users fully bypass context propagation                                                                                                   | LOW–MEDIUM          | schema.prisma:808; tenant-context.interceptor.ts:23-25                                               |
| 8   | Distributed-lock keys are global, not tenant-namespaced                                                                                                                               | LOW (accepted)      | distributed-lock.service.ts:9; schedule-application.service.ts:126,167                               |
| 9   | No Postgres RLS; isolation is purely application-layer                                                                                                                                | LOW (architectural) | —                                                                                                    |

**Verified strengths:** server-side overwrite of client-supplied `organizationId` on creates (tenant.middleware.ts:29-32); compose-don't-replace `where` injection (tenant.middleware.ts:49-51); guard + middleware + WS triple verification on schedule access; HS256-pinned WS auth with deny-before-join ordering (gateway:363-375); owner-checked distributed lock release (distributed-lock.service.ts:37-43); regression tests pinning repo scoping and the guard's cross-org rejection (security-invariants.spec.ts:112-178).

**Recommended next steps (priority order):**

1. Regenerate `TENANT_MODELS` from the schema (script or codegen) and add a startup assertion that every entry has an `organizationId` column — closes Findings #1 and #5.
2. Align the WS gateway with the actual token claims (`sub` → `userId`; load `unitId`/`name` from DB on connect, mirroring `jwt.strategy.ts:35-57`) — closes Finding #2.
3. Add an e2e cross-tenant suite: HTTP IDOR probes, WS `subscribe:schedule` rejection, and a direct `createTenantMiddleware` unit test covering spoof-overwrite and non-whitelisted actions.
4. Delete the stale `backend/src/src/**` and `modules/schedules/schedules/**` trees.
