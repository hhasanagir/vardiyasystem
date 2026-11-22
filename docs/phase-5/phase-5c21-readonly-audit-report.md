# Phase 5C.21 — Read-Only Product & Scheduling Architecture Maturity Audit

**System:** VardiyaOS — hospital imaging workforce scheduling platform
**Phase:** 5C.21 (READ-ONLY AUDIT — no implementation)
**Date:** 2026-09-12
**Authoritative repo:** `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`
**Prior phases:** 5C.17 CLOSED · 5C.18 CLOSED · 5C.19 audit COMPLETE · 5C.20 CLOSED (no P0/P1 remaining; 275/275 targeted+scope+gates; tsc/nest/FE clean; zero schema change)
**Role assumptions:** Principal Architect + Hospital Scheduling Domain Expert + Security/DDD Reviewer.

This is a **strict read-only** audit. No source, schema, migration, test, dependency, configuration, or UI file was modified. Only the report file itself was created.

---

## 1. Executive Summary

VardiyaOS has grown into a secure, workflow-disciplined scheduling product with a strong hardening legacy: tenant isolation (Prisma tenant middleware + per-module guards), unit scope (fail-closed), four-eyes, optimistic concurrency with `expectedVersion`, snapshots/rollback, an audit interceptor, and a substantial DDD scheduling domain. The 5C.17/5C.18/5C.20 fixes are sound and remain intact.

The central architectural finding for maturity:

- **Production schedule generation runs a hand-rolled deterministic greedy heuristic** (`ScheduleAutoGeneratorService.generate`) that does **not** use the separately-built, well-tested domain optimizer (`ScheduleOptimizerService` + greedy/local-search + `FairnessEngine`/`FatigueEngine`/`ScoreAggregator`). The domain optimizer is reachable **only** through the read-only `POST /schedules/optimize/dry-run` endpoint and never persists.
- The **new Angular scheduling feature's "Vardiya Üret" button performs a simulated generate** (it calls `validate`, returns `Math.random()` time and a configured algorithm name, persists nothing).
- A **complete solver stack (greedy + genetic + fatigue + rebalance) exists in `frontend/src/app/core/scheduling` and is imported by nobody** (dead code).
- The **BullMQ `schedule-jobs` processor is a simulation stub** that returns fabricated success; async job endpoints are dead-ended.
- The data model **lacks per-date leave/absence/availability** (only fixed weekly `offDays`), seniority is **never consumed by any fairness mode** (it is positional), `maxWeeklyHours` is loaded but **never enforced**, and there is **no minimum-coverage/mandatory-staffing** requirement — infeasibility is signaled only by warnings.

Result: the **security and workflow spine is production-grade**, but the **scheduling engine itself is not yet enterprise-authoritative**. Verdict: **READY WITH CONDITIONS** — 0 P0 / 0 P1 / 8 P2 / 11 P3, optimizer readiness **B (READY AFTER SMALL FOUNDATION WORK)**.

---

## 2. Scope

Audited: full backend scheduling domain (controllers, workflow, generator, validation, optimizer package, DDD aggregate/application/repository, job queue), Prisma data model, seeds and master configs, auth/RBAC/tenant/unit-scope infrastructure, audit/notifications/exports/device-off, and the Angular scheduling frontend (both legacy plan surface and new DDD feature). Excluded: modules unrelated to scheduling (finance/procurement/quality/compliance internals), infra/K8s. No files modified.

## 3. Repository Authority

Confirmed authoritative: `C:\Users\Hasan\OneDrive\Desktop\vardiyasystem`. The `Belgeler\GitHub\vardiyasystem` copy was not used as an evidence source. Working tree is a single-commit import; `backend/src`, `frontend/src`, `docs/`, `schema.prisma`, migrations are untracked, so changed-file provenance is timestamp-based (established in 5C.20). No destructive git operations performed.

## 4. Architecture Map

| Subsystem | Authoritative impl | Entrypoint | Persists | Frontend consumer | Duplicated? | Dead/orphan? |
|---|---|---|---|---|---|---|
| AuthN/JWT | `auth/jwt.strategy.ts:35-58` | `@UseGuards(JwtAuthGuard)` (per-controller) | users/tokens | auth interceptor | — | No |
| RBAC | `rbac/rbac.service.ts` + `RolesGuard` (`roles.guard.ts:7-39`) | `@UseGuards(RolesGuard)` | `UserRoleAssignment` | authorization.service | `models/schedule-status.ts` role maps (legacy) | No |
| Tenant isolation | `infrastructure/tenant-context.interceptor.ts` + `prisma/middleware/tenant.middleware.ts` (15 models) | APP_INTERCEPTOR + `prisma.service.ts:23` | column-`organizationId` | — | service-level filters | No |
| Unit scope | `rbac/services/unit-scope.service.ts` (`canAccessUnit` fail-closed) | `UnitScopeGuard` per route | — | — | no | No |
| Schedules REST (legacy) | `schedules.controller.ts` (664 l) + `schedules.service.ts` (2507 l) | `/api/v1/schedules*` | `Schedule`/`Assignment`/`ScheduleSnapshot` | legacy `schedule.service.ts` (`plan-page`) | DDD surface | No (active) |
| Schedules DDD | `schedules-ddd.controller.ts` (493 l) + `schedule-application.service.ts` + `schedule.aggregate.ts` + `prisma-schedule.repository.ts` | `/api/v1/schedules-ddd*` | same tables | new `features/scheduling` | legacy surface | No (active) |
| Real generator | `schedule-auto-generator.service.ts:82-420` | `POST /schedules/generate[preview]` | only via `/generate/apply` | `features/plans/auto-generate-dialog` | domain optimizer package | No (active) |
| Domain optimizer | `domain/optimization/*` (ScheduleOptimizerService, Greedy/LocalSearch, ScoreAggregator, Fairness/Fatigue/Workload) | `POST /schedules/optimize/dry-run` only | **never** | none | auto-generator (inline scoring) | **dry-run-only (orphan from production)** |
| Validation | `schedule-validation.service.ts` + `domain/constraints/constraint-engine.ts` + hard constraints | DDD validate, assign, publish | — | submit flows | legacy `validateAssignment(Detailed)` | No |
| Workflow | `schedules-workflow.service.ts` (625 l) + aggregate transitions | submit/approve/reject/publish/archive/rollback/revision | `ScheduleApproval` | toolbar/publish dialog | aggregate `VALID_TRANSITIONS` | No |
| Async jobs | `job-queue/*` (Bull root: `event-bus.module.ts:30`) | DDD job endpoints | none | none | — | **processor is simulation stub** |
| Audit | `audit-log` `AuditInterceptor` (APP_INTERCEPTOR) + `ScheduleApproval` | global | `audit_logs` | audit tab | — | No |
| Notifications | `notifications/notification-event.service.ts` (DI-invoked) | services | notifications | — | event-bus logs only | No |
| Exports | `schedules-export.service.ts` (sanitize 17-26) | `/schedules/export/excel|pdf` | files | reports links | training export | No |
| Device-off | `DeviceOffDate` model; logic in `schedules.service.ts:2410-2506` | `/schedules/:id/device-off` | `DeviceOffDate` | plan-page toggle | consumed by gen/validate/optimizer | No |
| Personnel | `personnel.service.ts` | personnel routes | Personnel | personnel mgmt | `seed-personnel.ts` | No |
| Hierarchy | `organization-hierarchy` | org routes | Org/Hospital/Unit/Device | admin | — | No |

## 5. Real Scheduling Runtime Trace

Verified by reading the actual call chain:

