# Phase 4 — Concurrency & Reliability Review

Scope: schedule mutation safety (optimistic + distributed locking), workflow state integrity, background job and event reliability, health probes, and shutdown behavior. All references are `file:line` relative to the repository root.

---

## 1. Concurrency Control Architecture

The system layers four independent mechanisms to make schedule mutations safe under concurrent access:

| Layer       | Mechanism                                                                           | Where                                                                               |
| ----------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Domain      | Optimistic locking via a monotonically incremented `version` field on the aggregate | `backend/src/modules/schedules/domain/aggregates/schedule.aggregate.ts:45,170-174`  |
| Persistence | Pre-save version check in the repository before an upsert transaction               | `backend/src/modules/schedules/infrastructure/prisma-schedule.repository.ts:98-109` |
| Application | Redis distributed lock serializing publish/rollback per schedule                    | `backend/src/modules/schedules/schedule-application.service.ts:126,167`             |
| Transport   | `StaleVersionError` → HTTP 409 mapping in the global exception filter               | `backend/src/filters/all-exceptions.filter.ts:29,73-77`                             |

A parallel legacy implementation (`SchedulesWorkflowService`, raw Prisma updates without locks or version checks) still exists at `backend/src/modules/schedules/schedules-workflow.service.ts`; see Findings (F-01).

Data flow for a guarded write (e.g. `publish`):

```
Controller
  └─ ScheduleApplicationService.publish()          ← acquires Redis lock (60s TTL)
       └─ loadAndVerify(scheduleId, expectedVersion)  ← aggregate-level StaleVersionError
            ├─ validationService.validateSchedule()   ← hard-violation gate
       └─ Schedule.publish()                          ← state-machine transition check
       └─ PrismaScheduleRepository.save(s, expectedVersion) ← DB-level version re-check
            └─ prisma.$transaction(upsert schedule / assignments / approval)
```

---

## 2. Optimistic Locking

**Version field.** The `Schedule` aggregate carries `version: number` in its props (`schedule.aggregate.ts:45`). It starts at `1` on creation (`schedule.aggregate.ts:93`) and is incremented by every mutation through `incrementVersion()`:

- status transitions — `transitionTo()` calls it (`schedule.aggregate.ts:517-520`)
- assignment add / remove / update — `schedule.aggregate.ts:318,466,426`
- bulk replace — `schedule.aggregate.ts:485`

**Stale detection (domain).** `verifyVersion(expected)` throws `StaleVersionError` when the loaded aggregate's version differs from the caller's expectation (`schedule.aggregate.ts:170-174`). The error message names both versions and instructs the user to refresh (`domain/errors/schedule-errors.ts:1-9`).

**Stale detection (repository).** `PrismaScheduleRepository.save(schedule, expectedVersion?)` re-reads `{version}` from the DB and throws `StaleVersionError(id, expectedVersion, current.version)` on mismatch before running the write transaction (`prisma-schedule.repository.ts:98-109`). The subsequent upsert of schedule, assignments, and approval record is wrapped in `prisma.$transaction` (`prisma-schedule.repository.ts:111-228`).

**Application wiring.** Every mutating use case accepts an optional `expectedVersion` and funnels through `loadAndVerify()` (`schedule-application.service.ts:57-61`), then forwards the same value into `save(...)` (e.g. `schedule-application.service.ts:70,79,86,94,101,114,139,182`). This gives two checkpoints: one against the freshly loaded aggregate, one against the database row just before commit.

**HTTP semantics.** The global filter maps `StaleVersionError` explicitly to `HttpStatus.CONFLICT` with code `SCHEDULE_VERSION_CONFLICT` and a user-facing "modified by another user" message (`filters/all-exceptions.filter.ts:73-77`, map entry at `all-exceptions.filter.ts:29`). A second domain alias `OptimisticLockConflictError` exists (`domain/errors/schedule-errors.ts:85-92`) but is unused. Related conflict codes (`ScheduleLockError`, `InvalidScheduleStateError`, `AssignmentConflictError`, …) are mapped in `DOMAIN_ERROR_MAP` (`all-exceptions.filter.ts:28-37`).

**Test coverage.** `F42: Optimistic Locking Enforcement` verifies that approving with `expectedVersion=2` against a v3 aggregate rejects with `StaleVersionError`, that no save occurs, and that a matching version succeeds and passes `2` through to `save()` (`__tests__/security-invariants.spec.ts:83-110`).

---

## 3. Distributed Locking

