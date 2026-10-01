# Database Health Report

## Environment

- **Provider:** PostgreSQL (Prisma ORM)
- **Migrations Applied:** 4 (all sequential, no conflicts)
- **Schema Version:** `4_init` (latest)
- **Models:** 37 (User, Personnel, Device, Schedule, ShiftAssignment, etc.)
- **Enums:** 9 (ShiftType, ShiftStatus, ApprovalStatus, etc.)

## Foreign Key & Cascade Status

- All 37 models have proper FK references
- CASCADE deletes configured on ownership relationships
- ON DELETE RESTRICT on critical business data (schedules, assignments)
- Protected against orphaned records

## Soft Deletion (`deletedAt`)

- Applied to: User, Personnel, Device, Unit, Hospital
- Queries automatically filter `deletedAt: null`
- No hard deletes used in application code

## Nullable Field Audit

Fields identified as nullable that require null guards:

| Model              | Field             | Type      | Risk                | Status     |
| ------------------ | ----------------- | --------- | ------------------- | ---------- |
| Schedule           | `startTime`       | String?   | HIGH → caused CRASH | ✅ guarded |
| Schedule           | `endTime`         | String?   | HIGH → caused CRASH | ✅ guarded |
| Schedule           | `offDays`         | Json?     | HIGH → caused CRASH | ✅ guarded |
| Personnel          | `skills`          | Json?     | HIGH → caused CRASH | ✅ guarded |
| Device             | `requiredSkills`  | Json?     | HIGH → caused CRASH | ✅ guarded |
| ScheduleAssignment | `personnelSkills` | Json?     | HIGH → guarded      | ✅ guarded |
| PersonnelTraining  | `expiryDate`      | DateTime? | HIGH → caused CRASH | ✅ guarded |

## Indexes

- `User.email` — unique
- `Schedule.personnelId`, `Schedule.date` — composite performance
- `ShiftAssignment.scheduleId`, `ShiftAssignment.personnelId`
- `Personnel.hospitalId`, `Personnel.unitId`
- `Device.unitId`
- All primary keys auto-indexed

## Known Issues

### Artifact: `dev.db` (SQLite)

A stale `backend/dev.db` SQLite database file (142KB) exists from development. Not connected to any config — `DATABASE_URL` points to PostgreSQL. Safe to delete.

## Seed Data

Seeds create:

- 1 Organization (Acme Hospital Group)
- 1 Hospital (Acme Dev Hospital)
- 3 Units (Acil, Cerrahi, Dahiliye)
- 6 Devices (2 per unit: defibrillator, ventilator)
- ~10 Personnel with skills
- 12 months of schedules/assignments
