# Authorization Model

> Evidence-based documentation of the authorization stack as implemented in
> `backend/src` and `frontend/src`. All references point to real code.

## RBAC Architecture (role hierarchy)

Authorization is enforced by a **three-layer guard chain** applied at the controller level:

```
JwtAuthGuard  →  RolesGuard  →  ScheduleAccessGuard / PermissionGuard
(coarse authn)   (role level)   (resource + permission)
```

Example wiring: `backend/src/modules/schedules/schedules-ddd.controller.ts:42`
(`@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)`).

**Role hierarchy** — both backend and frontend use the same numeric levels
(higher = more authority):

| Role                 | Level |
| -------------------- | ----- |
| SYSTEM_ADMIN         | 1000  |
| HOSPITAL_ADMIN       | 800   |
| IMAGING_DIRECTOR     | 600   |
| SUPERVISOR           | 500   |
| MEDICAL_ENGINEER     | 400   |
| SENIOR_TECHNICIAN    | 300   |
| TECHNICIAN           | 200   |
| ASSISTANT_TECHNICIAN | 150   |
| SECRETARY            | 100   |
| GUEST                | 50    |

Sources:

- Backend canonical table: `backend/src/modules/rbac/interfaces/rbac.types.ts:3-14` (`ROLE_LEVELS`)
- Legacy/shared hierarchy: `backend/src/guards/role-guards.ts:10-21` (`ROLE_HIERARCHY`) with `hasMinRole()` at `backend/src/guards/role-guards.ts:24-26`
- Frontend mirror: `frontend/src/app/shared/utils/role-hierarchy.ts:1-12` and duplicated in `frontend/src/app/guards/auth.guard.ts:6-17`

**RolesGuard semantics** (`backend/src/modules/auth/guards/roles.guard.ts`):

- Reads `@Roles(...)` metadata via `Reflector.getAllAndOverride` (handler overrides class) — `roles.guard.ts:12-15`.
- No metadata ⇒ allow (`roles.guard.ts:17-19`).
- Among multiple required roles it picks the _lowest_ required level, then checks `hasMinRole(userRole, minRequired)` — `roles.guard.ts:29-37`. So `@Roles(MinRole.SUPERVISOR, MinRole.IMAGING_DIRECTOR)` effectively means "at least supervisor".
- Missing user or role ⇒ deny (`roles.guard.ts:23-25`).

**MinRole aliases** map friendly names to hierarchy entries, including deprecated aliases
(`HEAD_TECHNICIAN`, `FIELD_SUPERVISOR`, `PLANNER`, `ADMIN`, `SUPER_ADMIN`):
`backend/src/guards/min-role.ts:4-35`. Unit-scoped roles are enumerated in
`UNIT_SCOPED_ROLES` (`SENIOR_TECHNICIAN`, `MEDICAL_ENGINEER`, `SUPERVISOR`) at
`backend/src/guards/min-role.ts:38-42`.

## Permission Model

Fine-grained permissions complement the coarse role gate. Permission strings are
seeded per module/action, e.g. the `schedule.*` catalog in
`backend/src/modules/rbac/seeds/rbac-seed.data.ts:25-37`
(`schedule.create`, `schedule.read`, `schedule.update`, `schedule.delete`,
`schedule.generate`, `schedule.validate`, `schedule.submit`, `schedule.approve`,
`schedule.reject`, `schedule.publish`, `schedule.archive`, `schedule.rollback`,
`schedule.override`).

**Declaration**: `@Permissions('schedule.approve')` sets string metadata —
`backend/src/modules/rbac/decorators/permissions.decorator.ts:3-4`.

**Enforcement** (`backend/src/modules/rbac/guards/permission.guard.ts`):

1. No required permissions declared ⇒ allow — `permission.guard.ts:25-27`.
2. Unauthenticated request ⇒ `ForbiddenException` — `permission.guard.ts:33-35`.
3. **SYSTEM_ADMIN bypass**: max role level ≥ 1000 short-circuits to allow — `permission.guard.ts:37-40` (level from `RbacService.getUserMaxRoleLevel`, `backend/src/modules/rbac/rbac.service.ts:127-130`).
4. Otherwise all listed permissions must be present in the user's resolved permission set — `permission.guard.ts:47-52,75-78`.

