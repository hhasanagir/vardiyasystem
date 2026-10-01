# VARDIYAOS CLEAN REBUILD PLAN

**Based on:** AUDIT_REPORT.md  
**Date:** 6 Mayıs 2026  
**Target:** Production-ready enterprise platform

---

## EXECUTIVE SUMMARY

This document outlines a complete system reconstruction plan. We will:

1. **DELETE** duplicate/obsolete modules
2. **MERGE** overlapping implementations
3. **REWRITE** broken/undersized components
4. **PRESERVE** working enterprise features

**Estimated Timeline:** 3-4 weeks

---

## SECTION 1: DELETE - Files/Modules to Remove

### 1.1 Duplicate Services (Frontend)

| File to Delete                                                      | Reason                                                   | Keep Instead                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| `app/core/scheduling/conflict-detector.service.ts`                  | Duplicated by conflict-engine.service.ts                 | `app/core/services/conflict-engine.service.ts` |
| `app/core/scheduling/solver-validation.service.ts`                  | Unused/duplicated                                        | Remove if not imported                         |
| `app/core/scheduling/constraint-solver.service.ts`                  | Unused/duplicated                                        | Remove if not imported                         |
| `app/core/scheduling/recommendation-engine.service.ts`              | Duplicated by recommendations.service.ts                 | Merge                                          |
| `app/core/scheduling/fatigue-engine.service.ts`                     | Can be simplified                                        | Merge into constraint validator                |
| `app/core/scheduling/comprehensive-constraint-validator.service.ts` | Overlap with constraint-validator.service.ts             | Keep one                                       |
| `app/core/state/persistence.store.ts`                               | Duplicate of persistence.service.ts                      | Remove                                         |
| `app/services/notification.service.ts`                              | Duplicate of `app/core/services/notification.service.ts` | `app/core/services/notification.service.ts`    |
| `app/models/index.ts`                                               | Duplicates domain/                                       | Remove                                         |

### 1.2 Unused Components

| File to Delete                                | Reason                     |
| --------------------------------------------- | -------------------------- |
| `app/components/landing/landing.component.ts` | Not routed, appears unused |
| `app/app.ts`                                  | Unclear purpose, not used  |
| `app/environments.prod.ts` (duplicate)        | Already in environments/   |

### 1.3 Duplicate Plan Implementation

| File to Delete                                     | Reason                       | Keep Instead                                |
| -------------------------------------------------- | ---------------------------- | ------------------------------------------- |
| `app/features/onkoloji/onkoloji-plan.component.ts` | Duplicate of plan-page logic | `app/features/plans/plan-page.component.ts` |

### 1.4 Stale Mock Files

| File to Delete                                                                  | Reason |
| ------------------------------------------------------------------------------- | ------ |
| Any file with `[seed]` or `[mock]` in comments that isn't a proper mock service |
| Hardcoded arrays in stores that should come from API                            |

---

## SECTION 2: MERGE - Combine Implementations

### 2.1 Scheduling Services (10 → 1)

**Current:**

```
app/core/scheduling/
├── schedule-generator.service.ts
├── scheduling-engine.service.ts
├── constraint-validator.service.ts
├── comprehensive-constraint-validator.service.ts
├── conflict-detector.service.ts
├── fairness-balancer.service.ts
├── fatigue-engine.service.ts
├── rebalance-engine.service.ts
├── solver-validation.service.ts
├── recommendation-engine.service.ts
└── constraint-solver.service.ts
```

**Merge Into:**

```
app/core/scheduling/
└── scheduling.service.ts (NEW UNIFIED SERVICE)
```

**Rationale:** These services are tightly coupled and share data. Separating them causes:

- Inconsistent validation logic
- Circular dependencies
- Difficult maintenance

### 2.2 Notification Services (2 → 1)

**Current:**

```
app/services/notification.service.ts
app/core/services/notification.service.ts
```

**Merge Into:** `app/core/services/notification.service.ts`
**Action:** Delete `app/services/notification.service.ts`, update imports

### 2.3 Backend Services (2 → 1 each)

**Merge:**

- `backend/src/services/rebalance-engine.service.ts` → `backend/src/modules/schedules/schedules.service.ts`
- `backend/src/services/conflicts.service.ts` → `backend/src/modules/schedules/schedules.service.ts`
- `backend/src/services/recommendations.service.ts` → `backend/src/modules/schedules/schedules.service.ts`

### 2.4 State Management

