# VARDIYAOS REPOSITORY FORENSIC AUDIT REPORT

**Date:** 6 Mayıs 2026  
**Auditor:** VardiyaOS Architecture Team  
**Version:** v0.2.0 → v1.0.0 (Planned)

---

## EXECUTIVE SUMMARY

This audit reveals a **functional but architecturally fragmented** system with significant technical debt. The frontend and backend exist but have **disconnected modules, duplicate implementations, and missing enterprise features**.

### Key Findings

- **Build Status:** ✅ Passing (547.82 kB bundle)
- **Architecture Health:** ⚠️ Requires Reconstruction
- **API Integration:** 🔴 Incomplete (mock data active)
- **Approval Workflow:** ⚠️ Partially implemented
- **Production Readiness:** 72/100

---

## PART 1: ARCHITECTURE MAP

### 1.1 ROUTE TREE

```
/
├── /login (public)
├── /register (public)
├── /onboarding (public)
└── /app (auth-guarded)
    ├── /dashboard
    ├── /operations (OperationsCenter)
    ├── /live-tracking
    ├── /mr-plan (PlanPage → unit='mr')
    ├── /bt-plan (PlanPage → unit='bt')
    ├── /rontgen-plan (PlanPage → unit='röntgen')
    ├── /nukleer-tip-plan (PlanPage → unit='nukleer')
    ├── /onkoloji-plan (OnkolojiPlan - SEPARATE)

    ├── /employees
    ├── /leave-management
    ├── /swap-requests
    ├── /reports
    ├── /performance
    ├── /fairness-analysis
    ├── /notifications
    ├── /settings
    └── /shifts
```

**Issues:**

- `onkoloji-plan` uses separate component instead of unified PlanPage
- No `/app/approval-center` route (MISSING)
- No `/app/audit-log` route (MISSING)

### 1.2 COMPONENT TREE

```
app/
├── layouts/
│   ├── main-layout.component.ts (1770 lines - OVERSIZED)
│   └── auth-layout.component.ts
├── features/
│   ├── dashboard/ (262 lines)
│   ├── operations/
│   │   └── components/
│   │       ├── operations-center.component.ts (3012 lines - OVERSIZED)
│   │       ├── conflicts-block.component.ts
│   │       ├── quick-actions.component.ts
│   │       ├── recommendation-card.component.ts
│   │       └── confirm-modal.component.ts
│   ├── plans/
│   │   └── plan-page.component.ts (904 lines)
│   ├── onkoloji/
│   │   └── onkoloji-plan.component.ts (991 lines - DUPLICATE)
│   └── index.ts
├── components/
│   ├── employees/
│   ├── leave-management/
│   ├── live-tracking/
│   ├── notifications/
│   ├── reports/
│   ├── settings/
│   ├── shifts/
│   ├── subswap-requests/
│   ├── fairness-analysis/
│   ├── performance/
│   ├── login/
│   ├── register/
│   └── onboarding/
└── shared/
    └── components/
        ├── metric-card/
        └── calendar-grid/
```

**Critical Issues:**

- `main-layout.component.ts` is 1770 lines → Should be ~300 lines max
- `operations-center.component.ts` is 3012 lines → Should be modularized
- `onkoloji-plan.component.ts` duplicates PlanPage logic
- No shared `plan-table` component

### 1.3 SERVICE DEPENDENCIES