**Permission resolution** (`RbacService.getUserPermissions`,
`backend/src/modules/rbac/rbac.service.ts:34-103`):

- Loads active `userRoleAssignment` rows scoped to the caller's organization/unit context.
- Collects direct role permissions **plus child-role permissions** where the child's level ≤ parent's level (`rbac.service.ts:88-95`) — an inheritance walk down the role tree.
- Results are cached for ~15 seconds per user+scope key (`rbac.service.ts:99-100`).
- On query failure it fails closed with empty permissions (`rbac.service.ts:76-79`).

**Denials are audited**: `PermissionGuard.logPermissionDenied` writes a
`PERMISSION_DENIED` audit entry with IP, user-agent, method, path and the
required permission list — `permission.guard.ts:83-97` (invoked at
`permission.guard.ts:69` and `permission.guard.ts:76`).

**Scope-fallback path**: if the flat check fails but the endpoint declares a
`@ScopeLevel`, the guard re-checks against permissions aggregated from
_scope-covering_ role assignments via `ScopeResolutionService.resolveCoveringAssignments`
— `permission.guard.ts:54-73`.

There is also a legacy boolean capability matrix (`canView/canEdit/canSubmit/...`)
in `backend/src/guards/role-guards.ts:41-82` consumed through
`RoleGuard.canPerformAction` (`role-guards.ts:85-89`). It coexists with, but is
secondary to, the permission-string model.

## Resource Authorization (ScheduleAccessGuard)

`ScheduleAccessGuard` (`backend/src/modules/schedules/guards/schedule-access.guard.ts`)
performs cross-tenant checks on any route carrying `:id`:

1. No authenticated user ⇒ `ForbiddenException` — `schedule-access.guard.ts:20-22`.
2. `system_admin` bypasses entirely (no DB lookup) — `schedule-access.guard.ts:24-26`.
3. No `params.id` (collection routes) ⇒ allow — `schedule-access.guard.ts:28-31`.
4. Loads only `{ unitId, organizationId }` for the schedule — `schedule-access.guard.ts:33-36`; missing schedule ⇒ `NotFoundException` (`schedule-access.guard.ts:38-40`), so existence is not leaked across tenants.
5. Organization match required when both sides have an `organizationId`; mismatch ⇒ `ForbiddenException('Access denied: schedule belongs to another organization')` — `schedule-access.guard.ts:42-47`.
6. Fallback unit comparison; on unit mismatch it resolves the schedule unit's organization and rejects if that differs from the caller's — `schedule-access.guard.ts:49-61`.
7. Final fallthrough allows (`schedule-access.guard.ts:63`) — see Risk Classification.

Behavior is pinned by tests: cross-organization rejection and admin bypass in
`backend/src/modules/schedules/__tests__/security-invariants.spec.ts:155-178`,
and repository-level tenant filtering (`findAll({ organizationId })`) in
`security-invariants.spec.ts:112-124`.

## Unit Scope Resolution

Scope resolution answers "does role assignment X cover target scope Y?".

**Hierarchy order**: `'group' > 'organization' > 'hospital' > 'department' > 'unit'`
— `HIERARCHY_SCOPE_ORDER` in `backend/src/modules/rbac/interfaces/rbac.types.ts:29-31`;
a role assignment row carries nullable `hospitalGroupId/hospitalId/departmentId/unitId/organizationId`
columns (`rbac.types.ts:40-48`).

**Coverage algorithm** (`ScopeResolutionService.covers`,
`backend/src/modules/rbac/services/scope-resolution.service.ts:41-67`):

- Walks top-down: group match may satisfy hospital-level targets (`scope-resolution.service.ts:42-45`), hospital match satisfies department/unit targets (`:46-49`), department match satisfies unit targets (`:50-53`), exact unit match terminates (`:54-57`).
- Any concrete mismatch on a shared dimension fails immediately.
- A second block re-affirms exact matches on any single dimension (`:58-66`).
- Helpers: `getScopeLevel` derives the coarsest level of an assignment (`scope-resolution.service.ts:69-76`); `scopeLevelWeight` returns its index in `HIERARCHY_SCOPE_ORDER` (`:78-80`).