Implementation: `backend/src/infrastructure/distributed-lock.service.ts`, backed by ioredis (`REDIS_CLIENT` injected from the event-store module, `distributed-lock.service.ts:12`), exported via `DistributedLockModule` and registered app-wide in `app.module.ts:47`.

**Acquire — Redis NX PX.** Single atomic `SET key lockId PX ttlMs NX` (`distributed-lock.service.ts:23`). The lock value is a unique token `ownerId:timestamp:random6` (`distributed-lock.service.ts:20`) so releases are owner-checked. Default TTL is 30 s (`DEFAULT_TTL_MS`, `distributed-lock.service.ts:10`). On Redis failure acquisition fails closed (`{ acquired: false }`, `distributed-lock.service.ts:28-31`) — a down Redis blocks publishes rather than allowing unguarded writes.

**Release — Lua safe-release.** Release compares the stored value to the caller's `lockId` inside a Lua script and deletes only on match, preventing a timed-out holder from releasing someone else's lock (`distributed-lock.service.ts:37-47`):

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

**withLock wrapper.** Acquire → run callback → release in `finally` (release happens even if the callback throws); contention raises immediately with _"Could not acquire lock … operation already in progress"_ instead of retrying (`distributed-lock.service.ts:54-69`).

**Publish protection.** `publish()` wraps the entire read-validate-mutate-save sequence in `withLock("schedule:publish:{scheduleId}", …, 60000)` — a 60 s TTL (`schedule-application.service.ts:125-142`). This prevents two directors from publishing the same schedule concurrently and double-firing notifications/side effects.

**Rollback protection.** `rollback()` uses the analogous key `schedule:rollback:{scheduleId}` with the same 60 s TTL (`schedule-application.service.ts:158-186`), plus an idempotency cache keyed `rollback:{scheduleId}:{targetVersion}:{userId}` (see §10).

Note the lock key namespaces differ between publish and rollback; a concurrent rollback and publish on the _same_ schedule are therefore **not** mutually exclusive (Finding F-04).

---

## 4. State Machine Integrity

Statuses: `draft | under_review | approved | published | archived | rejected` (`schedule.aggregate.ts:14-20`).

**Transition matrix** (`VALID_TRANSITIONS`, `schedule.aggregate.ts:22-29`):

```
draft        → under_review
under_review → approved | rejected
approved     → published
published    → archived
archived     → (terminal)
rejected     → draft
```

**Role-restricted transitions** (`TRANSITION_ALLOWED_ROLES`, `schedule.aggregate.ts:31-38`): e.g. only `imaging_director` / `system_admin` / `hospital_admin` may publish or archive; supervisors may approve/reject but not publish; technicians may only submit for review. `canRoleTransition()` composes both checks (`schedule.aggregate.ts:160-164`), and every workflow method enforces it before mutating — e.g. `submitForReview` (`:176-184`), `approve` (`:186-194`), `reject` (with mandatory reason, `:196-207`), `publish` (`:209-218`), `archive` (`:220-228`), `revertToDraft` (`:230-237`).

**Second implementation (legacy path).** `backend/src/models/schedule-status.ts` defines the same matrix as data with per-transition role lists and `requiredComment` flags (`schedule-status.ts:43-107`), plus helpers `isValidTransition` (`:109-115`), `canRoleTransition` (`:117-131`), `canApprove`/`canPublish` (`:165-173`), `isEditable` (`:157-159`). `SchedulesWorkflowService` guards each transition with these (e.g. publish requires `isValidTransition(status, PUBLISHED)`, else 400 _"önce onaylanması gerekir"_ — `schedules-workflow.service.ts:270-274`).

Both implementations agree on the graph itself; they diverge on edge behavior (see Findings F-01/F-05).

---

## 5. Schedule Immutability After Publish

Intended invariant: once `published`, a schedule's assignments can no longer be edited; changes go through archive or revision flow.

- `isEditable` returns true only for `draft`/`rejected` (`schedule.aggregate.ts:129-131`).
- The legacy service enforces this on rollback: _"Yayınlanmış programlar düzenlenemez. Revizyon oluşturun."_ (`schedules-workflow.service.ts:388-392`), and provides `createRevision()` which copies a published schedule into a new draft version (`schedules-workflow.service.ts:458-489`).
- `ScheduleAlreadyPublishedError` ("already published and cannot be modified") exists for this purpose (`domain/errors/schedule-errors.ts:44-49`) and is pre-mapped to HTTP 409 (`all-exceptions.filter.ts:31`).

