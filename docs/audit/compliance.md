# Compliance Documentation — Enterprise Audit Logging

## 1. Healthcare Compliance Coverage

### HIPAA (Health Insurance Portability and Accountability Act)

| Requirement                                   | Implementation                                                     |
| --------------------------------------------- | ------------------------------------------------------------------ |
| Access Controls (§164.312(a)(1))              | JWT auth + RBAC, audit access restricted to SYSTEM_ADMIN & AUDITOR |
| Audit Controls (§164.312(b))                  | Complete audit trail of all ePHI access/modification               |
| Integrity Controls (§164.312(c)(1))           | Immutable logs — no update/delete endpoints                        |
| Person or Entity Authentication (§164.312(d)) | Multi-factor auth with session tracking                            |
| Transmission Security (§164.312(e)(1))        | HTTPS enforced, CSRF protection                                    |

### JCI (Joint Commission International)

| Standard                      | Implementation                                     |
| ----------------------------- | -------------------------------------------------- |
| QPS.1 — Quality monitoring    | Suspicious activity detection & flagging           |
| QPS.3 — Data analysis         | Audit statistics, timeline, entity-level filtering |
| SQE.1 — Staff qualifications  | Training & certification audit trail               |
| SQE.8 — Competency assessment | Skill matrix changes logged                        |
| ASC.1 — Anesthesia/sedation   | Device incident audit trail                        |
| MCI.1 — Medical equipment     | Device create/update/incident logging              |

## 2. Data Retention & Integrity

### Log Immutability

- **No UPDATE endpoint** — audit logs cannot be modified after creation
- **No DELETE endpoint** — audit logs cannot be deleted
- Only `flag`/`unflag` operations permitted (marking for investigation)
- Flagged entries record `flaggedBy` (user ID) and `flaggedAt` (timestamp) for chain of custody

### Data Retention Policy

- Logs are written once and never auto-deleted
- Archive strategy: external cold storage after 12 months (future)
- Production database retains at least 90 days for operational review

## 3. Chain of Custody

Every audit entry captures:

```
┌─────────────────────────────────────┐
│ Request ID:  abc-123-def-456        │ ← Links to HTTP request
│ User ID:     user-42                │ ← Who performed action
│ User Name:   Ayşe Yılmaz            │ ← Full name
│ User Role:   head_technician         │ ← Role at time of action
│ Org ID:      org-1                  │ ← Organization scope
│ Hospital ID: hosp-3                 │ ← Hospital scope
│ Unit ID:     unit-12                │ ← Unit scope (if applicable)
│ IP Address:  192.168.1.100          │ ← Origin IP
│ User Agent:  Mozilla/5.0 ...        │ ← Client identification
│ Timestamp:   2026-06-18T14:30:00Z   │ ← When it happened
└─────────────────────────────────────┘
```

## 4. Audit Event Categories

| Category           | Events                                                      | Compliance Relevance         |
| ------------------ | ----------------------------------------------------------- | ---------------------------- |
| **Authentication** | LOGIN, LOGOUT, FAILED_LOGIN, PASSWORD_CHANGE, TOKEN_REFRESH | HIPAA §164.312(b)            |
| **Personnel**      | PERSONNEL_CREATED/UPDATED/DELETED                           | Staff credentialing          |
| **Schedules**      | SCHEDULE_CREATED/UPDATED/APPROVED/DELETED                   | Workflow accountability      |
| **Attendance**     | ATTENDANCE_CREATED/UPDATED                                  | Time & attendance compliance |
| **Training**       | TRAINING_CREATED/UPDATED/COMPLETED                          | JCI SQE.1, SQE.8             |
| **Devices**        | DEVICE_CREATED/UPDATED/INCIDENT                             | JCI MCI.1                    |
| **Permissions**    | ROLE_ASSIGNED/REMOVED, PERMISSION_GRANTED/REVOKED           | HIPAA §164.312(a)(1)         |
| **System**         | SETTINGS_CHANGED, CONFIGURATION_UPDATED                     | System integrity             |

## 5. Investigation Workflow