**Merge Schedule Stores:**

```
app/services/schedule.service.ts + app/core/state/schedule.store.ts
```

**Keep:** `app/core/state/schedule.store.ts` (Signal-based, modern)
**Delete:** `app/services/schedule.service.ts`

**Merge Dashboard Stores:**

```
app/services/dashboard.service.ts + app/core/state/metrics.store.ts
```

**Keep:** `app/core/state/metrics.store.ts`
**Delete:** `app/services/dashboard.service.ts`

---

## SECTION 3: REWRITE - Full Reconstruction Required

### 3.1 Main Layout Component

**Problem:** 1770 lines, bloated

**Solution:** Modularize into:

```
layouts/main-layout/
├── main-layout.component.ts (300 lines - shell only)
├── sidebar/
│   ├── sidebar.component.ts
│   ├── sidebar-nav-section.component.ts
│   └── sidebar-nav-item.component.ts
├── header/
│   ├── header.component.ts
│   ├── header-clock.component.ts
│   └── header-user-menu.component.ts
├── notifications/
│   └── notification-panel.component.ts
└── main-layout.routes.ts (nav config)
```

**Files to Rewrite:**

- `app/layouts/main-layout/main-layout.component.ts` → Split into modules
- Create `app/layouts/main-layout/nav-config.ts` (navigation structure)

### 3.2 Operations Center Component

**Problem:** 3012 lines, monolithic

**Solution:** Modularize into:

```
features/operations/
├── operations-center.component.ts (400 lines - container)
├── components/
│   ├── unit-selector.component.ts
│   ├── live-metrics.component.ts
│   ├── schedule-table.component.ts
│   ├── conflicts-panel.component.ts
│   ├── recommendations-panel.component.ts
│   ├── quick-actions-panel.component.ts
│   └── confirmation-modal.component.ts
└── services/
    └── operations.service.ts (if needed)
```

### 3.3 Plan Page - Unified Component

**Problem:**

- `onkoloji-plan.component.ts` duplicates `plan-page.component.ts`
- Missing workflow UI integration
- Mock data still active

**Solution:** Create unified plan architecture:

```
features/plans/
├── plan-page.component.ts (CLEAN unified - 400 lines)
├── components/
│   ├── plan-header.component.ts (unit selector, month nav, status badge)
│   ├── plan-table.component.ts (virtualized table)
│   ├── device-row.component.ts (single device with shifts)
│   ├── shift-cell.component.ts (day/night/session slot)
│   ├── person-card.component.ts (personnel display)
│   ├── workflow-actions.component.ts (submit/approve/reject buttons)
│   └── audit-timeline.component.ts (history drawer)
└── services/
    └── plan.service.ts (API integration)
```

**Key Features:**

- Single component handles MR/BT/Röntgen/Nükleer/RONK
- Workflow status badge (DRAFT/UNDER_REVIEW/APPROVED/PUBLISHED)
- Context-sensitive action buttons
- Audit timeline drawer

### 3.4 Dashboard Component

**Problem:** Basic, no KPIs, no live data

**Solution:** Create enterprise dashboard:

```
features/dashboard/
├── dashboard.component.ts (600 lines)
├── components/
│   ├── kpi-grid.component.ts (live metrics)
│   ├── unit-status-cards.component.ts
│   ├── alerts-panel.component.ts
│   ├── today-operations.component.ts
│   ├── quick-actions.component.ts
│   └── recent-activity.component.ts
└── dashboard.service.ts (real data)
```

### 3.5 Backend: Approval Workflow Module

**Missing Completely** - Need full implementation:

```
backend/src/modules/approvals/
├── approvals.controller.ts (API routes)
├── approvals.service.ts (business logic)
├── dto/
│   ├── submit-for-review.dto.ts
│   ├── approve.dto.ts
│   ├── reject.dto.ts
│   └── publish.dto.ts
└── approvals.module.ts
```

### 3.6 Backend: Audit Log Module

**Missing Completely:**

```
backend/src/modules/audit/
├── audit.controller.ts
├── audit.service.ts
├── dto/
│   └── query-audit.dto.ts
└── audit.module.ts
```

### 3.7 Prisma Schema Update

**Missing Tables:**