However, the DDD aggregate's own guards carve out `published`: `addAssignment` and `removeAssignment` throw unless `isEditable || status === 'published'` (`schedule.aggregate.ts:307-309,460-462`), and `updateAssignment` performs **no status check at all** (`schedule.aggregate.ts:373-457`). Direct mutations of published schedules are therefore possible through the DDD path, and `ScheduleAlreadyPublishedError` is never thrown anywhere in the codebase (grep confirms zero construction sites). See Finding F-02.

---

## 6. Four-Eyes Approval

Publish requires prior human approval (`approved → published` is the only route to `published`, §4), which already separates submitter from publisher.

Additionally, the DDD application service enforces the classic four-eyes rule on approval itself: the user who submitted the schedule for review cannot be the one who approves it (`schedule-application.service.ts:105-116`):

```ts
const submittedBy = schedule.approvalData?.submittedBy;
if (submittedBy && submittedBy === userId) {
  throw new ForbiddenException(
    "Four-eyes principle: the person who submitted for review cannot also approve",
  );
}
```

Penetration-style test coverage: `F75: Concurrent Mutation Safety → four-eyes principle — submitter cannot approve` asserts the rejection and that no save occurs (`__tests__/security-invariants.spec.ts:181-196`).

Gaps: the legacy `approve()` (`schedules-workflow.service.ts:128-188`) has no such check, and the guard is skipped when `submittedBy` is null (schedule placed into review without a recorded submitter). See Finding F-03.

---

## 7. Job Queue Reliability (BullMQ)

Queue registration: `BullModule.registerQueue({ name: 'schedule-jobs' })` (`job-queue/schedule-job-queue.module.ts:9`); producer injects it via `@InjectQueue('schedule-jobs')` (`job-queue/schedule-job-queue.service.ts:13`).

**Retry policy.**

| Job type | Attempts | Backoff                                                       | Retention               |
| -------- | -------- | ------------------------------------------------------------- | ----------------------- |
| GENERATE | 3        | exponential, 5 s base (`schedule-job-queue.service.ts:27-33`) | complete 1 h, fail 24 h |
| EXPORT   | 2        | fixed, 3 s (`schedule-job-queue.service.ts:45-51`)            | complete 1 h, fail 24 h |
| REPORT   | 2        | exponential, 5 s (`schedule-job-queue.service.ts:63-69`)      | complete 1 h, fail 24 h |

`removeOnFail: { age: 86400 }` keeps failed jobs inspectable in BullMQ's failed set for a day — effectively a queue-local dead-letter area for schedule jobs (there is no separate DLQ queue for `schedule-jobs`; the dedicated DLQ below serves the events pipeline).

**Idempotency via `isDuplicate`.** Before enqueueing a generation job, `enqueueGenerate` consults `jobStatusService.isDuplicate(scheduleId, GENERATE)` and raises `ConflictException` if an identical QUEUED/RUNNING job exists (`schedule-job-queue.service.ts:18-20`). `isDuplicate` scans job records for matching `scheduleId`+`type` with status QUEUED or RUNNING (`job-queue/schedule-job-status.service.ts:88-94`). Job IDs are `randomUUID()` and reused as BullMQ job IDs so duplicates collapse at enqueue time too (`schedule-job-queue.service.ts:22-28`).

**Processor lifecycle.** `ScheduleJobProcessor` (@Processor('schedule-jobs')) marks start → streams progress (`job.updateProgress` + status service) → marks complete, and on error records the failure then rethrows so BullMQ applies the retry policy (`schedule-job.processor.ts:15-52`). Worker events log completion/failure (`:54-62`). Cancellation removes both the status record transition and the BullMQ job (`schedule-job-queue.service.ts:75-85`).

**Event bus retry & DLQ.** Domain events are persisted to the event store _first_, then enqueued on the `events` queue with `attempts: 3`, exponential backoff 1 s, nothing auto-removed (`events/event-bus.service.ts:20-31`). The consumer processes typed events and, after ≥3 attempts (`attemptsMade >= 2` on the final try), hands off to `DeadLetterQueueService.sendToDlq` instead of rethrowing (`events/handlers/events.consumer.ts:50-57`). DLQ entries store event, error message/stack, timestamp, attemptsMade, never auto-removed, increment monitoring counters (`events/dead-letter-queue.service.ts:16-30`), and support listing, manual requeue (re-adds with fresh 3× exponential retries), flush, and count (`dead-letter-queue.service.ts:32-60`).

---

## 8. Health Checks

`HealthController` (`backend/src/modules/health/health.controller.ts`):