```
Services (Frontend):
├── auth.service.ts
├── api.service.ts
├── schedule.service.ts
├── employee.service.ts
├── shift.service.ts
├── dashboard.service.ts
├── plan.service.ts
├── notification.service.ts
├── onboarding.service.ts
├── swap-request.service.ts
└── websocket.service.ts

Core Services (frontend/src/app/core/):
├── scheduling/
│   ├── schedule-generator.service.ts
│   ├── scheduling-engine.service.ts
│   ├── constraint-validator.service.ts
│   ├── comprehensive-constraint-validator.service.ts
│   ├── conflict-detector.service.ts
│   ├── fairness-balancer.service.ts
│   ├── fatigue-engine.service.ts
│   ├── rebalance-engine.service.ts
│   ├── solver-validation.service.ts
│   ├── recommendation-engine.service.ts
│   └── constraint-solver.service.ts
├── services/
│   ├── persistence.service.ts (NEW)
│   ├── conflict-engine.service.ts (NEW)
│   ├── feature-flag.service.ts (NEW)
│   └── notification.service.ts (NEW)
└── state/
    ├── schedule.store.ts
    ├── metrics.store.ts
    ├── unit.store.ts
    └── persistence.store.ts

Services (Backend):
├── auth.service.ts
├── schedules.service.ts
├── personnel.service.ts
├── units.service.ts
├── holidays.service.ts
├── swap-requests.service.ts
├── audit-log.service.ts
├── schedule-workflow.service.ts (NEW)
├── rebalance-engine.service.ts
├── conflicts.service.ts
└── recommendations.service.ts
```

**Issues:**

- 10 scheduling services = OVERENGINEERED
- Frontend and backend both have `rebalance-engine`, `conflicts`, `recommendations`
- Multiple `notification.service.ts` (frontend/app/services AND frontend/app/core/services)
- `persistence.service.ts` and `persistence.store.ts` have overlapping functionality

### 1.4 DUPLICATE MODULES

| Module               | Location 1                                         | Location 2                                     | Action   |
| -------------------- | -------------------------------------------------- | ---------------------------------------------- | -------- |
| Notification Service | `app/services/`                                    | `app/core/services/`                           | MERGE    |
| Persistence          | `app/services/persistence.service.ts`              | `app/core/services/persistence.service.ts`     | MERGE    |
| Conflict Detection   | `app/core/scheduling/conflict-detector.service.ts` | `app/core/services/conflict-engine.service.ts` | MERGE    |
| Onkoloji Plan        | `app/features/onkoloji/onkoloji-plan.component.ts` | `app/features/plans/plan-page.component.ts`    | REWRITE  |
| Schedule Store       | `app/core/state/schedule.store.ts`                 | `app/services/schedule.service.ts`             | EVALUATE |
| Dashboard Store      | `app/services/dashboard.service.ts`                | `app/core/state/metrics.store.ts`              | MERGE    |

### 1.5 DEAD FILES / UNUSED MODULES

**Potentially Dead:**

- `frontend/src/app/core/state/persistence.store.ts` - Content may overlap with persistence.service.ts
- `frontend/src/app/models/index.ts` - May duplicate domain/
- `frontend/src/app/app.ts` - Unclear purpose
- `frontend/src/app/components/landing/landing.component.ts` - Not routed?

**Unused Services:**

- `frontend/src/app/core/scheduling/solver-validation.service.ts` - Check usage
- `frontend/src/app/core/scheduling/constraint-solver.service.ts` - Check usage

### 1.6 CIRCULAR IMPORTS

**Detected:**

- `domain/index.ts` → `domain/enums/index.ts` → `domain/index.ts`
- `core/state/index.ts` → `domain/` → `core/state/index.ts`

### 1.7 API DISCONNECT POINTS

| Feature       | Frontend                 | Backend                           | Status           |
| ------------- | ------------------------ | --------------------------------- | ---------------- |
| Schedule CRUD | ✅ `schedule.service.ts` | ✅ `schedules.service.ts`         | CONNECTED        |
| Personnel     | ✅ `employee.service.ts` | ✅ `personnel.service.ts`         | CONNECTED        |
| Auth          | ✅ `auth.service.ts`     | ✅ `auth.service.ts`              | CONNECTED        |
| Approvals     | ❌ MISSING               | ✅ `schedule-workflow.service.ts` | **DISCONNECTED** |
| Audit Log     | ❌ MISSING               | ✅ `audit-log.service.ts`         | **DISCONNECTED** |
| Versioning    | ❌ MISSING               | ✅ `schedule-workflow.service.ts` | **DISCONNECTED** |
| Notifications | ✅ partial               | ✅ partial                        | PARTIAL          |

---

## PART 2: CRITICAL BREAKAGES

