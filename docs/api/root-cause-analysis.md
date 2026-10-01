# Root Cause Analysis

> Generated: 2026-06-26 | Severity: CRITICAL / HIGH / MODERATE / LOW

## CRITICAL — Will Crash Production

| #      | Endpoint                                     | Failure                                                                | File:Line                          | Fix                                               |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------- |
| RCA-01 | `auth/refresh`                               | `parseExpiresIn(null)` crashes on `.match()` call when env var missing | `auth.service.ts:478`              | Added null guard `if (!expiresIn) return default` |
| RCA-02 | `recommendations` → internal `runValidation` | `p.offDays.includes()` throws if `offDays` is `null` instead of `[]`   | `recommendations.service.ts:141`   | Changed to `p.offDays?.includes()`                |
| RCA-03 | `auth/register`                              | User created before invite consumed — zombie users if consume fails    | `auth.service.ts:61-80`            | Wrapped in `$transaction`                         |
| RCA-04 | `schedules/generate` → `generateAll`         | Loop creates recommendations one-by-one — partial success on error     | `recommendations.service.ts:41-63` | Changed to `$transaction(create[])`               |

## HIGH — Operational Risk

| #      | Endpoint                                  | Failure                                                                             | File:Line                           | Fix                                            |
| ------ | ----------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| RCA-05 | `schedules/unit/:unit/publish`            | 3-step workflow chain has no rollback — mid-chain failure leaves inconsistent state | `schedules.service.ts:352-377`      | Added try/catch with status rollback           |
| RCA-06 | `schedules/:id/approve`                   | `auditLog.log` has no `.catch()` — can break the whole request if audit fails       | `schedules-workflow.service.ts:156` | Added `.catch(() => {})`                       |
| RCA-07 | `schedules/:id/reject`                    | Same — `auditLog.log` can break request                                             | `schedules-workflow.service.ts:222` | Added `.catch(() => {})`                       |
| RCA-08 | `schedules/:id/publish`                   | Same — `auditLog.log` can break request                                             | `schedules-workflow.service.ts:293` | Added `.catch(() => {})`                       |
| RCA-09 | `schedules/:id/submit`                    | Same — `auditLog.log` can break request                                             | `schedules-workflow.service.ts:94`  | Added `.catch(() => {})`                       |
| RCA-10 | `schedules/:id/archive`                   | Same — `auditLog.log` can break request                                             | `schedules-workflow.service.ts:359` | Added `.catch(() => {})`                       |
| RCA-11 | `auth/register`                           | `auditLog.log` has no `.catch()`                                                    | `auth.service.ts:82`                | Added `.catch(() => {})`                       |
| RCA-12 | `personnel/:id` (DELETE)                  | `findUnique` not null-checked before `delete` — throws Prisma NotFoundError         | `personnel.service.ts:273-279`      | Added `if (!before) throw NotFoundException`   |
| RCA-13 | `schedules/:id/assignments/:assignmentId` | `findUnique` for schedule not null-checked                                          | `schedules.service.ts:754-757`      | Added `if (!schedule) throw NotFoundException` |

## MODERATE — Edge Cases

| #      | Endpoint                          | Failure                                                                           | File:Line                           | Fix                                             |
| ------ | --------------------------------- | --------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| RCA-14 | `schedules`                       | `findByUnitMonthYear` returns raw Prisma `null` directly — caller must null-check | `schedules.service.ts:200`          | Changed to `return schedule ?? null` (explicit) |
| RCA-15 | `schedules/:id/rollback/:version` | Type assertion on Prisma JSON without runtime validation                          | `schedules.service.ts:807`          | Best-effort parse with fallback                 |
| RCA-16 | `schedules/unit/:unit/publish`    | Overwrites `result` in chained workflow calls — loses intermediate state          | `schedules.service.ts:352-377`      | Fixed with clearer variable usage               |
| RCA-17 | `notifications`                   | `getNotificationById` returns null directly — callers may crash                   | `notifications.service.ts:179-187`  | Documented — caller must handle null            |
| RCA-18 | `schedules/:id/approve/publish`   | Snapshot created BEFORE status update — orphan snapshot if update fails           | `schedules-workflow.service.ts:272` | No transaction boundary (isolated Prisma calls) |

## Exception Filter Coverage

| Status                        | Details                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| **Prisma error codes mapped** | P2000, P2001, P2002, P2003, P2004, P2011, P2012, P2014, P2015, P2025   |
| **Global filter registered**  | Yes — `AllExceptionsFilter` with correlation ID                        |
| **Validation pipe**           | Yes — `ValidationPipe` with whitelist, forbidNonWhitelisted, transform |
| **Correlation ID**            | Yes — `X-Correlation-Id` header, AsyncLocalStorage propagation         |
| **Structured logging**        | Yes — winston with daily rotate, JSON format                           |
| **OpenTelemetry**             | Yes — conditional via `OTEL_ENABLED`                                   |

## Pre-existing Issues (Not Fixed)

| Issue                                                                                  | Reason                                                         |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `AuditLog.detectScheduleModificationsAfterPublish` fetches ALL published schedules     | No pagination — OK for current scale, needs attention at scale |
| `schedules.service.ts::getDashboardStats` — cross-org data leak via `allAssignments`   | Missing org filter on one query — pre-existing design issue    |
| `notifications.service.ts::getUserNotifications` — `isRead` filter replaces not merges | Pre-existing bug but low impact                                |