```
1. Suspicious Activity Detected
   ├── Automatic: Rapid changes, off-hours, bulk operations
   └── Manual: Flagged by auditor
        │
        ▼
2. Detailed Review
   ├── User audit trail (/audit/user/:userId)
   ├── Entity change history (/audit/entity/:type/:id)
   └── Timeline reconstruction (/audit/timeline)
        │
        ▼
3. Evidence Export
   ├── CSV export for spreadsheet analysis
   └── HTML report for presentation/submission
        │
        ▼
4. Remediation
   └── Flag reason documents investigation outcome
```

## 6. Access Control Matrix

| Role               | Read Logs | Export    | Flag/Unflag | Admin |
| ------------------ | --------- | --------- | ----------- | ----- |
| SYSTEM_ADMIN       | ✅        | ✅        | ✅          | ✅    |
| READ_ONLY_AUDITOR  | ✅        | ✅        | ❌          | ❌    |
| ORGANIZATION_ADMIN | ✅        | ✅        | ✅          | ❌    |
| HOSPITAL_DIRECTOR  | Own scope | Own scope | ❌          | ❌    |
| All others         | ❌        | ❌        | ❌          | ❌    |

## 7. Audit Log Schema (PostgreSQL)

```sql
-- Core audit table
CREATE TABLE audit_logs (
    id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    request_id      TEXT,
    user_id         TEXT NOT NULL REFERENCES users(id),
    user_name       TEXT,
    user_role       TEXT,
    organization_id TEXT,
    hospital_id     TEXT,
    unit_id         TEXT,
    action_type     TEXT NOT NULL,
    entity_type     TEXT NOT NULL,
    entity_id       TEXT,
    old_value       JSONB,
    new_value       JSONB,
    description     TEXT,
    ip_address      TEXT,
    user_agent      TEXT,
    status          TEXT NOT NULL DEFAULT 'SUCCESS',
    metadata        JSONB,
    flagged         BOOLEAN NOT NULL DEFAULT false,
    flag_reason     TEXT,
    flagged_at      TIMESTAMPTZ,
    flagged_by      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Performance indexes
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_action_type ON audit_logs(action_type);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_organization ON audit_logs(organization_id);
CREATE INDEX idx_audit_hospital ON audit_logs(hospital_id);
CREATE INDEX idx_audit_unit ON audit_logs(unit_id);
CREATE INDEX idx_audit_status ON audit_logs(status);
CREATE INDEX idx_audit_flagged ON audit_logs(flagged);
```

## 8. Audit Module Files

### Backend

| File                                                                   | Purpose                                 |
| ---------------------------------------------------------------------- | --------------------------------------- |
| `backend/prisma/schema.prisma`                                         | AuditLog model (lines 463-498)          |
| `backend/src/modules/audit-log/audit-log.module.ts`                    | Module definition (Global)              |
| `backend/src/modules/audit-log/audit-log.service.ts`                   | Core audit service                      |
| `backend/src/modules/audit-log/audit-log.controller.ts`                | REST API endpoints                      |
| `backend/src/modules/audit-log/audit.constants.ts`                     | Event enums, labels                     |
| `backend/src/modules/audit-log/audit.decorator.ts`                     | @Audit() decorator                      |
| `backend/src/modules/audit-log/audit.interceptor.ts`                   | Auto-audit on decorated methods         |
| `backend/src/modules/audit-log/audit.guard.ts`                         | AuditAccessGuard (SYSTEM_ADMIN/AUDITOR) |
| `backend/src/modules/audit-log/audit.dto.ts`                           | Filter DTOs with validation             |
| `backend/src/modules/audit-log/__tests__/audit-log.service.spec.ts`    | Service unit tests                      |
| `backend/prisma/migrations/20260618000001_v5_enterprise_audit_system/` | Migration SQL                           |

### Frontend

| File                                                        | Purpose               |
| ----------------------------------------------------------- | --------------------- |
| `frontend/src/app/domain/models/audit-log.ts`               | TypeScript interfaces |
| `frontend/src/app/services/audit.service.ts`                | Angular audit service |
| `frontend/src/app/features/audit/audit-center.component.ts` | Audit Center UI       |