```prisma
model ScheduleVersion {
  id          String   @id @default(uuid())
  scheduleId  String
  version     Int
  snapshot    Json
  createdBy   String
  createdAt   DateTime @default(now())
  comment     String?
  changeReason String?

  @@unique([scheduleId, version])
  @@index([scheduleId])
}

model ScheduleApproval {
  id          String   @id @default(uuid())
  scheduleId  String
  status      String   // UNDER_REVIEW, APPROVED, REJECTED, PUBLISHED

  submittedBy String?
  submittedAt DateTime?
  submittedComment String?

  reviewedBy  String?
  reviewedAt  DateTime?

  approvedBy  String?
  approvedAt  DateTime?

  rejectedBy  String?
  rejectedAt  DateTime?
  rejectionReason String?

  publishedBy String?
  publishedAt DateTime?

  @@unique([scheduleId])
}

model ShiftAuditLog {
  id          String   @id @default(uuid())
  scheduleId  String
  shiftId     String?
  action      String   // CREATE, UPDATE, DELETE, ASSIGN, SUBMIT, APPROVE, etc.
  oldValue    Json?
  newValue    Json?
  changedBy   String
  userRole    String
  reason      String?
  ipAddress   String?
  timestamp   DateTime @default(now())

  @@index([scheduleId])
  @@index([changedBy])
  @@index([timestamp])
}
```

---

## SECTION 4: PRESERVE - Stable Modules to Keep

### 4.1 Frontend (Working)

| Module            | Location                             | Reason                 |
| ----------------- | ------------------------------------ | ---------------------- |
| Auth service      | `app/services/auth.service.ts`       | Works with backend     |
| API service       | `app/services/api.service.ts`        | Base HTTP client       |
| WebSocket service | `app/services/websocket.service.ts`  | Real-time foundation   |
| Auth guards       | `app/guards/`                        | Route protection works |
| Login/Register    | `app/components/login/`, `register/` | Working auth flow      |
| Onboarding        | `app/components/onboarding/`         | Working setup flow     |
| Employee list     | `app/components/employees/`          | Basic CRUD works       |
| Leave management  | `app/components/leave-management/`   | Basic functionality    |

### 4.2 Backend (Working)

| Module                    | Location                                            | Reason              |
| ------------------------- | --------------------------------------------------- | ------------------- |
| Auth module               | `backend/src/modules/auth/`                         | JWT works           |
| Prisma service            | `backend/src/prisma.service.ts`                     | DB connection works |
| Personnel module          | `backend/src/modules/personnel/`                    | CRUD works          |
| Units module              | `backend/src/modules/units/`                        | Works               |
| Holidays module           | `backend/src/modules/holidays/`                     | Works               |
| Swap requests module      | `backend/src/modules/swap-requests/`                | Works               |
| Schedule workflow service | `backend/src/services/schedule-workflow.service.ts` | Logic ready         |

### 4.3 Core Logic (Preserve)

| Module                | Location                                              | Reason                   |
| --------------------- | ----------------------------------------------------- | ------------------------ |
| Scheduling solver     | `app/core/scheduling/schedule-generator.service.ts`   | Complex algorithm, works |
| Constraint validation | `app/core/scheduling/constraint-validator.service.ts` | Validates correctly      |
| Shift time configs    | `app/domain/rules/`                                   | Correct business rules   |
| Holiday calendar      | `app/domain/rules/index.ts`                           | 2026 holidays defined    |
| Unit configurations   | `app/domain/rules/index.ts`                           | Correct device configs   |

---

## SECTION 5: ROUTE RECONSTRUCTION

### 5.1 New Route Structure

```typescript
export const routes: Routes = [
  // Auth (public)
  { path: "login", component: LoginComponent },
  { path: "register", component: RegisterComponent },
  { path: "onboarding", component: OnboardingComponent },

  // App Shell (auth-guarded)
  {
    path: "app",
    loadComponent: () => MainLayoutComponent,
    children: [
      // Dashboard (default)
      { path: "", redirectTo: "dashboard" },
      { path: "dashboard", component: DashboardComponent },

      // Operations
      { path: "operations", component: OperationsCenterComponent },
      { path: "live-tracking", component: LiveTrackingComponent },

      // Planning (UNIFIED)
      { path: ":unit-plan", component: PlanPageComponent }, // mr, bt, rontgen, nukleer, onkoloji

      // Kadro
      { path: "employees", component: EmployeesComponent },
      { path: "leave-management", component: LeaveManagementComponent },
      { path: "swap-requests", component: SwapRequestsComponent },

      // Analytics
      { path: "performance", component: PerformanceComponent },
      { path: "fairness-analysis", component: FairnessAnalysisComponent },
      { path: "reports", component: ReportsComponent },

      // System (NEW)
      { path: "approval-center", component: ApprovalCenterComponent }, // NEW
      { path: "audit-log", component: AuditLogComponent }, // NEW
      { path: "settings", component: SettingsComponent },
    ],
  },
];
```