- **Liveness** — `GET /health/live` always answers `ok` while the process is alive, plus uptime; CSRF-exempt for probes (`health.controller.ts:46-55`).
- **Readiness** — `GET /health/ready` aggregates five checks and reports overall `ok | degraded` (`health.controller.ts:57-92`):
  - `database` — `SELECT 1` round-trip (`:174-191`);
  - `redis` — exercised through `scheduleQueue.getJobCounts('waiting')`, reports `failing: redis unreachable` on error (`:211-218`);
  - `queue` — warns when >100 failed jobs accumulate (`:220-228`);
  - `memory` — heap-used/heap-total ratio >0.9 ⇒ warning (`:193-201`);
  - `endpoints` — failing/degraded endpoint counts from `HealthMonitorService` (`:203-209`).
  - Degradation triggers an alert with a 5-minute cooldown (`alertCooldownMs = 300_000`, `:21`, `:72-85`).
- **Authenticated deep check** — `GET /health` adds version, DB latency, memory, endpoint stats behind `JwtAuthGuard` (`:94-122`); `GET /health/dashboard` renders an HTML/JSON ops dashboard (`:124-172`).
- Background DB health polling starts at controller construction (`monitor.startDbHealthCheck`, `:43`).

---

## 9. Graceful Shutdown

`main.ts` enables Nest shutdown hooks during bootstrap (`main.ts:27`) and installs handlers for both signals (`main.ts:155-156`):

```ts
process.on("SIGTERM", () => shutdownHandler("SIGTERM"));
process.on("SIGINT", () => shutdownHandler("SIGINT"));
```

The handler logs `shutdown_initiated`, awaits `app.close()` — which runs all Nest `onApplicationShutdown`/module teardown including BullMQ workers and Redis/DB connections — then exits 0; failures log `shutdown_error` and exit 1 (`main.ts:139-153`).

---

## 10. Snapshot & Rollback

Two coexisting mechanisms:

### DDD path (locked + optimistic)

- `ScheduleApplicationService.rollback()` requires a non-empty reason (`:159-161`), short-circuits repeats through an in-memory idempotency cache keyed `rollback:{scheduleId}:{targetVersion}:{userId}` with a 300 s TTL (`:11-12,163-165`), and runs entirely inside the `schedule:rollback:{id}` distributed lock (`:167-185`).
- Preconditions: schedule must currently be `published` (409 otherwise, `:170-172`) and target must be older than current version (`:174-176`).
- Snapshot lookup goes through `getVersionSnapshot()` reading the `ScheduleSnapshot` table (`prisma-schedule.repository.ts:244-257`); missing snapshots yield 404 (`:178-179`).
- Aggregate `rollback()` validates again (`version <= target ⇒ error`, `schedule.aggregate.ts:247-249`), rebuilds every assignment as a new entity with `source: 'override'` and `restored-*` IDs (`:251-268`), swaps the collection, forces status back to `draft`, increments the version, and emits `ScheduleRolledBackEvent` plus a status-change event (`:270-287`). Persistence is transactional via `save()` (`prisma-schedule.repository.ts:111-228`).

### Legacy path (workflow service)

- `createSnapshot()` stores the full assignment set as JSON under `nextVersion = max(schedule.version, lastSnapshot+1)` before publishing ("Yayınlama öncesi snapshot", `schedules-workflow.service.ts:276,660-687`).
- `rollback()` deletes all current assignments, recreates them from the snapshot payload (`:394-426`), takes a post-restore snapshot annotated with the reason (`:428`), and bumps the schedule row atomically with `version: { increment: 1 }` (`:430-438`), writing a ROLLBACK audit entry with before/after versions (`:440-447`).
- `createRevision()` snapshots a published schedule into the next version and resets it to draft (`:458-489`).

---

## 11. Findings & Risk Classification