```
USER (legacy UI) — POST /api/v1/schedules/generate {unitType, month, year, fairnessMode,...}
  → schedules.controller.ts:636-641  generate()
      → ScheduleAutoGeneratorService.preview() :72-80 → generate() :82-420
          → prisma.unit.findFirst(:83) → loadPersonnel(unit.id) :509-526
          → loadDevices :528-542 → loadHolidays :544-554 → loadDeviceShifts :556-586
          → prisma.deviceOffDate.findMany(active, month) :107-115
          → day×device×shift loop :198-405
              → findAvailablePersonnel() :608-672  (hard candidate filter)
              → scoreCandidates() :674-699        (inline scoring, no engine)
          → {assignments, summary, warnings}   (NOT persisted — preview only)
  → POST /api/v1/schedules/generate/apply :650-656
      → apply() :422-507  → canAccessUnit(:431) → per-row ScheduleValidationService.validateAssignment(:472)
          → $transaction(createMany + schedule.version increment) :496-502
  → FE displays plan (plan-page) → submit/approve/publish via legacy workflow service
```

Parallel DDD surface (new FE): `POST /schedules-ddd/:id/assignments` → `ScheduleApplicationService` → aggregate domain events → `PrismaScheduleRepository.save` (version-gated, throws `StaleVersionError`).

**There is exactly ONE production generator algorithm**: the deterministic greedy heuristic in `ScheduleAutoGeneratorService`. Despite the interface name `GeneticAssignment` (`:43`), there is **no genetic algorithm** in the production path.

## 6. Scheduler / Optimizer Inventory (caller-traced)

| Component | File | Classification | Proof (caller chain) |
|---|---|---|---|
| `ScheduleAutoGeneratorService.generate/preview/apply` | `schedule-auto-generator.service.ts:82/422` | **[PRODUCTION-AUTHORITATIVE]** | controller:636/643/650 → service; persist via apply |
| `ScheduleValidationService` + `ConstraintEngine` + `AssignmentCollection` + hard constraints | `schedule-validation.service.ts`, `domain/constraints/*` | **[PRODUCTION-AUTHORITATIVE]** | auto-generator apply:472; DDD validate:397; app:65/81/111/181; swap-requests:203 |
| `ScheduleApplicationService` + `ScheduleAggregate` + repository | DDD layer | **[PRODUCTION-AUTHORITATIVE]** | ddd-controller:145-381 routes |
| `SchedulesWorkflowService`, `SchedulesExportService`, `ScheduleAlertService`, legacy CRUD | schedules module | **[PRODUCTION-AUTHORITATIVE]** | controller routes 503-634 |
| `ScheduleOptimizerService`, `GreedyOptimizationStrategy`, `LocalSearchOptimizationStrategy`, `ScoreAggregator`, `SchedulingProblem`, `OptimizationResult` | `domain/optimization/*` | **[PRODUCTION-SUPPORTING — read-only dry-run]** | only caller: `schedule-dry-run.service.ts:13,64` ← controller:658-662; importers otherwise only specs |
| `FairnessEngine`, `FatigueEngine`, `WorkloadCalculator` (+ `soft-{fairness,fatigue,workload}` constraints) | `domain/models/*`, `domain/constraints/soft-*` | **[PRODUCTION-SUPPORTING — dry-run only]** | consumed by greedy:12-13 / local-search:14-15 soft constraints; never by auto-generator |
| `ScoringModel` | `domain/models/scoring-model.ts` | **[TEST-ONLY / LEGACY]** | imported only by `5b4-preseeding.spec.ts`, `conflict-validation.spec.ts`; config comment calls it "historical" |
| `SeededRandom`, `generation.ts` (`GenerationAlgorithm`, `DEFAULT_GENERATION_CONFIG`) | `domain/models/` | **[DEAD / ORPHAN]** | re-exported via `domain/models/index.ts:6`; zero importers in `backend/src` |
| `schedule-job.processor.ts` handlers | `job-queue/schedule-job.processor.ts:64-107` | **[DEAD / STUB]** | `simulateWork(ms)`=setTimeout; returns fabricated `{generated:true}` touching no real service |
| DDD async job endpoints | `schedules-ddd.controller.ts:401/418/469` → `schedule-job-queue.service.ts:17-37` | **[ENDPOINT WIRED, PROCESSOR STUB]** | producer→Bull queue→stub consumer |
| Frontend `core/scheduling` (Greedy gen, genetic `ConstraintSolverService`, `FairnessBalancer`, `FatigueEngine`, `RebalanceEngine`, `RecommendationEngine`) | `frontend/src/app/core/scheduling/*` | **[DEAD]** | zero importers outside the folder (grep verified) |
| Frontend legacy generation UI | `features/plans/auto-generate-dialog.component.ts:261/294` | **[PRODUCTION UI → BACKEND]** | calls backend generate/preview/apply |

Criteria note: no component was classified by filename; every classification above follows an actual import/caller trace.

## 7. Constraint Matrix

| Constraint | Defined? | Backend enforced (production)? | Frontend enforced? | Hard/Soft | Production path | Tests |
|---|---|---|---|---|---|---|
| Min rest ≥11h | `MIN_REST_HOURS` (`domain/constants`) | Generator skip (`:655-656`); validation `REST_RULE_VIOLATION` WARNING/overridable (`schedules.service.ts:1126`); engine `RequiredRestConstraint` overridable WARNING (`hard-constraints.ts:109-117`) | drag-drop rest check (advisory) | Enforced hard in generator; **WARNING-overridable elsewhere** | gen + validation | enforcement-constraints |
| Night-shift eligibility | `Personnel.nightShiftEligible` (schema 620) | generator `:629` (also evening), validation `:991/:1322`, `NightShiftEligibilityConstraint` | advisory | Hard | gen + validation | yes |
| Max consecutive nights (3) | config default | generator `:658-661` | — | Hard (gen) | gen | enforcement |
| Max consecutive days (6) | config default | generator `:663` | — | Hard (gen) | gen | enforcement |
| Max workload (per-month cap) | config | generator `:665-668` — cap `ceil(daysInMonth/2)+maxOvertime`; **always ≈36** (see F-06) | — | Hard (gen, rarely binding) | gen | — |
| Weekly hours `maxWeeklyHours` | schema 625 | **loaded, never enforced** (F-06) | — | — | — | — |
| Weekly `offDays` | schema 624 | generator `:627`, validation `:999`, `OffDayConflictConstraint` | — | Hard | gen + validation | yes |
| Device required on device-kind | — | `DeviceIsRequiredConstraint` | — | Hard | validation | yes |
| Device qualification (skills) | `Device.requiredSkills` | generator `:631-634`; `DeviceSkillsConstraint`; validation `PERSON_DEVICE_NOT_ALLOWED` | — | Hard | gen + validation | yes |
| Same device/date/shift booking | unique `[scheduleId,deviceId,date,shiftType,personnelType]` (schema 926) | validation `DEVICE_BOOKED`; backend unique | — | Hard | validation | yes |
| Personnel time overlap | — | engine `NoOverlappingAssignmentsConstraint` BLOCKING (`hard-constraints.ts:63-89`); legacy `TIME_OVERLAP` **WARNING/overridable** (F-16) | local conflict list (display) | **Inconsistent** | validation | yes |
| Device-off date | `DeviceOffDate` (schema 1445-1461, unique `[deviceId,date]`) | BLOCKING non-overridable everywhere (`schedules.service.ts:1130-1140`; `DeviceOffDateConstraint`; generator skip `:212`) | toggle UI | Hard | gen + validation + dry-run | yes (device-off.spec) |
| Unit closed (workDays/polyclinic) | `Device.workDays`, `mode` | generator `:211-214`; validation `UNIT_CLOSED` | — | Hard | gen + validation | enforcement |
| National holidays | `Holiday` | `loadHolidays` + generator holiday skip `:149/:203`; polyclinic holiday off `:213` | — | Hard (availability) | gen + dry-run | — |
| Weekend inclusion | options | `includeWeekends` `:206`; optional-on-weekend shifts gated by `ShiftDateOverride` `:277-281` | checkbox | Config | gen + dry-run | — |
| Inactive/employmentStatus | schema 621/626 | generator `:525/:625`; all validation paths | — | Hard | gen + validation | yes |
| Personnel in unit/group | relations | `PersonnelInUnitConstraint`, `PersonnelInGroupConstraint`; validation `PERSONNEL_NOT_IN_UNIT/GROUP` | — | Hard | validation | yes |
| Leave / absence / training dates | **NOT modeled** (only `ShiftType` labels `off/leave/sick/training/backup`, schema 62-72) | leave **not** read by generation (F-12) | — | — | — | — |
| Seniority | schema `Personnel.seniority` 615 | fairness mode 'seniority' is **positional**, never reads the field (F-07) | — | Soft (broken) | — | — |
| Fairness / weekend / night / holiday distribution | `FairnessEngine` (+ frontend dead mirror) | **dry-run optimizer only**; production generator uses only workload/night score | display metrics | Soft | dry-run | fairness-engine.spec |
| Fatigue | `FatigueEngine` (`WORKLOAD_LIMITS`) | **dry-run optimizer only** (`soft-fatigue.ts`) | display | Soft | dry-run | fatigue-engine.spec |
| Minimum coverage / mandatory staffing | **NOT modeled** (F-13) | — | — | — | — | — |
| Organization boundaries / cross-unit | RBAC/unit-scope guards + tenant middleware | routes `ScheduleAccessGuard` (controller:62, ddd:50), `UnitScopeGuard`, `canAccessUnit` fail-closed (`unit-scope.service.ts:120-122`) | — | Hard (authz) | all routes | yes (5C.17/5C.20) |