### 5.2 Route Changes Summary

| Action  | Route                                       | Component                 |
| ------- | ------------------------------------------- | ------------------------- |
| KEEP    | `/app/dashboard`                            | DashboardComponent        |
| KEEP    | `/app/operations`                           | OperationsCenterComponent |
| REWRITE | `/app/mr-plan` → `/app/:unit-plan`          | PlanPageComponent         |
| REWRITE | `/app/bt-plan` → `/app/:unit-plan`          | PlanPageComponent         |
| REWRITE | `/app/rontgen-plan` → `/app/:unit-plan`     | PlanPageComponent         |
| REWRITE | `/app/nukleer-tip-plan` → `/app/:unit-plan` | PlanPageComponent         |
| REWRITE | `/app/onkoloji-plan` → `/app/:unit-plan`    | PlanPageComponent         |

| **NEW** | `/app/approval-center` | ApprovalCenterComponent |
| **NEW** | `/app/audit-log` | AuditLogComponent |

---

## SECTION 6: SIDEBAR RECONSTRUCTION

### 6.1 New Sidebar Structure

```typescript
interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_CONFIG: NavSection[] = [
  {
    label: "OPERASYON",
    items: [
      {
        path: "/app/dashboard",
        label: "Kontrol Paneli",
        icon: "dashboard",
        minRole: "staff",
      },
      {
        path: "/app/operations",
        label: "Operasyon Merkezi",
        icon: "operations",
        minRole: "supervisor",
      },
      {
        path: "/app/live-tracking",
        label: "Canlı Takip",
        icon: "live",
        minRole: "supervisor",
      },
    ],
  },
  {
    label: "PLANLAMA",
    items: [
      { path: "/app/mr-plan", label: "MR Planı", icon: "mr", unit: "mr" },
      { path: "/app/bt-plan", label: "BT Planı", icon: "bt", unit: "bt" },
      {
        path: "/app/rontgen-plan",
        label: "Röntgen Planı",
        icon: "rontgen",
        unit: "röntgen",
      },
      {
        path: "/app/nukleer-tip-plan",
        label: "Nükleer Tıp Planı",
        icon: "nukleer",
        unit: "nukleer",
      },
      {
        path: "/app/onkoloji-plan",
        label: "RONK Planı",
        icon: "onkoloji",
        unit: "onkoloji",
      },
    ],
  },
  {
    label: "KADRO",
    items: [
      {
        path: "/app/employees",
        label: "Personeller",
        icon: "people",
        minRole: "head_technician",
      },
      {
        path: "/app/leave-management",
        label: "İzin Yönetimi",
        icon: "calendar",
        minRole: "supervisor",
      },
      {
        path: "/app/swap-requests",
        label: "Vardiya Talepleri",
        icon: "swap",
        minRole: "staff",
      },
    ],
  },
  {
    label: "ANALİTİK",
    items: [
      {
        path: "/app/performance",
        label: "Performans",
        icon: "chart",
        minRole: "supervisor",
      },
      {
        path: "/app/fairness-analysis",
        label: "Adalet Analizi",
        icon: "balance",
        minRole: "supervisor",
      },
      {
        path: "/app/reports",
        label: "Raporlama",
        icon: "report",
        minRole: "head_technician",
      },
    ],
  },
  {
    label: "SİSTEM",
    items: [
      {
        path: "/app/approval-center",
        label: "Onay Merkezi",
        icon: "approve",
        minRole: "head_technician",
        badge: pendingApprovals,
      },
      {
        path: "/app/audit-log",
        label: "Audit Log",
        icon: "history",
        minRole: "admin",
      },
      {
        path: "/app/settings",
        label: "Ayarlar",
        icon: "settings",
        minRole: "staff",
      },
    ],
  },
];
```

---

## SECTION 7: API ENDPOINT RECONSTRUCTION

### 7.1 New API Routes Required

