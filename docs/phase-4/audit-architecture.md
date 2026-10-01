# Audit Architecture

This document describes the audit logging architecture of the vardiya (shift) system backend, based on the audit-log module, correlation infrastructure, and Winston logger.

- Core service: `backend/src/modules/audit-log/audit-log.service.ts`
- Event constants: `backend/src/modules/audit-log/audit.constants.ts`
- Correlation: `backend/src/correlation/correlation.interceptor.ts`, `backend/src/correlation/correlation.service.ts`
- Logging: `backend/src/logger/winston-logger.ts`
- Persistence model: `backend/prisma/schema.prisma` (`AuditLog`, line 942)

---

## Event Types

All auditable events are defined in the `AuditEvent` enum in `backend/src/modules/audit-log/audit.constants.ts:1-70`, with Turkish display labels in `AuditEventLabels` (`audit.constants.ts:72-141`). The categories are:

| Category                   | Events                                                                                                                                                                                         | Definition                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Auth                       | `LOGIN`, `LOGOUT`, `FAILED_LOGIN`, `PASSWORD_CHANGE`, `TOKEN_REFRESH`                                                                                                                          | `audit.constants.ts:3-7`   |
| Security (F31)             | `ACCOUNT_LOCKED`, `ACCOUNT_UNLOCKED`, `REFRESH_TOKEN_REUSE`, `SESSION_REVOKED`, `UNAUTHORIZED_ACCESS`, `CROSS_TENANT_ACCESS_ATTEMPT`, `PERMISSION_DENIED`, `RATE_LIMIT_TRIGGERED`              | `audit.constants.ts:10-17` |
| Users                      | `USER_CREATED`, `USER_UPDATED`, `USER_DISABLED`, `ROLE_CHANGED`, `PERMISSION_CHANGED`                                                                                                          | `audit.constants.ts:20-24` |
| Personnel                  | `PERSONNEL_CREATED`, `PERSONNEL_UPDATED`, `PERSONNEL_DELETED`                                                                                                                                  | `audit.constants.ts:27-29` |
| Schedules (full lifecycle) | `SCHEDULE_CREATED`, `SCHEDULE_GENERATED`, `SCHEDULE_UPDATED`, `SCHEDULE_SUBMITTED`, `SCHEDULE_APPROVED`, `SCHEDULE_REJECTED`, `SCHEDULE_PUBLISHED`, `SCHEDULE_ROLLED_BACK`, `SCHEDULE_DELETED` | `audit.constants.ts:32-40` |
| Assignments                | `ASSIGNMENT_CREATED`, `ASSIGNMENT_UPDATED`, `ASSIGNMENT_REMOVED`                                                                                                                               | `audit.constants.ts:43-45` |
| Attendance                 | `ATTENDANCE_CREATED`, `ATTENDANCE_UPDATED`                                                                                                                                                     | `audit.constants.ts:48-49` |
| Training                   | `TRAINING_CREATED`, `TRAINING_UPDATED`, `TRAINING_COMPLETED`                                                                                                                                   | `audit.constants.ts:52-54` |
| Devices                    | `DEVICE_CREATED`, `DEVICE_UPDATED`, `DEVICE_INCIDENT_CREATED`                                                                                                                                  | `audit.constants.ts:57-59` |
| Permissions                | `ROLE_ASSIGNED`, `ROLE_REMOVED`, `PERMISSION_GRANTED`, `PERMISSION_REVOKED`                                                                                                                    | `audit.constants.ts:62-65` |
| System                     | `SETTINGS_CHANGED`, `CONFIGURATION_UPDATED`                                                                                                                                                    | `audit.constants.ts:68-69` |

Entity types referenced by audit entries are enumerated in `EntityTypeLabels` at `audit.constants.ts:143-157` (user, personnel, schedule, assignment, attendance, training, device, device_incident, role, permission, setting, configuration, shift).

A decorator-facing metadata contract exists as `AUDIT_METADATA_KEY = 'audit:metadata'` and the `AuditMetadata` interface (action, entityType, description) at `audit.constants.ts:159-165`.