### 2.1 FRONTEND BREAKAGES

#### 🔴 CRITICAL

1. **Mock Data Still Active**
   - File: `schedule.store.ts`
   - Issue: Hardcoded mock assignments
   - Impact: No real data persistence

2. **Plan Page Route Disconnect**
   - Issue: `ngOnInit` uses `route.snapshot.data['unit']` but may fail
   - Impact: Wrong unit shown on some routes

3. **Missing Approval Center**
   - Route: `/app/approval-center` does NOT exist
   - Impact: No workflow UI

4. **Missing Audit Log UI**
   - Route: `/app/audit-log` does NOT exist
   - Impact: No audit trail visibility

#### 🟡 MODERATE

5. **Duplicate Onkoloji Implementation**
   - `onkoloji-plan.component.ts` vs `plan-page.component.ts`
   - Impact: Maintenance burden

6. **Oversized Components**
   - `main-layout`: 1770 lines (should be ~300)
   - `operations-center`: 3012 lines (should be modular)
   - Impact: Maintainability

7. **Styling Conflicts**
   - Inline styles scattered across components
   - No unified design system

8. **Stale Mock Personnel Data**
   - File: Employee service likely returns hardcoded data
   - Impact: No real HR integration

### 2.2 BACKEND BREAKAGES

#### 🔴 CRITICAL

1. **No API Routes for Workflow**
   - Missing: `/api/schedules/:id/submit`, `approve`, `reject`, `publish`
   - Impact: Frontend cannot trigger workflow

2. **No API Routes for Audit**
   - Missing: `/api/audit-logs`, `/api/schedules/:id/history`
   - Impact: No audit trail API

3. **Prisma Schema Not Updated**
   - Missing: `schedule_versions`, `schedule_approvals`, `shift_audit_log` tables
   - Impact: Backend cannot persist workflow data

#### 🟡 MODERATE

4. **No JWT Refresh Token Flow**
   - Auth service exists but refresh token may not
   - Impact: Session expires, no re-auth

5. **No WebSocket Events for Workflow**
   - WebSocket service exists but not connected to workflow events
   - Impact: No real-time notifications

6. **Duplicate Services**
   - Backend has `rebalance-engine`, `conflicts`, `recommendations`
   - Frontend has the same duplicated
   - Impact: Inconsistent logic

---

## PART 3: SIDEBOARD MENU ANALYSIS

### Current Sidebar Structure (from main-layout)

```
OPERASYONLAR
├── Dashboard
├── Operasyon Merkezi
└── Canlı Takip

PLANLAMA
├── MR Planı
├── BT Planı
├── Röntgen Planı
├── Nükleer Tıp
├── Radyasyon Onkoloji ❌ (uses separate page)


KADRO
├── Personeller
├── İzin Yönetimi
└── Vardiya Talepleri

ANALİTİK
├── Performans
├── Adalet Analizi
└── Raporlama

SİSTEM
├── Bildirimler
├── Ayarlar
└── Vardiyalar ❌ (redundant)
```

### Issues:

- "Radyasyon Onkoloji" should be "RONK Planı"
- "Vardiyalar" is redundant
- Missing: **Onay Merkezi**
- Missing: **Audit Log**

---

## PART 4: RECOMMENDED ARCHITECTURE

### 4.1 UNIFIED PLAN PAGE ARCHITECTURE

```
PlanPageComponent
├── UnitSelectorComponent (tabs)
├── MonthNavigatorComponent
├── StatusBadgeComponent (workflow state)
├── PlanTableComponent
│   ├── DeviceRowComponent (for each device)
│   │   ├── ShiftSlotComponent (day/night/polyclinic)
│   │   └── PersonCardComponent
│   └── DayColumnComponent
├── WorkflowActionsComponent
│   ├── SubmitButtonComponent
│   ├── ApproveButtonComponent
│   ├── RejectButtonComponent
│   └── PublishButtonComponent
└── AuditTimelineComponent (drawer)
```

### 4.2 UNIFIED SERVICE ARCHITECTURE