```typescript
// Schedules
POST   /api/schedules                    // Create draft
GET    /api/schedules                   // List schedules
GET    /api/schedules/:id               // Get schedule
PUT    /api/schedules/:id               // Update (with reason)
DELETE /api/schedules/:id               // Soft delete

// Workflow
POST   /api/schedules/:id/submit       // Submit for review
POST   /api/schedules/:id/approve       // Approve
POST   /api/schedules/:id/reject        // Reject (reason required)
POST   /api/schedules/:id/publish       // Publish
POST   /api/schedules/:id/archive       // Archive
POST   /api/schedules/:id/revision      // Create revision

// Versioning
GET    /api/schedules/:id/versions     // Get version history
POST   /api/schedules/:id/rollback     // Rollback to version

// Audit
GET    /api/audit-logs                  // Query audit logs
GET    /api/audit-logs/:scheduleId      // Logs for schedule
GET    /api/schedules/:id/audit-timeline // Formatted timeline

// Approvals
GET    /api/approvals/pending          // Pending approvals
GET    /api/approvals/rejected          // Rejected schedules
GET    /api/approvals/published         // Published schedules
```

### 7.2 Response Formats

```typescript
// Schedule Response
interface ScheduleResponse {
  id: string;
  unit: UnitType;
  month: number;
  year: number;
  status: ScheduleStatus;
  version: number;
  assignments: Assignment[];
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  workflow: {
    submittedBy?: string;
    approvedBy?: string;
    publishedBy?: string;
    rejectionReason?: string;
  };
}

// Audit Timeline Response
interface AuditTimelineEntry {
  id: string;
  timestamp: Date;
  userId: string;
  userName: string;
  userRole: string;
  action: string;
  description: string;
  reason?: string;
  changes?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}
```

---

## SECTION 8: IMPLEMENTATION PHASES

### Phase 3A: Frontend Core (Week 1)

**Days 1-2: Layout Reconstruction**

- [ ] Create `nav-config.ts`
- [ ] Extract sidebar component
- [ ] Extract header component
- [ ] Update main-layout imports

**Days 3-4: Unified Plan Page**

- [ ] Create plan-page with workflow integration
- [ ] Add status badge component
- [ ] Add workflow actions component
- [ ] Add audit timeline drawer

**Days 5-7: Dashboard Enhancement**

- [ ] Create KPI grid
- [ ] Add live unit status cards
- [ ] Add alerts panel
- [ ] Connect to real API

### Phase 3B: Backend Core (Week 2)

**Days 1-2: Prisma Schema**

- [ ] Add workflow tables
- [ ] Run migrations
- [ ] Update schema types

**Days 3-4: Approval API**

- [ ] Create approvals controller
- [ ] Create approvals service
- [ ] Add DTOs
- [ ] Add guards

**Days 5-7: Audit API**

- [ ] Create audit controller
- [ ] Create audit service
- [ ] Add query filters
- [ ] Timeline formatting

### Phase 4: Data Integration (Week 3)

**Days 1-2: API Connections**

- [ ] Update plan page to use API
- [ ] Remove mock data from stores
- [ ] Add loading/error states

**Days 3-4: WebSocket Events**

- [ ] Connect workflow events to WS
- [ ] Add real-time notifications
- [ ] Test reconnect logic

**Days 5-7: Frontend Integration**

- [ ] Connect approval center
- [ ] Connect audit log UI
- [ ] Add role-based visibility

### Phase 5: Production Hardening (Week 4)

**Days 1-2: Security**

- [ ] Add role guards to all routes
- [ ] Implement refresh token
- [ ] Add API interceptors

**Days 3-4: Error Handling**

- [ ] Add error boundaries
- [ ] Add retry logic
- [ ] Add loading states

**Days 5-7: Testing & Polish**

- [ ] Run all builds
- [ ] Test all routes
- [ ] Visual consistency check
- [ ] Responsive testing

---

## SECTION 9: VERIFICATION CHECKLIST

### Build Verification

- [ ] `npm run build` passes
- [ ] `npm run build:backend` passes (if exists)
- [ ] No TypeScript errors
- [ ] Bundle size < 600kB

### Route Verification

- [ ] All routes render correctly
- [ ] Auth guards work
- [ ] Role guards work
- [ ] No broken links

### Feature Verification

- [ ] Plan page loads real data
- [ ] Workflow transitions work
- [ ] Audit logs record
- [ ] Approval center shows pending

### Visual Verification

- [ ] Dark theme consistent
- [ ] No white backgrounds
- [ ] No overflow issues
- [ ] Responsive sidebar

---

**Plan Prepared By:** VardiyaOS Architecture Team  
**Next Step:** Proceed to Phase 3A - Frontend Core Reconstruction