**Consumers**:

- Active assignments are loaded with `{ userId, isActive: true }` — `scope-resolution.service.ts:21-35`.
- `PermissionGuard` uses covering assignments to grant permissions declared at a specific scope level (`permission.guard.ts:54-72`).

**Unit-scoped roles**: `SUPERVISOR`, `MEDICAL_ENGINEER`, `SENIOR_TECHNICIAN` are flagged
unit-scoped in `backend/src/guards/min-role.ts:38-46` (`isUnitScopedRole`).

## Four-Eyes Approval

The submit → approve workflow enforces separation of duties in the application service,
not just in guards:

- `submitForReview` records `submittedBy` on the approval data — domain aggregate at
  `backend/src/modules/schedules/schedules/domain/aggregates/schedule.aggregate.ts:169`
  (`upsertApproval({ submittedBy: userId, ... })`).
- `approve` rejects if the approver equals the submitter:
  `backend/src/modules/schedules/schedule-application.service.ts:108-111` —

  ```ts
  const submittedBy = schedule.approvalData?.submittedBy;
  if (submittedBy && submittedBy === userId) {
    throw new ForbiddenException(
      "Four-eyes principle: the person who submitted for review cannot also approve",
    );
  }
  ```

- Regression test: `backend/src/modules/schedules/__tests__/security-invariants.spec.ts:182-196`
  ("four-eyes principle — submitter cannot approve", expects `/Four-eyes principle/`).

Supporting controls around the approval flow:

- Approve/reject/publish endpoints require `IMAGING_DIRECTOR` minimum plus dedicated
  permissions and are rate-limited (`@Throttle` limit 10/min for approve/reject,
  5/min for publish) — `schedules-ddd.controller.ts:160-199`.
- Publish additionally blocks on hard validation violations and runs under a
  distributed lock — `schedule-application.service.ts:125-142`.
- Optimistic concurrency (`expectedVersion` → `StaleVersionError`) prevents lost updates
  during review — tested at `security-invariants.spec.ts:83-110`.

Note: the older workflow service path (`backend/src/modules/schedules/schedules/schedules-workflow.service.ts:93,128`)
records `submittedBy` too; the explicit four-eyes rejection lives in the DDD application service shown above.

## Frontend Authorization

Frontend checks are UX-only; the backend remains the authority
(`backend/src/guards/role-guards.ts:4` states "MUST be enforced on backend").

**Route guards** (`frontend/src/app/guards/auth.guard.ts`):

- `authGuard` — authentication only, redirects to `/login` (`auth.guard.ts:19-29`).
- `roleGuard` — compares numeric role level against `route.data.minRole`, redirecting to dashboard on failure (`auth.guard.ts:31-51`); duplicates the hierarchy table locally (`auth.guard.ts:6-17`).
- `rbacGuard` — awaits permission loading (`ensureLoaded()`) then checks `route.data.permissions` in `all` (default) or `any` mode (`auth.guard.ts:53-71`).

**Permission state** (`frontend/src/app/services/rbac.service.ts`):

- Permissions + role assignments fetched once from `GET /rbac/me/permissions` (`rbac.service.ts:37-54`); fetch failure yields empty permission set (fail closed for UI, `rbac.service.ts:47-50`).
- Predicates `hasPermission` / `hasAllPermissions` / `hasAnyPermission` over a signal-backed list (`rbac.service.ts:56-66`); role predicates at `rbac.service.ts:68-74`.

**Structural directive** `appHasPermission`
(`frontend/src/app/core/directives/has-permission.directive.ts`):

- Accepts a single permission (`all` mode) or array (`any` mode) — `has-permission.directive.ts:18-28`.
- Creates/clears the embedded view reactively as permissions change (`has-permission.directive.ts:30-39,46-75`); empty permission string renders content unconditionally (`:46-50,60-64`).

**Hierarchy mirror** for labels/level checks: `frontend/src/app/shared/utils/role-hierarchy.ts:1-32`.