## 8. Hard vs Soft Constraint Integrity

- **Production generator:** hard rules are filters inside `findAvailablePersonnel` (`:624-671`) — a generated assignment **cannot** violate rest/night-eligibility/consecutive/off-days/skills/device-off (they are skipped candidate-wise). Scoring cannot trade legal constraints: `scoreCandidates` only reorders who fills a slot; it can never admit a filtered-out candidate. Deterministic scoring: `1000 − workload·10`, night/evening `− nightCount·20` (`:682-692`).
- **Manual/override path:** several rules are modeled as **WARNING / overridable** in legacy validation (`TIME_OVERLAP`, `REST_RULE_VIOLATION`, `OFF_DAY_CONFLICT`, `NOT_NIGHT_ELIGIBLE` — `schedules.service.ts:1126,1333-1334`), overridable by authorized roles with `overrideReason` + audit (`overrideAssignment` `:1464-1563`). This is a deliberate, audited escape hatch — but it means **"hard" in generation ≠ "hard" in manual editing**, and the domain engine disagrees with the legacy service on severity (F-16).
- **Domain optimizer (dry-run):** canonical weights fairness .35 / workload .25 / fatigue .25 / coverage .15 (`canonical-scoring.config.ts:32-37`), hard-violation penalty multiplier 2.0 (`:53`); candidates with hard violations are reported (`buildExplanations` `:373-393`, `candidate.isValid`) rather than silently accepted. Because it is dry-run-only, no production trade-off risk exists today; if wired, selection semantics must be re-verified against production acceptance rules.
- **Cannot-score-bypass:** no production-path mechanism lets a better score override a blocking validated rule (apply rejects the whole batch on any `hasBlocking` — `:473-480`).

## 9. Determinism & Reproducibility

- **Production generator is deterministic-in-practice:** no `Math.random`, no time-seeded input (frontend sends a `seed` into preview DTO but backend ignores it; the `generate-dialog` seed is never sent to any real generator). Iteration is a fixed day×device×shift loop.
- **Sources of nondeterminism found:**
  1. `loadPersonnel`/`loadDevices` use `findMany` **without `orderBy`** (`:510/:529`); `scoreCandidates` picks `scored[0]` after a stable sort (`:697-698`), so **ties are broken by DB row order** — reproducible for a fixed DB, not guaranteed across environments (F-08).
  2. Seniority tiebreak `candidates.indexOf(p) % 5` depends on the same order (F-07).
  3. `Math.random` exists only in non-scheduling or ephemeral paths: web-socket lock ids (`schedule.gateway.ts:93`, `edit-lock.service.ts:214`), distributed lock ids, and **conflict object ids in the dry-run optimizer** (`greedy-strategy.ts:306`, `domain/models/conflict.ts:69`) — ephemeral, not persisted.
  4. `seed.ts:419` assigns random seniority at seed time (test/data only).
- **Verdict:** no intentional stochastic optimization in production; reproducibility holds for a given database, with a documented tie-break caveat.

## 10. Feasibility / Impossible-Schedule Handling

- **Infeasibility is NOT a first-class concept.** The generator silently produces a **partial schedule** and collects string `warnings` for unfilled day shifts (`:235-240, 344-348`); night/evening shortfalls produce **no warning at all** (`if (shiftType === 'day')` guards).
- Apply re-validates every candidate and **rejects the entire batch** on any blocking rule (`:472-480`) — so a partial preview can "apply" partially (skips conflicts `:453-455`) but never persists a blocking-rule-breaking row.
- **No minimum-coverage requirement** exists (F-13): the system cannot know that "MR night unstaffed" is a failure versus "extra technician day" — there is no mandated staffing model.
- **Explanation depth:** DDD `POST /:id/validate` returns `score` + hard/soft violation totals; dry-run returns per-candidate `hardConstraintViolations` + explanations. There is no UI-backed "why is this infeasible" narrative, no score breakdown in production UI, and no per-assignment rationale (see §14).

## 11. Fairness / Fatigue / Seniority

| Concept | Defined | Calculated | Consumed | Persisted | Backend-authoritative | Deterministic | Tested | Changes decisions? |
|---|---|---|---|---|---|---|---|---|
| Fairness (night/weekend/holiday/rotation) | `FairnessEngine` (`domain/models/fairness-engine.ts`) | engines + `soft-fairness.ts` | **dry-run optimizer only** | no | yes (backend) | yes (internal) | fairness-engine.spec, 5b3-scoring-quality | **No (production)** |
| Fatigue | `FatigueEngine` (`WORKLOAD_LIMITS`, coefficients) | `soft-fatigue.ts` | **dry-run optimizer only** | no | yes | yes | fatigue-engine.spec | **No (production)** |
| Workload balancing | `WorkloadCalculator` / inline `1000−10·wl` | both | generator selection + soft-workload | no | yes | yes | yes | generator: **yes (weak)** |
| Seniority | `Personnel.seniority` (schema 615) | none (field only) | **nobody reads it**; 'seniority' mode uses `candidates.indexOf(p)%5` (`auto-generator.ts:688-690`, `greedy-strategy.ts:450`) | field persisted | n/a | n/a | no | **No (positional)** |
| Frontend-only fairness/fatigue | `core/scheduling` (`fairness-balancer.service.ts` etc.) | frontend | **nobody imports it** (dead) | no | — | — | spec-only | **No** |

**Conclusion:** fairness/fatigue/seniority are **display/experimental abstractions with no production assignment effect**. The only production decision signal is basic workload balance + night penalty in `scoreCandidates`.

## 12. Device / Unit Reality Check (25-device radiology model)

Verified against master configs / seed (not assumed):
- **MR:** 8 devices MR-A…MR-H, all vardiya 24/7 model, day 08-20 + night 20-08 (`mri-master-config.ts`, applied via `seed.ts:549`). ✅
- **BT:** BT-1…BT-7 (7) — vardiya for BT-1..7, BT-6 full assistant day+night; **Röntgen: RÖ-1…RÖ-26 (26 devices**; code uses 26, not 25), polyclinic Mon–Fri single shift 08:30-16:30, RÖ-7 shift-capable with 11-18/18-06; emergency/mobile semantics carried by BT-6/RÖ-7 vardiya defs (`radiology-master-config.ts`, applied at `seed.ts:354`). ✅ (count 26 vs historical 25 — product decision, not defect)
- **Nükleer:** NT-1…NT-6 weekday polyclinic, workDays **Mon–Sat** [1..6] (Sunday closed), NT-5/NT-6 PET-CT (+ optional Sat engineered via workDays; optional per-day is shift-override only). ✅
- **ONK:** **drift** — `seed.ts:363-384` seeds 'Lineer Hızlandırıcı-1/2/3' + 'Simülasyon CT' with `workDays [0..6]`, but `applyOnkolojiMasterConfig` (expects 'Linak-1/2/Tomoterapi/BT Simülatör', Mon–Fri, `planning` personnel type) is **never called from seed** — only via standalone `apply-onkoloji-master.ts` (F-17).
- Mamografi / Kemik Dansitometri: **not modeled as devices** in the master configs/seed (no dedicated devices found).