The low-level write verbs are defined separately in the `AuditAction` enum (`CREATE`, `UPDATE`, `DELETE`, `SUBMIT_FOR_REVIEW`, `APPROVE`, `REJECT`, `PUBLISH`, `ARCHIVE`, `ROLLBACK`, `CREATE_REVISION`, `LOGIN`, `LOGOUT`, `ASSIGN`, `UNASSIGN`, `LOCK`, `UNLOCK`, `DISABLE`) at `backend/src/modules/audit-log/audit-log.service.ts:8-26`.

---

## Audit Log Schema

### Persistence model (Prisma)

The `AuditLog` model is defined at `backend/prisma/schema.prisma:942-986` and maps to the `audit_logs` table (`@@map("audit_logs")`, schema.prisma:985).

Core fields (schema.prisma:943-968):

| Field                                                | Type                                                              | Notes                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| `id`                                                 | `String @id @default(uuid())`                                     | Primary key (line 943)                                |
| `requestId`                                          | `String?`                                                         | Correlation ID of originating HTTP request (line 944) |
| `userId` / `userName` / `userRole`                   | actor identity (lines 945-947)                                    |
| `organizationId` / `hospitalId` / `unitId`           | tenancy scoping (lines 948-950)                                   |
| `actionType` / `entityType` / `entityId`             | what was done to what (lines 951-953)                             |
| `oldValue` / `newValue`                              | `Json?` before/after snapshots (lines 954-955)                    |
| `description`, `ipAddress`, `userAgent`              | context; IP/UA stored hashed (see below) (lines 956-958)          |
| `status`                                             | default `"SUCCESS"` (line 959)                                    |
| `metadata`                                           | free-form JSON (line 960)                                         |
| `dataClassification`                                 | enum `AuditDataClassification`, default `UNCLASSIFIED` (line 961) |
| `retentionHash`, `consentId`                         | GDPR/KVKK retention fields (lines 962-963)                        |
| `flagged` / `flagReason` / `flaggedAt` / `flaggedBy` | review workflow (lines 964-967)                                   |
| `createdAt`                                          | `@default(now())` (line 968)                                      |

Indexes are declared at schema.prisma:972-984, covering time-range queries (`createdAt`), action filtering (`actionType`), per-user history (`userId`, `[userId, createdAt]`), entity trails (`[entityType, entityId]`), tenancy filters (`organizationId`, `[organizationId, createdAt]`, `hospitalId`, `unitId`), status, and flag/classification/retention lookups.

A relation to the `User` model is enforced via FK (`user User @relation(...)`, schema.prisma:970).

### In-memory representation

- Public API shape `AuditLogEntry`: `audit-log.service.ts:48-72`
- Raw DB record shape `AuditLogRecord`: `audit-log.service.ts:107-134`
- Per-field diff shape `AuditChange` (`field`, `oldValue`, `newValue`, `changeType: 'added' | 'removed' | 'modified'`): `audit-log.service.ts:74-79`
- Write input `LogEntryInput` (supports both new `oldValue/newValue` and legacy `before/after` keys): `audit-log.service.ts:81-105`

Field-level diffs are computed by the static `computeChanges()` method using JSON serialization comparison (`audit-log.service.ts:648-688`) and attached to every formatted entry in `formatAuditLogEntry()` (`audit-log.service.ts:715`).

---

## Audit Trail Integrity (append-only)

The trail follows an append-only design with narrow, metadata-only exceptions:

1. **Append-only writes.** The only entry-mutating paths are single inserts (`log()` calls `prisma.auditLog.create`, `audit-log.service.ts:158-178`) and bulk inserts (`logBatch()` calls `prisma.auditLog.createMany`, `audit-log.service.ts:185-205`). The service exposes no update or delete method for log content.

2. **PII minimization via hashing.** Client `ipAddress` and `userAgent` are never stored verbatim; they pass through `hashField()`, a truncated SHA-256 (first 16 hex chars), before persistence (`hashField` at `audit-log.service.ts:148-150`; applied at `audit-log.service.ts:173-174` for singles and `audit-log.service.ts:200-201` for batches). This keeps forensic join capability (same IP → same hash) without storing raw PII.

3. **Immutable content, mutable review flags.** The only update operations are `flagLog()` / `unflagLog()` (`audit-log.service.ts:324-334`, `336-346`), which touch exclusively the review columns `flagged`, `flagReason`, `flaggedAt`, `flaggedBy` — never `oldValue`, `newValue`, or any event data.