| ID   | Severity | Finding                                                                                                                                                                                                                                                                                                                                                                      | Evidence                                                                                                                          |
| ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | **High** | Duplicated workflow stacks: the locked/version-checked `ScheduleApplicationService` coexists with legacy `SchedulesWorkflowService` (raw Prisma writes, no locks, no version checks) and a third full copy under `modules/schedules/schedules/`. Which one serves traffic depends on controller wiring; legacy endpoints bypass every guarantee in this document.            | `schedule-application.service.ts` vs `schedules-workflow.service.ts`; duplicate tree `backend/src/modules/schedules/schedules/**` |
| F-02 | **High** | Published schedules are mutable via the DDD path: `addAssignment`/`removeAssignment` explicitly allow `status === 'published'`, and `updateAssignment` has no status guard; `ScheduleAlreadyPublishedError` is defined and mapped but never thrown. Contradicts the immutability invariant enforced elsewhere.                                                               | `schedule.aggregate.ts:307-309,373-457,460-462`; `schedule-errors.ts:44-49` (unused)                                              |
| F-03 | Medium   | Four-eyes enforcement is asymmetric: present in the DDD `approve()` only; legacy approve lacks it, and the check is skipped when `approvalData.submittedBy` is null.                                                                                                                                                                                                         | `schedule-application.service.ts:108-111`; `schedules-workflow.service.ts:128-188`                                                |
| F-04 | Medium   | Publish and rollback use different lock key prefixes (`schedule:publish:*` vs `schedule:rollback:*`), so those two operations can interleave on the same schedule; only same-operation concurrency is serialized.                                                                                                                                                            | `schedule-application.service.ts:126,167`                                                                                         |
| F-05 | Medium   | Optimistic-lock DB check is not atomic with the write: `save()` reads `version`, compares, then opens a separate `$transaction` whose `upsert` has no `WHERE version = expected` predicate — a small TOCTOU window remains between check and commit (mitigated but not eliminated by the app-level lock on publish/rollback; ordinary assignment edits have no lock at all). | `prisma-schedule.repository.ts:98-130`                                                                                            |
| F-06 | Medium   | In-memory idempotency/state stores: `processedOps` Map (application service) and `jobs` Map (job status) are per-process and lost on restart. With multiple replicas, `isDuplicate` dedup fails cross-instance and rollback replay-protection evaporates on deploy/restart.                                                                                                  | `schedule-application.service.ts:11-12`; `schedule-job-status.service.ts:21`                                                      |
| F-07 | Medium   | Readiness probe returns HTTP 200 with body `status: 'degraded'`; Kubernetes readiness gates on status codes, so degraded instances are not removed from Service endpoints. Degraded checks should set an appropriate non-200 status (or the platform should rely on the alert path only).                                                                                    | `health.controller.ts:87-92`                                                                                                      |
| F-08 | Medium   | Distributed locks have no renewal/watchdog: a publish/rollback exceeding the fixed 60 s TTL continues running after expiry while another holder can acquire and mutate concurrently (the Lua safe-release then correctly refuses the stale release, leaving the second holder's work unserialized).                                                                          | `distributed-lock.service.ts:54-69`; TTL arg `schedule-application.service.ts:141,185`                                            |
| F-09 | Low      | Legacy `rollback()` performs delete→recreate→snapshot→bump as five independent Prisma calls without a transaction; a mid-sequence failure leaves a published schedule with zero assignments. (DDD path is transactional but does not snapshot post-restore.)                                                                                                                 | `schedules-workflow.service.ts:404-438`; `prisma-schedule.repository.ts:111-228`                                                  |
| F-10 | Low      | Processor handlers are simulated (`simulateWork` sleeps) — retry/DLQ/idempotency plumbing is real but the actual generation/validation/export work is placeholder.                                                                                                                                                                                                           | `schedule-job.processor.ts:64-107`                                                                                                |
| F-11 | Low      | State-machine logic duplicated three times (aggregate constants, `models/schedule-status.ts`, nested copy) with subtly different role rules (e.g. `canRoleTransition` hard-codes system_admin/hospital_admin bypass; aggregate encodes them in the table) — drift risk.                                                                                                      | `schedule.aggregate.ts:22-38`; `models/schedule-status.ts:43-131`                                                                 |
| F-12 | Info     | Lock acquisition fails closed on Redis errors (availability coupled to Redis), and `withLock` throws a plain `Error` (500) on contention rather than a mapped 409/423 — consider raising `ScheduleLockError`, which is already mapped to 409 `SCHEDULE_LOCKED`.                                                                                                              | `distributed-lock.service.ts:28-31,61`; `all-exceptions.filter.ts:30`; `schedule-errors.ts:11-16`                                 |

### What is solid

- Version checking is wired end-to-end (aggregate → repository → HTTP 409) with penetration-style test coverage (`security-invariants.spec.ts:83-110`).
- Redis locking uses the correct primitive (`SET NX PX` + compare-and-delete Lua) and releases on failure paths.
- Event delivery has store-first durability, bounded retries, a real DLQ with manual requeue, and monitoring hooks.
- Liveness/readiness separation, alert cooldown, and graceful SIGTERM/SIGINT shutdown via `app.close()` follow operational best practice.