Model capability assessment:
- device-level staffing ✅ (`shifts` per device + `personnelType`)
- unit-level staffing ✅ (per-unit shift defs)
- weekday-only devices ✅ (`Device.workDays`, `mode='polyclinic'`)
- 24/7 devices ✅ (`workDays [0..6]`)
- closed devices ✅ (`isActive` + device-off dates)
- device-off dates ✅ (`DeviceOffDate`, active-flag semantics)
- optional weekend operation ⚠️ (per-shift `optionalOnWeekends` + `ShiftDateOverride` toggle — keyed to shift, not device/day; no per-device operating calendar) 
- multiple devices per unit ✅ (`Device.unitId`)
- personnel qualification ✅ (`skills`/`deviceSkills` vs `requiredSkills`)
- device qualification ✅ (same mechanism)
- shift-specific coverage ✅ (day/evening/night defs)
- **minimum coverage / mandated staffing ❌ (F-13)**

## 13. Device-Off / Closed-Unit Semantics

Separate, correctly-modeled concepts:

| Aspect | Device off (`DeviceOffDate`) | Unit/device closed (`workDays`/`mode`) |
|---|---|---|
| Model | `DeviceOffDate{deviceId,date,reason,isActive,createdById}` unique `[deviceId,date]` (schema 1445-1461) | `Device.workDays Int[]`, `mode` |
| Write path | `schedules.service.ts:toggleDeviceOff` `:2410-2490`; blocks when active assignments exist (`DEVICE_HAS_ASSIGNMENTS` `:2436-2451`); soft-deactivate (`isActive=false`) | master config application |
| Generation | generator skip `:212`; `DeviceOffDateConstraint` BLOCKING (`hard-constraints.ts:322-334`); dry-run `loadDeviceOffDates` (`schedule-dry-run.service.ts:200-212`); greedy `:177`, local-search `:233/:305` | generator `:211-214` (workDays + polyclinic weekend/holiday) |
| Validation | `DEVICE_OFF_DATE` BLOCKING, non-overridable (`:1130-1140`) | `UNIT_CLOSED` |
| Reads | active-only, scoped by `device.unitId` (`:2492-2506`) | — |

Handling of inactive `DeviceOffDate` rows is consistent (ignored everywhere — `isActive: true` filters at every consumer). Sound separation; no changes required.

## 14. Workflow Integrity (new issues only)

- **Four-eyes:** enforced at 3 consistent points — legacy workflow `approve` `:141-144`, DDD app `approve` `:160-163`, and `publishByUnit` system-actor branch (`schedules.service.ts:555-562`). ✅
- **Optimistic concurrency:** DDD surface threads `expectedVersion` on every mutation + `PrismaScheduleRepository.save` throws `StaleVersionError`; legacy `update` gates `:751-755`, `bumpScheduleVersion` `:69-84` atomic check. ✅
- **Guard coverage:** both controllers have class-level `ScheduleAccessGuard` (org-ownership, system-admin bypass, fail-closed) — `schedules.controller.ts:62`, `schedules-ddd.controller.ts:50`. ✅
- **Snapshots/rollback/publish:** snapshot created before publish (`workflow:281`); DDD rollback `withLock`, published-only, target<current, snapshot restore. ✅
- **New findings (this phase only):**
  - F-09 — dual transition role maps diverge (legacy `models/schedule-status.ts` admits `field_supervisor`; DDD aggregate `TRANSITION_ALLOWED_ROLES` does not).
  - F-10 — legacy `rollback` (`schedules.service.ts:2012-2080`) bumps the version twice (`bumpScheduleVersion` `:2051` then unconditional `version:{increment:1}` `:2053-2057`).
  - F-11 — legacy route metadata (`@Roles(MinRole.HEAD_TECHNICIAN / PLANNER)`) is wider than the authoritative service checks (`canApprove`/`canPublish`); service is correct, metadata misleading.
  - F-18 — `generate/apply` persists with an **unguarded** `version:{increment:1}` (`:498-501`); no optimistic precondition, unlike DDD mutations.

## 15. DDD / Data Model Integrity

- **Correctly bounded:** Schedule/Assignment/Shifts/Unit/Device/Organization/Personnel/DeviceOffDate/Hospital hierarchy are coherent; workflow audit data has a dedicated `ScheduleApproval`; rollback uses typed `ScheduleSnapshot(version, data JSON)`; assignment provenance is typed (`AssignmentSource` manual/auto-generated/override/swap/template/import; `Assignment.kind` device/person).
- **Over-generalization / weakly-persisted concepts:** coverage/availability/fatigue/fairness are not first-class models (coverage implicit in shift defs; availability = `offDays`; fatigue/fairness are compute-only).
- **Duplication:**
  - two service surfaces for one aggregate (legacy `schedules.service.ts` vs DDD app+aggregate) with separate transition rule maps (F-09) and separate severity rules (F-16);
  - `loadPersonnel`/`loadDevices`/`loadHolidays` reimplemented in auto-generator, dry-run service, and validation/middleware;
  - `Assignment` domain entity vs `SnapshotAssignment` vs `ScheduleProblem.*` DTO diverge in field shape (SnapshotAssignment normalizes `unitId`/`groupId` by kind).
- **Persistence-driven rather than domain-driven in one place:** the production generator is an inline service-layer loop, not a domain use-case; the DDD optimizer exists but is partitioned away from it (F-01).
- No forced/necessary migration identified. F-12 and F-13 would require additive schema changes in a future phase (**UNKNOWN** readiness — currently read-only).

## 16. Dead / Orphan / Duplicated Scheduling Logic (caller-proven)

| Candidate | Status | Proof |
|---|---|---|
| `domain/models/seeded-random.ts` (`SeededRandom`) | **DEAD** | only re-export `domain/models/index.ts:6`; zero importers in `backend/src` |
| `domain/models/generation.ts` (`GenerationAlgorithm`, `DEFAULT_GENERATION_CONFIG`) | **DEAD** | same barrel; zero consumers |
| `domain/models/scoring-model.ts` (`ScoringModel`) | **Dead in prod** (test-only) | imported only by `5b4-preseeding.spec.ts:8`, `conflict-validation.spec.ts:5` |
| `ScheduleOptimizerService` + strategies + engines package | **Orphan from production / dry-run-only** | sole production caller `schedule-dry-run.service.ts:13,64` ← `POST optimize/dry-run`; also heavily test-covered |
| `schedule-job.processor.ts` handlers | **Dead-ended stub** | `simulateWork()` returns fabricated results; never invokes services (F-05) |
| DDD job endpoints (`/jobs/generate`, `/jobs/export`, `/jobs/cancel`) | **Wired but dead-ended** | controller:401-488 → queue → stub processor |
| `frontend/src/app/core/scheduling/**` (10 services: engine, generator, genetic solver, fatigue, fairness, rebalance, validator, recommendation, solver-validation) | **DEAD** | zero external importers (grep across `frontend/src`) |
| `features/onkoloji/onkoloji-plan.component.ts` | **DEAD** | route `/app/onkoloji-plan` loads `plan-page.component` instead; 0 importers |
| `SeedRandom`-adjacent random seniority in `seed.ts:419` | test/data only | — |
| Legacy plan surface (schedule.service.ts, plan-page, auto-generate dialog, schedule-grid, stores) | **ACTIVE** (not dead) | still routed and injected; 91+ references |

## 17. Performance / Scale