4. **Snapshot-based diffs instead of deltas.** Both before and after states are persisted as JSON (`oldValue`/`newValue`, schema.prisma:954-955), so a tampered or partial row remains independently interpretable and re-diffable via `computeChanges()` (`audit-log.service.ts:648-688`).

5. **Server-side timestamps.** `createdAt` defaults to database time (`@default(now())`, schema.prisma:968); clients cannot backdate events.

Note: the schema reserves GDPR/KVKK fields `dataClassification`, `retentionHash`, and `consentId` (schema.prisma:961-963) that the current writer does not populate yet — retention enforcement is a planned extension.

---

## Security Events

Security events span two layers:

### Declared security event types (F31 hardening block)

Defined in the `Security (F31)` section of the `AuditEvent` enum (`audit.constants.ts:10-17`): account lock/unlock lifecycle, refresh-token reuse detection, session revocation, unauthorized access, cross-tenant access attempts, permission denials, and rate-limit triggers.

### Runtime anomaly detection

The `SuspiciousActivityType` enum (`audit-log.service.ts:28-36`) defines detector output types: `RAPID_CHANGES`, `OFF_HOURS`, `BULK_DELETE`, `FAILED_LOGINS`, `PERMISSION_ESCALATION`, `DATA_EXPORT`, `SCHEDULE_MODIFICATION`. Each finding is returned as a `SuspiciousActivity` object carrying type, severity, message, details, timestamp, and user attribution (`audit-log.service.ts:38-46`). Detection thresholds are class constants on `AuditLogService` (`audit-log.service.ts:138-141`).

Detectors (orchestrated by `detectSuspiciousActivity()`, `audit-log.service.ts:421-442`):

| Detector                           | Rule                                                                                                           | Severity | Location                                                                                                                    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------- |
| Rapid changes                      | ≥ 10 `UPDATE`/`DELETE` actions within 1 hour (`RAPID_CHANGE_THRESHOLD = 10`, `RAPID_CHANGE_WINDOW_MS = 60000`) | high     | `audit-log.service.ts:444-478`                                                                                              |
| Off-hours activity                 | ≥ 3 actions logged between 22:00–06:00 (`OFF_HOURS_START = 22`, `OFF_HOURS_END = 6`)                           | medium   | `audit-log.service.ts:480-511`                                                                                              |
| Bulk delete                        | ≥ 5 `DELETE`/`BULK_DELETE` actions within 1 hour                                                               | critical | `audit-log.service.ts:513-548`                                                                                              |
| Post-publish schedule modification | Any `UPDATE`/`DELETE`/`ROLLBACK` on a published schedule after its recorded publish date                       | high     | `audit-log.service.ts:550-596`; publish date resolved from `scheduleApproval.publishedAt` at `audit-log.service.ts:598-603` |

Flagged findings feed the manual review workflow (`getFlaggedLogs()`, `audit-log.service.ts:348-360`) and aggregate statistics (`getStatistics()` reports flagged counts, `audit-log.service.ts:362-419`).

---

## Correlation ID Propagation

Correlation IDs tie an audit record back to the exact HTTP request that produced it.

1. **Ingress.** `CorrelationInterceptor.intercept()` accepts an inbound `x-correlation-id` header or generates a UUID v4, then echoes it back on the response as `X-Correlation-Id` (`correlation.interceptor.ts:15-17`).

2. **Context propagation.** The interceptor wraps the downstream handler in `correlationService.run(...)` with `{ correlationId, userId, organizationId }` extracted from the authenticated request (`correlation.interceptor.ts:19-34`).

3. **Async-local storage.** `CorrelationService` stores this context in a Node `AsyncLocalStorage<CorrelationContext>` (`correlation.service.ts:12`), so the ID survives across awaits, nested services, and RxJS stream scheduling without parameter drilling. Accessors: `getCorrelationId()` (defaults to `'system'` outside a request, `correlation.service.ts:18-20`) and `getContext()` (`correlation.service.ts:22-24`). Storage is disabled on module shutdown (`correlation.service.ts:26-28`).