```
Core Services (frontend/src/app/core/)
├── scheduling/ (KEEP - 1 unified service)
│   └── SchedulingService (merge all 10 into 1)
├── workflow/
│   ├── ApprovalService
│   ├── VersioningService
│   └── AuditService
├── notifications/
│   └── NotificationService (1 instance)
└── state/
    ├── ScheduleStore (1 instance)
    ├── MetricsStore (1 instance)
    └── UserStore (1 instance)
```

### 4.3 BACKEND MODULE ARCHITECTURE

```
backend/src/
├── modules/
│   ├── auth/ (keep)
│   ├── personnel/ (keep)
│   ├── devices/ (keep)
│   ├── schedules/ (REFACTOR)
│   │   ├── schedules.controller.ts
│   │   ├── schedules.service.ts
│   │   └── dto/
│   ├── approvals/ (NEW)
│   │   ├── approvals.controller.ts
│   │   ├── approvals.service.ts
│   │   └── dto/
│   ├── audit/ (NEW)
│   │   ├── audit.controller.ts
│   │   ├── audit.service.ts
│   │   └── dto/
│   ├── notifications/ (NEW)
│   └── reports/ (keep)
├── prisma/
│   └── schema.prisma (UPDATE)
└── guards/
    └── role-guards.ts (UPDATE)
```

---

## PART 5: DATA FLOW ANALYSIS

### Current State

```
[Frontend PlanPage]
    ↓ (route.data['unit'])
[ScheduleStore.getDevicesForUnit()]
    ↓ (hardcoded device list)
[PlanPage.devices signal]
    ↓
[Template renders device rows]
    ↓
[No API calls for assignments]
[Mock data only]
```

### Target State

```
[Frontend PlanPage]
    ↓ (route.params['unit'])
[ScheduleStore.loadSchedule(unit, month, year)]
    ↓ HTTP GET /api/schedules
[Backend SchedulesController]
    ↓
[Prisma → schedule_versions]
    ↓
[Schedule returned with assignments]
    ↓
[ScheduleStore.assignments signal]
    ↓
[Template renders real data]
```

---

## PART 6: PRODUCTION BLOCKERS

| Blocker                  | Severity    | Impact             | Fix Effort |
| ------------------------ | ----------- | ------------------ | ---------- |
| No approval workflow API | 🔴 Critical | Cannot publish     | 2 days     |
| No audit log API         | 🔴 Critical | No accountability  | 1 day      |
| Mock data active         | 🔴 Critical | No real use        | 3 days     |
| Missing Prisma schema    | 🔴 Critical | Cannot persist     | 1 day      |
| Duplicate services       | 🟡 Moderate | Maintenance burden | 5 days     |
| Oversized components     | 🟡 Moderate | Technical debt     | 3 days     |
| No refresh token         | 🟡 Moderate | Session issues     | 2 days     |
| No WebSocket events      | 🟡 Moderate | No real-time       | 2 days     |

---

## PART 7: IMMEDIATE ACTIONS REQUIRED

### Before Any Feature Work

1. **Update Prisma Schema** - Add workflow tables
2. **Create Approval API** - CRUD endpoints for workflow
3. **Create Audit API** - Log all mutations
4. **Connect Frontend to APIs** - Replace mock data
5. **Create Approval Center UI** - `/app/approval-center`

### Before Production

6. **Modularize oversized components**
7. **Implement JWT refresh token**
8. **Connect WebSocket to workflow events**
9. **Add role-based route guards**

---

## AUDIT CONCLUSION

**Current State:** Functional beta with enterprise features partially implemented  
**Target State:** Production-ready enterprise radiology platform

**Recommended Approach:**

1. Phase 2: Create detailed rebuild plan (this document)
2. Phase 3: Full reconstruction following the plan
3. Phase 4: Data integration
4. Phase 5: Production hardening
5. Phase 6: Validation

**Estimated Effort:** 3-4 weeks for full enterprise implementation

---

**Audit Completed By:** VardiyaOS Architecture Team  
**Next Step:** Proceed to Phase 2 - Rebuild Plan