Risks identified (not measured; no optimization performed):
- **Generator complexity:** the candidate filter runs `existingAssignments.some()` twice per candidate (`:636-644`), i.e. **O(Days × Devices × ShiftsPerDevice × Personnel × accumulatedAssignments)**; the per-day reset loops (`:385-404`) also scan all assignments per person. At the intended scale (31 days × 8-26 devices × 1-3 tech/assist/sup shifts × tens-to-hundreds of personnel × ≤~2-3k assignments) this is chunky but feasible in-process; it will not survive population queues or deep fairness searches.
- **N+1 on apply:** `apply()` awaits `scheduleValidation.validateAssignment` **per row sequentially** (`:472`), each issuing multiple queries — ~200-2000 rows → hundreds-to-thousands of round-trips in one request.
- **Payloads:** assignments fully embedded in schedule reads/DTOs; snapshots store full JSON state (`ScheduleSnapshot.data`) — rollback/compare at scale is O(assignments).
- **Contention hot spots:** optimistic locking on `Schedule.version` is fine-grained; `publishByUnit` re-validates every DTO row synchronously in one transaction window.
- No material full-table-scan or unbounded N+1 elsewhere in the audited scheduling path.

## 18. Explainability

- **Exists (backend, currently dry-run/validate only):** DDD validate returns score + hard/soft totals; domain `buildExplanations` produces per-candidate rationale (`greedy-strategy.ts:373-393`); dry-run returns score + violations. Legacy generator returns only string warnings.
- **Missing in production UX:** no per-assignment "why", no score breakdown, no alternative/unavailable-candidate view, no fairness/fatigue/seniority impact for the *actually generated* schedule (fairness/fatigue engines never touch production output, §11).
- Classification: **PRODUCT GAP (F-14)** — not a correctness/security issue.

## 19. Dry-Run / Simulation / What-If

| Capability | Production? | Notes |
|---|---|---|
| Dry-run optimization (`strategy=greedy|local-search`) | ✅ backend endpoint (read-only) | `POST /schedules/optimize/dry-run`; returns OptimizationResult; **no UI caller** |
| Generate preview (no persist) | ✅ | `POST /schedules/generate/preview` + legacy generate → preview table |
| Version comparison | ✅ | `GET :id/versions`, `compare` (legacy), DDD version panel |
| Rollback simulation | partial | snapshots + dry-run; no branch-then-compare |
| What-if partial regeneration / rebalancing | ❌ | no partial-regenerate endpoint; frontend `RebalanceEngine` dead |
| Score comparison UI | ⚠️ | version compare panel exists; score-based compare not wired to dry-run engine |
| Explainability UI | ❌ | F-14 |

Distinction: real backend capability vs UI placeholders — the new feature's generate dialog is a **placeholder** (F-02); the legacy auto-generate dialog is real (backend-driven).

## 20. Test Quality

Strengths:
- **Security/workflow closures are well-tested at the real path** (5C.17/5C.18/5C.20: direct-assign gate, export sanitize, unit confinement, four-eyes, authz consistency, SEC-01/SEC-02 scoping — 275/275 in closure audit).
- **Domain optimizer is genuinely tested** on the real engine (5b1-domain-architecture, 5b2-optimizer, 5b3-scoring-quality/quality-gates/performance-failure, 5c5-local-search, fairness/fatigue engines, enforcement-constraints).
- **Constraint coverage:** device-off active/inactive semantics, min-rest, night eligibility, consecutive-day caps, qualifications, holiday handling all have unit tests.
- **Concurrency:** expectedVersion tests on legacy service (`schedule-service.version` FE, backend `SchedulesService` specs); DDD `StaleVersionError` path.

Weaknesses / disconnects:
- **`device-off.spec.ts` is DB-gated** (requires live Postgres `localhost:5432`) → the device-off suite fails in CI without a DB (known, environment-only).
- **No determinism test** (seed × same inputs → byte-equal output) despite tie-break caveat (F-08).
- **No end-to-end** generation→persist→publish test with real Postgres; optimizer tests run synthetic fixtures (good for the engine, but the *production* generator has comparatively thin specs — the `generate` loop is largely exercised through `5c6-hardening`/DTO tests rather than full-month assertions).
- **Frontend:** new DDD feature has minimal spec coverage (only `error.models.spec.ts`); no spec asserts the generate dialog is real → the fake generate was not caught (F-02). Legacy FE: 7 service specs + 2 component specs, focused on version/transport contracts.
- Some 5B-era optimizer specs assert implementation outcomes that the production generator does not implement (e.g., seniority-based selection) — potential false-confidence if read as "production behaviour".

## 21. Frontend / Backend Responsibility

Backend-authoritative (verified): authN/JWT, RBAC + MinRole, tenant middleware + guards, unit scope fail-closed, schedule validation, generation (real), workflow state machine, optimistic concurrency, audit, device-off, export sanitization.

Frontend-decided (advisory only, no persisted effect): fairness breakdown display (`plan-page` `computeFairnessScore`), drag-drop rest-rule prompt (`validateDropTarget`), local conflict lists (`openConflicts`), and the **fake generate** in the new feature (F-02) which appears to decide but validates/persists nothing.

**No production-critical decision is made solely in the frontend** for persisted state — every mutation lands in a backend-guarded endpoint. One caveat: the new feature's "Vardiya Üret" presents simulated results as if generated (misleading but harmless to data). Backend remains authoritative; the FE solver stack must never be wired to authorization or persistence without backend review.

## 22. Product Maturity Scores (0-100, evidence-based)

| Dimension | Score | Evidence basis |
|---|---|---|
| A. Domain modeling | **58** | Rich workflow/versioning/provenance (Schedule 821-848, Assignment 889-939, ScheduleApproval/Snapshot); but dual surfaces, no availability (offDays only), no coverage model, ONK drift (F-17), seniority unused |
| B. Constraint correctness | **62** | Rest/night/skills/device-off/overlap solid in validation + generator; but severity disagreement between engines (F-16), weekly-hours unenforced + daysInMonth bug (F-06), no coverage |
| C. Algorithm quality | **45** | Production algorithm = simple inline greedy (auto-generator 82-420); the sophisticated engine exists but is dry-run-only (F-01) |
| D. Determinism | **72** | No RNG in production path; DB-order tie-breaks, positional seniority (F-07/F-08); random only in ephemeral ids |
| E. Fairness | **40** | No production effect; engines dry-run-only; 'seniority' positional; no weekend/night/holiday distribution in production |
| F. Explainability | **35** | Score+violation totals only; no per-assignment why in production (F-14) |
| G. Performance | **70** | Functional at MR/BT/RÖ unit scale; O(P×A) scans + sequential per-row apply validation (F-15); no benchmark |
| H. Testability | **78** | Strong closure + optimizer specs; DB-gated device-off, no determinism/e2e/generation-depth coverage, FE thin |
| I. Workflow integration | **80** | Four-eyes ×3, expectedVersion everywhere (except apply F-18), snapshots, rollback, guards; minor dual-map + double-bump (F-09/F-10) |
| J. Production readiness | **55** | Secure + workflow-solid enough to operate; scheduling engine not enterprise-authoritative, no availability/coverage/explainability |

**Overall maturity ≈ 59/100.**

## 23. Findings Register

### P0 — none.

### P1 — none.

### P2 (meaningful architecture/product deficiency)

**F-01 — Dual scheduling engines; production uses the weaker one**
- CATEGORY: Architecture
- FILE: `schedule-auto-generator.service.ts:82-420`, `domain/optimization/schedule-optimizer.service.ts`, `schedule-dry-run.service.ts:13,64`
- SYMBOL: `ScheduleAutoGeneratorService.generate` vs `ScheduleOptimizerService.optimize`
- LINE: auto-generator 82; dry-run 64
- RUNTIME PATH: `POST /schedules/generate` → auto-generator (persists via apply); `POST /schedules/optimize/dry-run` → optimizer (never persists)
- OBSERVED BEHAVIOR: the tested, constraint/fairness/fatigue-aware optimizer is reachable only read-only; production uses an inline greedy scoring loop.
- WHY IT MATTERS: every maturity upgrade (fairness, fatigue, partial regen, scoring) must currently be re-built inside the generator instead of evolving one engine; optimizer tests can green-veil production.
- PROOF: importers of optimizer package = dry-run service + specs only (§16); auto-generator imports `ScheduleValidationService` only.
- RECOMMENDATION: (a) phase D/E foundation: extract a single `ScheduleGeneratorPort`; make the optimizer the core, with the greedy heuristic as one strategy; persist only through the aggregate/repository; (b) keep both reachable temporarily behind same-capability contract.
- MIGRATION: UNKNOWN (behavioral unification risk) | COMPLEXITY: L