4. **Persistence.** `AuditLogService.log()` reads the ambient context and writes it into the `requestId` column (`audit-log.service.ts:152-160`); `logBatch()` stamps all entries in one batch with the same request ID (`audit-log.service.ts:182-187`). If no explicit `organizationId` is supplied, it falls back to the tenant from the correlation context (`audit-log.service.ts:164`, `191`).

Result: every audit row can be traced end-to-end from client response header → request log → database row.

---

## Structured Logging

Application logs complement the DB audit trail and are produced by the shared Winston logger (`backend/src/logger/winston-logger.ts`):

1. **JSON output everywhere.** All transports use a combined format of OpenTelemetry enrichment → ISO-8601 millisecond timestamps → stack-trace-aware error serialization → `format.json()` (`winston-logger.ts:19-24`), making every line machine-parseable.

2. **Trace correlation.** The custom `otelFormat` injects the active span's `trace_id`, `span_id`, and `trace_flags` into each log record when OpenTelemetry tracing is active (`winston-logger.ts:8-17`). This gives log lines a second correlation axis (distributed trace ID) alongside the HTTP correlation ID.

3. **Transports & rotation.** Logs go to stdout plus a daily rotating file `logs/vardiya-api-%DATE%.log` with gzip archiving, 20 MB max size, and 14-day retention (`winston-logger.ts:26-34`, wired at `winston-logger.ts:40-43`). Directory and level come from `LOG_DIR` / `LOG_LEVEL` env vars (`winston-logger.ts:5-6`).

4. **Service attribution.** Every record carries `defaultMeta: { service: 'vardiya-api' }` (`winston-logger.ts:39`).

5. **Exception recording.** `recordException()` marks the active OTel span as errored (`span.recordException` + `SpanStatusCode.ERROR`) and emits a structured `error` log containing message, stack, and arbitrary metadata (`winston-logger.ts:46-57`).

---

## Risk Classification

Risk is expressed through severity levels on suspicious-activity findings and threshold tuning:

### Severity scale

Four levels — `'low' | 'medium' | 'high' | 'critical'` — are declared on `SuspiciousActivity.severity` (`audit-log.service.ts:40`). Currently assigned severities:

| Severity | Finding                 | Trigger                                                                                                      |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| critical | `BULK_DELETE`           | ≥ 5 deletions/hour by one user (`audit-log.service.ts:523-535`)                                              |
| high     | `RAPID_CHANGES`         | ≥ 10 UPDATE/DELETE ops within the 60 s window constant (`audit-log.service.ts:138-139`, raised at `454-462`) |
| high     | `SCHEDULE_MODIFICATION` | modification of a published schedule after publish date (`audit-log.service.ts:574-577`)                     |
| medium   | `OFF_HOURS`             | ≥ 3 operations between 22:00 and 06:00 local (`audit-log.service.ts:140-141`, `489-497`)                     |

### Classification inputs

- Behavioral velocity: counts of destructive actions per user per window (`detectRapidChanges`, `detectBulkOperations`).
- Temporal anomaly: activity outside business hours (`OFF_HOURS_START`/`OFF_HOURS_END`, `audit-log.service.ts:140-141`).
- Data-state integrity: writes to entities in a locked state (`published` schedules), verified against `scheduleApproval.publishedAt` (`audit-log.service.ts:550-603`).
- Status outcome on each entry itself: `status` field defaults to `SUCCESS` (schema.prisma:959; set in `log()` at `audit-log.service.ts:175`) and is filterable (`findAll` supports `status`, `audit-log.service.ts:233`).

### Downstream handling

- Findings are aggregated per user/entity/action in timelines and statistics (`getTimeline()` summary includes `flaggedCount`, `audit-log.service.ts:633-643`; `getStatistics()` returns flagged totals and per-action/per-user/per-entity breakdowns, `audit-log.service.ts:362-419`).
- Reviewers triage via flag/unflag with attribution (`flagLog`/`unflagLog`, `audit-log.service.ts:324-346`).
- Display labels for actions and entity types localize findings in the UI (`AuditEventLabels`, `EntityTypeLabels` consumed in `formatAuditLogEntry` at `audit-log.service.ts:704-706` and helpers at `audit-log.service.ts:721-727`).
