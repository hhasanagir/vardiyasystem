# Enterprise Audit Logging Architecture

## 1. System Overview

A tamper-resistant, event-driven audit logging system for healthcare workforce management. Every critical user action is automatically captured with full context (who, what, when, where, before/after) and stored immutably in PostgreSQL.

### Core Principles

- **Immutability** — Logs are write-once; no update/delete APIs exist
- **Completeness** — Every CRUD, auth, and workflow transition is captured
- **Traceability** — Every entry links to the originating HTTP request via `requestId`
- **Performance** — Async event-driven writes, no blocking on audit
- **Compliance** — Supports HIPAA, JCI, and internal hospital audit requirements

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Angular Frontend                             │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Audit Center Module                           │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────────────┐   │   │
│  │  │ Audit List   │ │ Audit Detail │ │ Export Controls       │   │   │
│  │  │ + Filters    │ │ + Changes    │ │ CSV / Excel / PDF     │   │   │
│  │  └─────────────┘ └──────────────┘ └──────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │ HTTPS
┌──────────────────────▼──────────────────────────────────────────────┐
│                       NestJS Backend                                │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                   Audit Module                               │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌────────────┐  │   │
│  │  │ @Audit() │  │  Audit   │  │  Audit    │  │  Audit     │  │   │
│  │  │Decorator │  │Intercept.│  │  Service  │  │ Controller │  │   │
│  │  └──────────┘  └──────────┘  └───────────┘  └────────────┘  │   │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────┐                   │   │
│  │  │  Event   │  │ Request  │  │Change     │                   │   │
│  │  │  Emitter │  │  Guard   │  │Tracker    │                   │   │
│  │  └──────────┘  └──────────┘  └───────────┘                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                 Shared Infrastructure                        │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐      │   │
│  │  │ Correlation  │  │   Prisma     │  │  Permission   │      │   │
│  │  │   Service    │  │   Service    │  │    Guard      │      │   │
│  │  └──────────────┘  └──────────────┘  └───────────────┘      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────────────────────────┐
│                      PostgreSQL                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  audit_logs                                                    │   │
│  │  - id (UUID PK)    - organizationId  - oldValue (JSONB)       │   │
│  │  - requestId       - hospitalId      - newValue (JSONB)       │   │
│  │  - userId          - unitId          - ipAddress               │   │
│  │  - userName        - actionType      - userAgent               │   │
│  │  - userRole        - entityType      - timestamp               │   │
│  │                     - entityId       - status                  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  Indexes: (createdAt), (userId), (actionType), (entityType+entityId)│
│           (organizationId), (hospitalId), (unitId)                  │
└─────────────────────────────────────────────────────────────────────┘
```

## 3. Data Flow

```
User Action
    │
    ▼
Controller (@Audit decorator or manual call)
    │
    ├──► AuditInterceptor captures request context
    │      (requestId, user, IP, userAgent, org/hospital/unit)
    │
    ▼
AuditService.log()
    │
    ├──► Compute changes (before vs after diff)
    ├──► Enrich with correlation context
    ├──► Attach requestId from CorrelationService
    │
    ▼
PrismaService.auditLog.create()
    │
    ► PostgreSQL (immutable write)
```

### Audit Event Flow (Async)

```
Service method
    │
    ▼
AuditEventEmitter.emit('audit.log', payload)
    │
    ▼
AuditEventHandler (async listener)
    │
    ▼