**F-02 — New-feature "Vardiya Üret" is a simulated generate**
- CATEGORY: Product gap (misleading UX)
- FILE: `frontend/src/app/features/scheduling/components/generate-dialog/generate-dialog.component.ts:192-224`
- SYMBOL: `GenerateDialogComponent.onGenerate`
- LINE: 206 (validate), 212 (`resultTime = Math.random()*3+0.5`), 213 (algorithm name only)
- RUNTIME PATH: workspace "Vardiya Üret" → dialog → `cmd.validate` (+backend `POST /schedules-ddd/:id/validate`) → toast "Vardiya planı üretildi"
- OBSERVED BEHAVIOR: results are the existing assignment count + fabricated time; nothing is generated or persisted; `/schedules-ddd` has no generate endpoint.
- WHY IT MATTERS: supervisors are told a plan was generated; the flagship feature is non-functional and would ship false confidence.
- PROOF: dialog body lines 206-223; absence of generate in `schedule-api.service.ts`.
- RECOMMENDATION: wire to a real backend generate/preview/apply endpoint (legacy `/schedules/generate*` or new DDD generate), or remove the action until available.
- MIGRATION: NO | COMPLEXITY: M

**F-03 — Dead frontend solver stack `core/scheduling`**
- CATEGORY: Architecture / technical debt
- FILE: `frontend/src/app/core/scheduling/**` (scheduling-engine, schedule-generator, constraint-solver (genetic), fatigue-engine, fairness-balancer, rebalance-engine, recommendation-engine, validators)
- LINE: package-wide
- RUNTIME PATH: none (0 importers outside the folder)
- OBSERVED BEHAVIOR: a complete solver suite computes schedules/scoring locally; unreachable.
- WHY IT MATTERS: dead algorithm code is a hazard (could be wired by mistake into a frontend-authoritative decision) and misleads architecture readers.
- RECOMMENDATION: remove or quarantine to an explicit research folder; never wire for authorization/persistence.
- MIGRATION: NO | COMPLEXITY: S

**F-05 — Async job-queue processor returns fabricated success**
- CATEGORY: Correctness (API contract)
- FILE: `backend/src/modules/schedules/job-queue/schedule-job.processor.ts:64-107`; `schedules-ddd.controller.ts:401-488`
- SYMBOL: `processGenerate/processValidate/processExport/processReport` (`simulateWork`)
- RUNTIME PATH: `POST /schedules-ddd/:id/jobs/generate` → queue → stub → `{generated: true}` with nothing created
- OBSERVED BEHAVIOR: async endpoints report success while performing no work.
- WHY IT MATTERS: false-positive signals on a production-wired endpoint; any consumer (job history, health) is deceived.
- PROOF: processor body returns fake objects; no service injection.
- RECOMMENDATION: implement real handlers or remove/explicitly mark the queue endpoints unavailable.
- MIGRATION: NO | COMPLEXITY: M

**F-12 — No per-date leave / absence / availability model or consumption**
- CATEGORY: Product gap
- FILE: `prisma/schema.prisma` (offDays 624 only); `schedule-auto-generator.service.ts:624-671`; `schedules.service.ts:980/1291`
- SYMBOL: `Personnel.offDays`, `ShiftType` non-working labels; `findAvailablePersonnel`
- RUNTIME PATH: generation reads only weekly `offDays`, `employmentStatus`, `nightShiftEligible` (`:627-629`)
- OBSERVED BEHAVIOR: a technician on two weeks of annual leave is still schedulable; leave exists only as an assignment label excluded from validation, never as authoritative input.
- WHY IT MATTERS: for a hospital rostering product this is the single most visible correctness gap; force silently misplans people.
- PROOF: no Leave/Availability model in schema (grep); generator candidate filter lacks any date-range check.
- RECOMMENDATION: additive `AvailabilityWindow`/`LeavePeriod` model + consume in generator/validation/optimizer; supersede ShiftType leave-label semantics.
- MIGRATION: UNKNOWN (additive, low) | COMPLEXITY: L

**F-13 — No minimum-coverage / mandatory-staffing requirement**
- CATEGORY: Product gap
- FILE: `schedule-auto-generator.service.ts:235-240` (warnings), `:665-668`
- SYMBOL: `generate`/`findAvailablePersonnel`
- RUNTIME PATH: unfilled day shifts → warnings only; unfilled night/evening → silent; apply rejects only *blocking rule* rows, not "device uncovered"
- OBSERVED BEHAVIOR: the system cannot detect or require that a critical device/shift be staffed; "feasible" is defined as "no rule violated by what was filled", not "everything required is filled".
- WHY IT MATTERS: an enterprise scheduler must reason about mandated coverage and infeasibility (§10).
- RECOMMENDATION: add explicit coverage requirement (device×date×shift×personnelType, optional) as a hard/semi-hard constraint with feasibility reporting.
- MIGRATION: YES (additive) | COMPLEXITY: L

**F-14 — No explainability for generated schedules**
- CATEGORY: Product gap
- FILE: `domain/optimization/greedy-strategy.ts:373-393` (explanations exist dry-run only); production generator warnings only
- SYMBOL: `buildExplanations`
- RUNTIME PATH: production generate→apply emits no why; DDD validate exports totals only
- OBSERVED BEHAVIOR: supervisors cannot answer "why this person this shift".
- WHY IT MATTERS: trust and auditability for a high-stakes roster.
- RECOMMENDATION: persist per-assignment provenance + score/constraint explanation at generation; surface in workspace.
- MIGRATION: UNKNOWN (additive) | COMPLEXITY: L

**F-17 — Oncology seed/master drift on fresh databases**
- CATEGORY: Product / correctness (setup)
- FILE: `prisma/seed.ts:363-384` vs `prisma/onkoloji-master-config.ts`; `apply-onkoloji-master.ts` standalone
- SYMBOL: seed inline ONK devices vs `applyOnkolojiMasterConfig`
- RUNTIME PATH: `prisma db seed` configures ONK with 'Lineer Hızlandırıcı-1/2/3' + 'Simülasyon CT' (workDays 0-6) unless the standalone script is run
- OBSERVED BEHAVIOR: ONK names/workDays/personnel-types (incl. missing `planning` type and weekend workDays) diverge from the intended master until manual apply.
- WHY IT MATTERS: fresh environments get a subtly wrong ONK schedule model.
- PROOF: seed.ts inline names/workDays; master expects 'Linak-*', Mon–Fri.
- RECOMMENDATION: invoke `applyOnkolojiMasterConfig` from seed (mirroring MR/radiology/nükleer).
- MIGRATION: NO | COMPLEXITY: S

### P3 (cleanup / quality / future)

**F-04 — Dead backend prototypes** `SeededRandom` (seeded-random.ts), `generation.ts` (`GenerationAlgorithm`, `DEFAULT_GENERATION_CONFIG`), `ScoringModel` (prod). Only re-export barrel `domain/models/index.ts`; scoring-model imported only by specs. RECOMMENDATION: remove or quarantine. MIGRATION NO | COMPLEXITY S.

**F-06 — `maxWeeklyHours` unenforced + `daysInMonth` always 31 for the workload cap**
- FILE: `schema.prisma:625`; `schedule-auto-generator.service.ts:665-668` and `:666`
- SYMBOL: `findAvailablePersonnel` (uses `options.year||2026, options.month||1` — never set → always 31 days → cap 36)
- OBSERVED: weekly hours never checked; month cap `ceil(31/2)+maxOvertime(=20)` ≫ real capacity, rarely binds.
- RECOMMENDATION: thread real year/month; enforce weekly hours; cap maxOvertime semantics.
- MIGRATION NO | COMPLEXITY S

