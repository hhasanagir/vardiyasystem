# Database Health Report

> Generated: 2026-06-26 | PostgreSQL | Prisma ORM

## Schema Overview

| Metric     | Value                                                        |
| ---------- | ------------------------------------------------------------ |
| Models     | 36                                                           |
| Enums      | 14                                                           |
| Migrations | 6                                                            |
| Indexes    | Extensive (all models have strategic FK/status/date indexes) |

## Migration History

| #   | Migration                           | Date       | Purpose                  |
| --- | ----------------------------------- | ---------- | ------------------------ |
| 1   | `v1_initial_baseline`               | 2026-05-19 | Initial schema           |
| 2   | `v2_enterprise_hardening`           | 2026-05-22 | Enterprise hardening     |
| 3   | `add_auth_attempt`                  | 2026-05-23 | Auth attempt tracking    |
| 4   | `add_auth_session`                  | 2026-05-24 | Session management       |
| 5   | `v5_enterprise_audit_system`        | 2026-06-18 | Enterprise audit         |
| 6   | `v6_enterprise_notification_system` | 2026-06-19 | Enterprise notifications |

## Model Inventory (36)

### Core (5)

`Organization`, `Unit`, `User`, `Personnel`, `Device`

### RBAC (4)

`Role`, `Permission`, `RolePermission`, `UserRoleAssignment`

### Scheduling (5)

`Shifts`, `Schedule`, `ScheduleApproval`, `ScheduleSnapshot`, `Assignment`

### HR/Training (4)

`Skill`, `PersonnelSkill`, `Training`, `PersonnelTraining`

### Attendance (2)

`AttendanceRecord`, `ShiftTask`

### Notifications (8)

`Notification`, `NotificationRecipient`, `NotificationDelivery`, `NotificationPreference`, `NotificationTemplate`, `PushToken`, `WebPushSubscription`, `PreShiftChecklist`

### Operations (4)

`DeviceIncident`, `DeviceStatusLog`, `SwapRequest`, `Holiday`

### Audit (1)

`AuditLog`

### Other (3)

`HandoverNote`, `Conflict`, `Recommendation`

### Auth (4)

`InviteCode`, `TokenBlacklist`, `AuthAttempt`, `AuthSession`

## Performance Observations

- **AuditLog** has 8 indexes — good for query-heavy workload
- **Assignment** has 5 indexes including composite unique constraints — prevents duplicate assignments
- **NotificationDelivery** has 4 indexes — supports high-volume notification tracking
- All models use `@@map("snake_case_name")` for consistent DB naming

## Missing Items

- No full-text search indexes on `AuditLog.description` or `AuditLog.changes` (JSON fields)
- No composite indexes on commonly filtered `(userId, createdAt)` combinations for `AuditLog`
- `Personnel.email` field lacks DB-level unique constraint (only application-level check)