## IDOR Protection

Insecure-Direct-Object-Reference defenses currently in place:

| Vector                         | Defense                                                                  | Reference                                                                    |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Schedule by id                 | Tenant ownership check before handler executes                           | `schedule-access.guard.ts:33-47`                                             |
| Nonexistent id                 | `NotFoundException` instead of leaking emptiness differences             | `schedule-access.guard.ts:38-40`                                             |
| Repository reads               | Forced `organizationId` filter on collection queries                     | `security-invariants.spec.ts:112-124`                                        |
| Assignment writes              | Version-checked load-then-save inside aggregate; stale versions rejected | `schedule-application.service.ts:83-96`, `security-invariants.spec.ts:84-95` |
| Approval self-deal             | Submitter ≠ approver enforcement                                         | `schedule-application.service.ts:108-111`                                    |
| Privilege escalation at signup | Self-registration cannot assign admin roles (captured role asserted)     | `security-invariants.spec.ts:210-219`                                        |

**Known gaps (candidate hardening work):**

1. `GET jobs/:jobId`, `GET :id/jobs`, and `POST jobs/:jobId/cancel`
   override class guards with only `JwtAuthGuard` — no `RolesGuard`, no
   `Permissions`, and `cancelJob` accepts any authenticated caller
   (`schedules-ddd.controller.ts:293-316`). Job IDs are guessable/enumerable strings;
   `getJobStatus` never verifies job→organization ownership
   (`schedules-ddd.controller.ts:296-300`).
2. `ScheduleAccessGuard` final fallthrough returns `true` when neither side has an
   `organizationId`/`unitId` pair to compare (`schedule-access.guard.ts:49-63`) — a
   user lacking both claims passes for any schedule.
3. `GET :id/versions/:version` declares only `MinRole.SUPERVISOR` without a
   permission requirement (`schedules-ddd.controller.ts:242-250`); the guard chain still
   applies tenant checks, but version snapshots bypass the permission layer.
4. The legacy `list` endpoint filters by optional `unitId` query without forcing the
   caller's own org scope server-side (`schedules-ddd.controller.ts:67-80`); tenant safety
   relies on repository defaults demonstrated in tests rather than controller input clamping.

## Risk Classification

| #   | Finding                                                                                                                          | Severity   | Rationale                                                                                                                                                   |
| --- | -------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Job status/cancel endpoints lack role+permission+tenant checks (`schedules-ddd.controller.ts:293-316`)                           | **High**   | Authenticated low-privilege user can read other units' job payloads and cancel arbitrary generation/export jobs — direct IDOR with write effect (`cancel`). |
| 2   | `ScheduleAccessGuard` fallthrough allows requests whose user has no `organizationId`/`unitId` (`schedule-access.guard.ts:49-63`) | **High**   | Any JWT with missing scope claims bypasses tenant isolation for every `:id` route.                                                                          |
| 3   | Four-eyes not mirrored in legacy workflow path (`schedules-workflow.service.ts:128`)                                             | **Medium** | If any route still reaches the legacy `approve`, separation of duties depends on which service instance is wired.                                           |
| 4   | Version snapshot endpoint has no permission requirement (`schedules-ddd.controller.ts:242-250`)                                  | **Low**    | Supervisor-minimum plus tenant guard limits exposure; defense-in-depth gap only.                                                                            |
| 5   | 15-second permission cache after role changes (`rbac.service.ts:99-100`)                                                         | **Low**    | Revocations lag ≤ 15 s; acceptable window, worth documenting for auditors.                                                                                  |
| 6   | Duplicated role tables across `role-guards.ts:10-21`, `rbac.types.ts:3-14`, `auth.guard.ts:6-17`, `role-hierarchy.ts:1-12`       | **Low**    | Drift risk between four copies of the same constants; single source of truth recommended.                                                                   |

Mitigation priorities: add `ScheduleAccessGuard`-equivalent ownership checks (or job→schedule
org verification) to the three job endpoints; fail closed in `ScheduleAccessGuard` when
the caller has no scope claims; consolidate role constants into one module imported everywhere.
