# Prisma / Database Audit

**Date:** 2026-08-20

## Schema Summary

| Metric        | Value   |
| ------------- | ------- |
| Total Models  | 95      |
| Total Enums   | 32      |
| Schema Lines  | 2,932   |
| Migrations    | 20      |
| Prisma Client | v5.22.0 |
| Generation    | PASS    |

## Model Categories

### Master Data (Reference — Rarely Changes)

- Organization, Hospital, Unit (16 types), Department, Directorate, Area, Room
- Personnel, PersonnelGroup, Skill, PersonnelSkill
- Device, Shifts, PersonShiftTemplate
- Holiday, Training, PersonnelTraining

### Operational Data (Changes Frequently)

- Schedule, Assignment, AssignmentSlot
- DutyRoster, ShiftDateOverride
- ScheduleApproval, ScheduleSnapshot
- SwapRequest, HandoverNote

### Compliance/GDPR

- Consent, ProcessingActivity, DataSubject
- DataRetention, DataClassification
- BreachNotification, EmergencyAccess

### Infrastructure

- User, AuthSession, RefreshToken, TokenBlacklist
- AuditLog, PushSubscription, PushToken
- Notification, NotificationPreference

### Enterprise

- Asset, Consumable, Warehouse, Inventory
- ProcurementRequest, ProcurementOrder
- Contract, Supplier, QualityRecord
- BiomedicalDevice, Calibration, Maintenance

## Key Enums

| Enum           | Values                                                                    |
| -------------- | ------------------------------------------------------------------------- |
| ShiftType      | day, evening, night, morning, off, leave, sick, training, backup          |
| ScheduleStatus | draft, under_review, approved, published, archived, rejected              |
| UnitType       | mr, bt, rontgen, nukleer, onkoloji, ultrason, anjiyo, mamografi, + 8 more |
| AssignmentKind | device, person                                                            |
| DutyRosterRole | sorumlu_tekniker, tekniker, yardimci_tekniker, supervisor, radyolog       |

## Prisma Middleware Stack

| Middleware         | Purpose                            |
| ------------------ | ---------------------------------- |
| Tenant Isolation   | Automatic organizationId filtering |
| Soft Delete        | `deletedAt` field management       |
| Optimistic Locking | Version field comparison           |

## Assessment

**Status: STABLE**

- Schema is comprehensive and well-organized
- 20 migrations show healthy evolution
- Prisma Client generates cleanly
- No destructive migration changes needed
- Middleware stack provides good cross-cutting concerns

### Gaps

- `AssignmentSlot` model exists but is unused in scheduling services
- No database-level constraints (unique, check) beyond Prisma relations
- No indexing strategy documented
- `Personnel.offDays` stored as `Int[]` — cannot express date-specific unavailability