AuditService.log() → Database
```

## 4. Event Definitions

### Authentication Events

| Event             | Description                 |
| ----------------- | --------------------------- |
| `LOGIN`           | User successfully logged in |
| `LOGOUT`          | User logged out             |
| `FAILED_LOGIN`    | Failed login attempt        |
| `PASSWORD_CHANGE` | User changed their password |
| `TOKEN_REFRESH`   | JWT token was refreshed     |

### Personnel Events

| Event               | Description                  |
| ------------------- | ---------------------------- |
| `PERSONNEL_CREATED` | New personnel record created |
| `PERSONNEL_UPDATED` | Personnel record updated     |
| `PERSONNEL_DELETED` | Personnel record deleted     |

### Schedule Events

| Event               | Description       |
| ------------------- | ----------------- |
| `SCHEDULE_CREATED`  | Schedule created  |
| `SCHEDULE_UPDATED`  | Schedule updated  |
| `SCHEDULE_APPROVED` | Schedule approved |
| `SCHEDULE_DELETED`  | Schedule deleted  |

### Attendance Events

| Event                | Description               |
| -------------------- | ------------------------- |
| `ATTENDANCE_CREATED` | Attendance record created |
| `ATTENDANCE_UPDATED` | Attendance record updated |

### Training Events

| Event                | Description              |
| -------------------- | ------------------------ |
| `TRAINING_CREATED`   | Training record created  |
| `TRAINING_UPDATED`   | Training record updated  |
| `TRAINING_COMPLETED` | Training marked complete |

### Device Events

| Event                     | Description              |
| ------------------------- | ------------------------ |
| `DEVICE_CREATED`          | New device registered    |
| `DEVICE_UPDATED`          | Device record updated    |
| `DEVICE_INCIDENT_CREATED` | Device incident reported |

### Permission Events

| Event                | Description                  |
| -------------------- | ---------------------------- |
| `ROLE_ASSIGNED`      | Role assigned to user        |
| `ROLE_REMOVED`       | Role removed from user       |
| `PERMISSION_GRANTED` | Permission granted to role   |
| `PERMISSION_REVOKED` | Permission revoked from role |

### System Events

| Event                   | Description              |
| ----------------------- | ------------------------ |
| `SETTINGS_CHANGED`      | System settings modified |
| `CONFIGURATION_UPDATED` | Configuration updated    |

## 5. Change Tracking

Only changed fields are stored. The `computeChanges()` method diffs `before` vs `after` JSON snapshots:

```typescript
interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: "added" | "removed" | "modified";
}
```

### Example: Schedule update

```json
{
  "before": { "shift": "08:00-16:00", "deviceId": "d1" },
  "after": { "shift": "16:00-24:00", "deviceId": "d1" },
  "changes": [
    {
      "field": "shift",
      "oldValue": "08:00-16:00",
      "newValue": "16:00-24:00",
      "changeType": "modified"
    }
  ]
}
```

## 6. Request Correlation

Every audit entry links to the HTTP request via `requestId` using `CorrelationService` (AsyncLocalStorage):

```typescript
// CorrelationService (existing)
export interface CorrelationContext {
  correlationId: string;
  userId?: string;
  organizationId?: string;
  hospitalId?: string;
  unitId?: string;
}
```

The `AuditInterceptor` auto-populates:

- `requestId` → `CorrelationService.getCorrelationId()`
- IP address, user agent → HTTP request headers
- User info → JWT payload
- Org/hospital/unit → User context

## 7. Security Model

### Access Control

| Role               | Read | Export | Flag | Admin |
| ------------------ | ---- | ------ | ---- | ----- |
| SYSTEM_ADMIN       | ✅   | ✅     | ✅   | ✅    |
| READ_ONLY_AUDITOR  | ✅   | ✅     | ❌   | ❌    |
| ORGANIZATION_ADMIN | ✅   | ✅     | ✅   | ❌    |
| Others             | ❌   | ❌     | ❌   | ❌    |

### Immutability

- **No UPDATE endpoint** — logs cannot be modified
- **No DELETE endpoint** — logs cannot be deleted
- Only `flag`/`unflag` operations allowed (for investigational marking)
- Database-level: `audit_logs` table has no UPDATE/DELETE triggers from app

### Tamper Evidence

- Each log entry records `ipAddress` and `userAgent` of the actor
- Flagged entries include `flaggedBy` and `flaggedAt` for chain of custody
- Suspicious activity detection (rapid changes, off-hours, bulk ops)

## 8. Performance Considerations

- **Async writes** via EventEmitter — audit never blocks the response
- **Pagination** on all list endpoints (default 50, max 500)
- **Composite indexes** on all filterable columns
- **JSONB** columns for flexible before/after snapshots
- **Batch logging** for bulk operations via `logBatch()`
- **Data retention** — logs never auto-deleted; archive strategy external

## 9. Compliance Support

### Hospital Audits

- Full audit trail of who accessed/modified patient-related data
- Chain of custody for schedule approvals and changes
- Device incident audit trails for quality/safety reviews

### Quality Inspections

- Exportable reports (CSV, HTML/PDF)
- Timeline view for reconstructing sequences of events
- Suspicious activity detection and flagging

### Internal Investigations

- User-specific audit trails
- Entity-specific change history
- Date-range filtering for forensic analysis
- Flag/unflag mechanism for marking suspicious entries

## 10. Testing Strategy

| Test Type   | Scope                                            |
| ----------- | ------------------------------------------------ |
| Unit        | AuditService.log(), computeChanges(), formatting |
| Integration | Prisma create/query with filters                 |
| E2E         | Full HTTP cycle with auth, permissions           |
| Security    | Unauthorized access to audit endpoints           |
| Performance | Query performance with large datasets            |