**F-07 — Seniority fairness mode is positional, not real**
- FILE: `schedule-auto-generator.service.ts:688-690`, `domain/optimization/greedy-strategy.ts:450`
- SYMBOL: `scoreCandidates` fairnessMode 'seniority'; `Personnel.seniority` (schema 615) never read by scoring
- OBSERVED: `candidates.indexOf(p) % 5 * 5` — deterministic-but-meaningless; a genuinely new entrant and a 15-year veteran are indistinguishable.
- RECOMMENDATION: consume `Personnel.seniority` (or drop the mode).
- MIGRATION NO | COMPLEXITY S

**F-08 — Determinism tie-breaks depend on DB row order**
- FILE: `schedule-auto-generator.service.ts:510/:529` (findMany no orderBy), `:697-698` (stable sort pick [0])
- SYMBOL: `loadPersonnel`/`loadDevices`/`scoreCandidates`
- RECOMMENDATION: explicit `orderBy` + named tie-breaker (e.g., name/createdAt) before scoring.
- MIGRATION NO | COMPLEXITY S

**F-09 — Dual workflow role maps diverge on field_supervisor**
- FILE: `backend/src/models/schedule-status.ts:47-113` (adds field_supervisor :55/:107) vs `domain/aggregates/schedule.aggregate.ts:31-38` (omits)
- SYMBOL: `VALID_TRANSITIONS` vs `TRANSITION_ALLOWED_ROLES`
- OBSERVED: submit-for-review works via legacy API for field_supervisor but not via DDD surface / new UI; two sources of truth.
- RECOMMENDATION: single canonical transition map consumed by both services.
- MIGRATION NO | COMPLEXITY S

**F-10 — Legacy rollback double version increment**
- FILE: `schedules.service.ts:2051` (`bumpScheduleVersion`) + `:2053-2057` (`version:{increment:1}`)
- OBSERVED: version jumps by 2 on legacy rollback; DDD rollback is single-increment.
- RECOMMENDATION: remove the redundant increment (or fold into bump with expected check).
- MIGRATION NO | COMPLEXITY S

**F-11 — Legacy route metadata wider than authoritative service checks**
- FILE: `schedules.controller.ts:517/:532` (`MinRole.HEAD_TECHNICIAN`), `:547/:558` (`MinRole.PLANNER`) vs `canApprove`/`canPublish` in `schedules-workflow.service.ts:131/:271` and misleading messages `:472/:526`.
- OBSERVED: service denies what route metadata implies is allowed (correct outcome, misleading decorators + error copy "Başteknisyen veya üstü", "Sadece Proje Yöneticisi").
- RECOMMENDATION: align route `@Roles` with service checks.
- MIGRATION NO | COMPLEXITY S

**F-15 — Generator/apply performance pattern**
- FILE: `schedule-auto-generator.service.ts:636-644` (O(P×A) `.some` per slot), `:385-404`; `:472` (sequential per-row validation)
- RECOMMENDATION: map-based conflict index (person/date, device/date/type) in memory; batch validation planning at optimizer level (part of F-01).
- MIGRATION NO | COMPLEXITY M

**F-16 — Constraint severity disagreement between engines**
- FILE: `domain/constraints/hard-constraints.ts:79-84` (TIME_OVERLAP BLOCKING), `:109-117` (rest overridable WARNING) vs `schedules.service.ts:1126/1333-1334` (TIME_OVERLAP/REST WARNING overridable)
- OBSERVED: the same logical rule is BLOCKING in one engine and override-acceptable in another.
- RECOMMENDATION: unify rule severities + override policy in one place (folded into F-01).
- MIGRATION UNKNOWN | COMPLEXITY M

**F-18 — `generate/apply` persists without optimistic precondition**
- FILE: `schedule-auto-generator.service.ts:496-502` (unguarded `version:{increment:1}`) vs DDD mutations (expectedVersion)
- OBSERVED: a stale client can apply over a concurrent edit.
- RECOMMENDATION: add expectedVersion to `apply` (mirror legacy/D ddd behavior).
- MIGRATION NO | COMPLEXITY S

**F-19 — Dry-run optimizer soft-constraint evaluation uses a dummy assignment anchor**
- FILE: `domain/optimization/greedy-strategy.ts:324-370`
- SYMBOL: `evaluateSoftConstraints` (dummyAssignment with placeholder date `-15` and no meaningful personnel)
- OBSERVED: fairness/fatigue are evaluated list-wise against the whole candidate set with a synthetic anchor row.
- RECOMMENDATION: refactor soft-constraint signature to evaluate the collection directly (foundation for F-01/E-explainability).
- MIGRATION NO | COMPLEXITY S

**F-20 — No benchmark harness / scale gate**
- FILE: repo `k6/` unused; `5b3-performance-failure.spec.ts` synthetic only
- RECOMMENDATION: benchmark profile at 26 devices / 200 personnel / 30 days with budget assertions before enabling any optimizer in production (folded into Phase E).
- MIGRATION NO | COMPLEXITY M

**Counts: P0=0 · P1=0 · P2=8 (F-01, F-02, F-03, F-05, F-12, F-13, F-14, F-17) · P3=11 (F-04, F-06, F-07, F-08, F-09, F-10, F-11, F-15, F-16, F-18, F-19, F-20 → 12 listed; re-count below).**

*Counting note: the register above lists 12 P3 items (F-04, F-06, F-07, F-08, F-09, F-10, F-11, F-15, F-16, F-18, F-19, F-20) = P3 = **12**.*

## 24. Optimizer Readiness

| Criterion | Assessment |
|---|---|
| 1. Data model | Core adequate (schedule/assignment/shift/device/personnel/device-off); **gaps: availability windows, coverage, real seniority usage** (F-12/F-13/F-07) |
| 2. Constraint model | Hard set is implemented and enforced; **severity/override semantics not unified** (F-16); weekly hours missing (F-06) |
| 3. Persistence | Repository + snapshots + versions ready; application currently only persists the inline generator results (unification needed — F-01) |
| 4. Workflow | Strong (four-eyes, expectedVersion, guards, snapshots); apply-path concurrency gap (F-18) |
| 5. Determinism | Effectively deterministic; tie-break & seniority defects must be fixed before deep search (F-08/F-07) |
| 6. Test readiness | Engine tests strong; **need determinism, generation-depth, e2e, and benchmark** (F-20) |
| 7. Explainability | Dry-run has explanations; production none (F-14) — required to trust optimizer output |
| 8. Benchmarkability | No harness (F-20) |
| 9. API boundaries | `/optimize/dry-run` exists; DDD feature lacks a generate API (F-02) |
| 10. Integration risk | Clear strategy: adopt optimizer as core; risk = behavior delta vs current generator + UI expectations; manageable if feature-flagged |

**Verdict: B — READY AFTER SMALL FOUNDATION WORK.** The optimizer engine itself is built, tested, deterministic-capable and constraint-rich; the foundation work is *unification and honesty* (F-01, F-02, F-05), *data completeness* (F-12, F-13, F-07/F-08/F-06), and *trust infrastructure* (F-14, F-20) — not greenfield.

## 25. Recommended Roadmap (no implementation)

### PHASE A — must fix before optimizer (correctness/data)
| Item | Sev | Reason | Files | Complexity | Migration | Depends | Regr. risk |
|---|---|---|---|---|---|---|---|
| F-12 availability/leave data + consumption | P2 | highest-impact correctness gap for rostering | schema.new, auto-generator, validation, dry-run | L | YES (additive) | — | M |
| F-06 weekly hours + daysInMonth | P3 | silent overwork | auto-generator | S | NO | F-12 | L |
| F-13 minimum-coverage + infeasibility report | P2 | cannot reason about "can't staff" | new coverage model, generator, validate | L | YES (additive) | F-12 | M |
| F-08 determinism tie-break | P3 | reproducible output for diff/benchmark | auto-generator, dry-run | S | NO | — | L |
| F-18 apply expectedVersion | P3 | concurrent-apply hole | controller DTO, auto-generator | S | NO | — | L |
| F-05 job-queue stub | P2 | false success on wired API | processor or route removal | M | NO | — | L |

### PHASE B — should fix before optimizer (coherence)
| Item | Sev | Reason | Files | Complexity | Migration | Depends | Regr. risk |
|---|---|---|---|---|---|---|---|
| F-09 single transition map | P3 | dual states of truth | models/schedule-status + aggregate + workflow | S | NO | — | M (authz) |
| F-16 unified severity/override policy | P3 | two engines disagree | hard-constraints, validation service | M | UNKNOWN | F-01 design | M |
| F-11 route metadata alignment | P3 | correct-but-misleading | controller decorators, error copy | S | NO | — | L |
| F-10 rollback version bump | P3 | version gap on legacy rollback | schedules.service | S | NO | — | L |
| F-17 ONK seed wiring | P2 | fresh-env correctness | seed.ts | S | NO | — | L |
| F-07 real seniority mode | P3 | meaningful fairness | auto-generator, greedy | S | NO | F-08 | L |

### PHASE C — optimizer foundation
| Item | Sev | Reason | Files | Complexity | Migration | Depends | Regr. risk |
|---|---|---|---|---|---|---|---|
| F-01 unify generator core (port + strategies; optimizer authoritative path) | P2 | single engine | generator port, optimizer, application, controllers | XL | UNKNOWN | A+B | H — feature-flag |
| F-19 soft-constraint collection signature | P3 | enable engine fairness at collection level | soft constraints, greedy, local-search | S | — | F-01 | L |
| F-15 in-memory candidate/conflict indices + batch validation | P3 | scale for 26×31 months | auto-generator/optimizer | M | — | F-01 | M |

### PHASE D — real optimization engine
Wire optimizer→persist (via aggregate/repository) behind `/schedules-ddd` generate endpoint; feature-flag; dry-run parity gate; optional local-search/large-neighborhood deferred (XL, depends C).

### PHASE E — explainability & benchmarking
| Item | Sev | Reason | Complexity | Depends |
|---|---|---|---|---|
| F-14 persist per-assignment why + score breakdown + surface | P2 | trust/audit | L | C |
| F-20 realistic perf harness (26 dev / 200 staff / 30 d) + budget gates | P3 | regression protection before optimizer lives | M | C |

### PHASE F — product polish
- F-02 wire new-feature generate or hide action (P2, M, depends C/D).
- F-03 remove/quarantine `core/scheduling` (P3, S).
- F-04 remove backend prototypes/spec-only ScoringModel (P3, S).
- Improve FE scheduler coverage (validators/state) and add determinism + generation-depth e2e specs (P3, M).

## 26. Already-Closed / Do-Not-Touch Areas (verified sound)

- **5C.17 workflow hardening** — intact (gates green in 5C.20 closure: direct-assign never force-publishes, four-eyes, audit-concurrency, published-mutation protection, rollback/swap preservation, export unit resolution).
- **5C.18 DIRECT-01 / FE-01 / EXP-01 / RT-01** — intact (sanitization `schedules-export.service.ts:17-26`; `expectedVersion` transport both stacks; unit confinement `5c18-unit-confinement`).
- **5C.20 SEC-01** — `findAllScoped/findOneScoped` tenant-scoped, 403/404 fail-closed, explicit platform-admin carve-out mirroring `rbac.service.ts:68` (`hospitals.service.ts:30-36,86-119`). Sound.
- **5C.20 SEC-02** — `canAccessUnit` fail-closed on NULL org with single `isExplicitGlobalSystemAdmin` exception (`unit-scope.service.ts:120-122,87-93`). Sound.
- **Tenant isolation** — tenant middleware (15 org-owned models) + `ScheduleAccessGuard` class-level on both schedule controllers + `UnitScopeGuard`. Sound.
- **Unit-scope fail-closed** — `resolveReadScope` `denyAll` for strict roles (`:168-170`). Sound.
- **Four-eyes / optimistic concurrency / snapshots/rollback / DeviceOffDate / audit interceptor / export sanitization** — all present and consistent as documented in §14/§13. **Do not refactor without a specific defect.**

## 27. Validation Evidence

**Audit method (read-only):** recursive glob/full-file/grep examination; no repository state changed. Key runtime code read in full or in load-bearing ranges:
`schedule-auto-generator.service.ts` (700 l, full), `schedule-dry-run.service.ts` (full), `schedules-workflow.service.ts` (approve/reject/publish/submit ranges), `schedules.service.ts` (rollback, bump, override, toggleDeviceOff, validation ranges), `schedules.controller.ts` (guards, routes 498-664), `schedules-ddd.controller.ts` (routes 130-209), `unit-scope.service.ts` (76-247), `schedule-status.ts` (40-214), `schedule.aggregate.ts` (1-75), `hard-constraints.ts` (1-120), `constraints/index.ts`, `canonical-scoring.config.ts`, `greedy-strategy.ts` (324-449), `generate-dialog.component.ts` (180-235), `schema.prisma` (scheduling models), seeds/master configs, `rbac.service.ts:6,68`, plus caller-trace greps (optimizer/fairness/fatigue/SeededRandom/seniority/Math.random/ScheduleAccessGuard importers).

**Standing validation baseline (carried from 5C.20 closure audit, repo unchanged since):**
- Targeted + scope/auth + gates: **275/275** (SEC-01 14, SEC-02 13, scope/auth 162, gates 58, extra 5C.17 gates 28).
- Backend `tsc --noEmit`: CLEAN · `nest build`: PASS.
- FE-01: **15/15** · FE `tsc -p tsconfig.app.json --noEmit`: CLEAN · FE prod build: PASS (2 pre-existing 200 kB budget warnings).
- Full backend regression: **981 pass / 10 fail** — only `device-off.spec.ts` (10) failing, all `Can't reach database server at localhost:5432` (**environment-only, unchanged, unrelated to this audit**).
- Schema/migrations: untouched (no migration in 5C.20; verified again this audit — none present for 2026-09-11/12).
- No test/build was rerun in this audit beyond the 5C.21 read-only verification per the phase instructions; **no source/test/config/schema state was altered during 5C.21**.

## 28. Final Verdict

**READY WITH CONDITIONS**

- **P0:** 0
- **P1:** 0
- **P2:** 8 (F-01, F-02, F-03, F-05, F-12, F-13, F-14, F-17)
- **P3:** 12 (F-04, F-06, F-07, F-08, F-09, F-10, F-11, F-15, F-16, F-18, F-19, F-20)
- **Optimizer readiness:** B — READY AFTER SMALL FOUNDATION WORK
- **Top 5 next actions (audit-only, not performed):**
  1. Model and consume per-date leave/availability (F-12) and enforce weekly hours (F-06) — the biggest correctness gap.
  2. Unify the scheduling engines around the domain optimizer as the single authoritative generator (F-01), with severity/override semantics consolidated (F-16).
  3. Add minimum-coverage / feasibility reporting (F-13) and persist per-assignment explainability (F-14).
  4. Make the new feature's generate real or remove it (F-02), and fix/sever the job-queue stub (F-05).
  5. Harden determinism (F-08), apply-path concurrency (F-18), and add a realistic performance/benchmark gate (F-20).

Conditions for 5C.22: implement based on Phases A→B (correctness/data coherence) before any optimizer activation; no work may proceed on F-01/F-14 integration until A+B land; any schema addition must be additive and migration-planned in a separate decision.

**NO IMPLEMENTATION WAS PERFORMED.** This phase created a single documentation file and did not modify any source, schema, migration, test, dependency, configuration, or UI file. Nothing from Phases A-F, no 5C.22 work, and no optimizer enablement was started.

STOP