# Operational Context Isolation — Authorization Architecture

**Document Type:** Architecture Decision Record / Technical Design  
**Audience:** Engineering, Security, Product  
**Status:** Draft for Review  
**Date:** 2026-07-01

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture Critique](#2-current-architecture-critique)
3. [Operational Context Isolation — Core Concept](#3-operational-context-isolation--core-concept)
4. [Organizational Hierarchy Model](#4-organizational-hierarchy-model)
5. [Data Model (Prisma) Changes](#5-data-model-prisma-changes)
6. [Operational Scope Types](#6-operational-scope-types)
7. [Data Visibility Matrix](#7-data-visibility-matrix)
8. [UI & Navigation Visibility Matrix](#8-ui--navigation-visibility-matrix)
9. [API Scope Matrix](#9-api-scope-matrix)
10. [Backend Architecture — Scope Enforcement](#10-backend-architecture--scope-enforcement)
11. [Frontend Architecture — Context-Driven UI](#11-frontend-architecture--context-driven-ui)
12. [Search & Notification Scope Isolation](#12-search--notification-scope-isolation)
13. [Security Review](#13-security-review)
14. [Migration Strategy](#14-migration-strategy)
15. [Implementation Roadmap](#15-implementation-roadmap)

---

## 1. Executive Summary

VardiyaOS currently implements a **role-level-based access control** (RBAC with hierarchy levels) that is technically functional but architecturally wrong for a multi-department hospital environment. The system treats the entire hospital as a flat namespace where permissions gate _actions_ but never gate _data visibility_ or _operational awareness_.

This document proposes a complete architectural shift to **Operational Context Isolation (OCI)** — a model where every user's experience is confined to their legitimate operational scope. A Radiology technician does not merely lack _permission_ to view Cardiology data; they operate in a different _context_ where Cardiology does not exist.

OCI is not an RBAC enhancement. It is a **data architecture pattern** enforced at every layer: database queries → service layer → API controllers → frontend routes → UI components.

---

## 2. Current Architecture Critique

### 2.1 Problem: Flat Organization-Unit Hierarchy

```
Current:  Organization ──→ Unit
                               ├── MR
                               ├── BT
                               ├── Rontgen
                               ├── Nukleer Tip
                               └── Onkoloji
```

A real hospital does not have flat units. Units are grouped into **departments** (Radiology, Nuclear Medicine, Oncology, Emergency, Surgery, etc.). A Department Head manages a department, not individual units. A Unit Supervisor manages a specific unit within a department.

**Impact:** There is no way to grant "Radiology Department Manager" access without also granting visibility into every unit in the hospital. The Hospital Director role either sees nothing or everything, with no middle ground.

### 2.2 Problem: User and Personnel Are Separate Entities

```prisma
model User { id; email; password; role; organizationId?; unitId? }
model Personnel { id; name; role; unitId; /* NO userId */ }
```

A person who logs into the system (`User`) is a different database row from the person who appears on schedules (`Personnel`). There is no foreign key between them.

**Impact:** A technician scheduled to work in the CT unit sees the same UI as the Hospital Director (minus a few action buttons). The system has no way to determine "this logged-in user IS this personnel record" and therefore cannot auto-configure the experience.

### 2.3 Problem: Dual Role System

Two parallel authorization systems:

- **Legacy `User.role`** (UserRole enum: `super_admin` → `staff`) with `RolesGuard` + `MinRole` hierarchy
- **RBAC `UserRoleAssignment` → `Role` → `RolePermission` → `Permission`** with `PermissionGuard`

Some endpoints use one, some use the other, some use both. The frontend `auth.guard.ts` duplicates the hierarchy with a third, mismatched `ROLE_HIERARCHY` that omits 3 roles.

### 2.4 Problem: Scope Is Not a First-Class Concept

Scope (`organizationId`, `unitId`) is:

- Not represented in the database schema as a column (except on `UserRoleAssignment`)
- Not in the JWT access token (unitId is missing)
- Not enforced on single-record endpoints (`findOne`, `update`, `delete`)
- Not enforced on the `devices` controller at all
- Not used by the frontend for navigation filtering
- Handled inconsistently across 6+ controllers

### 2.5 Problem: Frontend Does Not Adapt to Context

- Sidebar unconditionally shows all 6 units
- Navigation items are hardcoded with minimal role filtering
- Dashboard shows the same KPIs regardless of the user's department
- Search is not scoped
- The user's own `unitId` is stored but never consumed

---

## 3. Operational Context Isolation — Core Concept

### 3.1 Definition

**Operational Context** = The bounded scope within which a user legitimately operates, defined by:

```
OperationalContext {
  organizationId: UUID        // Always required — which hospital/org
  departmentId: UUID | null   // Which department (null = hospital-wide)
  unitId: UUID | null          // Which unit (null = department-wide)
  role: Role                   // What the user can DO within scope
  rbacRoles: RbacRoleName[]    // All RBAC role assignments
  permissions: string[]        // Resolved permission strings
}
```

### 3.2 Core Principles

| Principle                    | Definition                                                 | Enforcement                                     |
| ---------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| **Operational Context**      | Every user has exactly one operational context per session | Computed at login, encoded in JWT               |
| **Organizational Hierarchy** | Data visibility follows the org tree                       | Queries filter by org → dept → unit             |
| **Data Ownership**           | Users own data at their level and below                    | Scope cascades downward                         |
| **Unit Isolation**           | Unit-level users cannot see other units                    | Controller/Service layer enforces unitId filter |
| **Department Isolation**     | Department-level users cannot see other departments        | DepartmentId filter applied when unitId is null |
| **Need-to-Know**             | Data access requires both permission AND scope             | Combined guard checks both                      |
| **Least Privilege**          | Default deny; explicit grant                               | Every endpoint validates scope                  |
| **Context Propagation**      | Scope flows from token → middleware → service → query      | Automatic via OperationalContextFilter          |

### 3.3 How a User Experiences the System

| User                            | Context                                                                      | They See                                                    |
| ------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------- |
| **CT Technician**               | Organization=Acme Hospital, Department=Radiology, Unit=CT, Role=Technician   | CT schedules, CT devices, CT personnel, their own dashboard |
| **Radiology Supervisor**        | Org=Acme Hospital, Department=Radiology, Unit=null, Role=Supervisor          | All Radiology units (CT, MRI, X-Ray, Mammography)           |
| **Hospital Director**           | Org=Acme Hospital, Department=null, Unit=null, Role=Director                 | Everything in the hospital                                  |
| **MRI Technician**              | Org=Acme Hospital, Department=Radiology, Unit=MRI, Role=Technician           | MRI schedules, MRI devices, MRI personnel only              |
| **Nuclear Medicine Technician** | Org=Acme Hospital, Department=Nuclear Medicine, Unit=PET/CT, Role=Technician | PET/CT schedules — no visibility into Radiology at all      |

The key: **A CT Technician never sees "Operasyon Merkezi" or "Nukleer Tip" or even "Radyoloji" as a concept.** They see "BT İş İstasyonu" (CT Workstation).

---

## 4. Organizational Hierarchy Model

### 4.1 Target Hierarchy

```
Organization (Hospital)
  │
  ├── Department: Radiology
  │     ├── Unit: CT (Tomografi)
  │     ├── Unit: MRI (MR)
  │     ├── Unit: X-Ray (Röntgen)
  │     ├── Unit: Mammography (Mamografi)
  │     └── Unit: Ultrasound (Ultrason)
  │
  ├── Department: Nuclear Medicine
  │     ├── Unit: PET/CT
  │     ├── Unit: SPECT
  │     └── Unit: Gamma Camera (Gama Kamera)
  │
  ├── Department: Radiation Oncology
  │     ├── Unit: LINAC (Lineer Hızlandırıcı)
  │     ├── Unit: Brachytherapy (Brakiterapi)
  │     └── Unit: TPS (Tedavi Planlama)
  │
  ├── Department: Emergency
  │     └── Unit: Emergency Radiology
  │
  ├── Department: Cardiology
  │     ├── Unit: Catheter Lab (Anjiyografi)
  │     ├── Unit: ECHO (Ekokardiyografi)
  │     └── Unit: ECG (Elektrokardiyografi)
  │
  ├── Department: Laboratory
  │     ├── Unit: Biochemistry
  │     ├── Unit: Microbiology
  │     ├── Unit: Hematology
  │     └── Unit: Pathology
  │
  └── Department: Administration
        ├── Unit: HR (İnsan Kaynakları)
        ├── Unit: Finance (Finans)
        └── Unit: IT (Bilgi Teknolojileri)
```

### 4.2 Role ↔ Scope Mapping

| Hospital Role          | Department Scope    | Unit Scope               | Typical Job Titles                    |
| ---------------------- | ------------------- | ------------------------ | ------------------------------------- |
| **SYSTEM_ADMIN**       | null (all)          | null (all)               | IT System Admin                       |
| **ORGANIZATION_ADMIN** | null (all)          | null (all)               | Hospital CIO, CTO                     |
| **HOSPITAL_DIRECTOR**  | null (all)          | null (all)               | Başhekim, Hastane Müdürü              |
| **DEPARTMENT_MANAGER** | assigned department | null (all units in dept) | Radyoloji Sorumlusu, Laboratuvar Şefi |
| **UNIT_SUPERVISOR**    | assigned department | assigned unit            | BT Sorumlusu, MR Sorumlusu            |
| **SHIFT_COORDINATOR**  | assigned department | assigned unit            | Vardiya Sorumlusu                     |
| **TECHNICIAN**         | assigned department | assigned unit            | Radyoloji Teknisyeni, Laborant        |
| **HR_MANAGER**         | Administration      | HR                       | İK Müdürü                             |
| **READ_ONLY_AUDITOR**  | varies              | varies                   | Denetçi                               |

---

## 5. Data Model (Prisma) Changes

### 5.1 New Department Model

```prisma
model Department {
  id             String    @id @default(uuid())
  name           String
  code           String
  description    String?
  organizationId String
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization   Organization @relation(fields: [organizationId], references: [id])
  units          Unit[]

  @@unique([organizationId, code])
  @@map("departments")
}
```

### 5.2 Updated Unit Model

```prisma
model Unit {
  id             String    @id @default(uuid())
  name           String
  code           String
  type           UnitType
  organizationId String?   // kept for backward compat, but departmentId added
  departmentId   String?   // NEW — belongs to Department
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  organization   Organization? @relation(fields: [organizationId], references: [id])
  department     Department?   @relation(fields: [departmentId], references: [id])  // NEW
  users          User[]
  devices        Device[]
  personnel      Personnel[]
  schedules      Schedule[]
  shifts         Shifts[]
  handoverNotes  HandoverNote[]
  deviceIncidents DeviceIncident[]

  @@unique([organizationId, code])
  @@map("units")
}
```

### 5.3 Updated User Model — Link to Personnel

```prisma
model User {
  id             String    @id @default(uuid())
  email          String    @unique
  password       String
  name           String
  role           UserRole  @default(staff)
  organizationId String?
  unitId         String?
  personnelId    String?   // NEW — link to Personnel record
  departmentId   String?   // NEW — operational context department
  operationalContext OperationalContext? // NEW — see below
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // relations
  organization    Organization? @relation(fields: [organizationId], references: [id])
  unit            Unit?         @relation(fields: [unitId], references: [id])
  department      Department?   @relation(fields: [departmentId], references: [id])
  personnel       Personnel?    @relation(fields: [personnelId], references: [id])
  // ... existing relations
}
```

### 5.4 New OperationalContext Model

Stores the user's current operational context for session persistence:

```prisma
model OperationalContext {
  id              String   @id @default(uuid())
  userId          String   @unique
  activeDepartmentId String?  // which department they're working in
  activeUnitId    String?     // which unit they're working in
  contextType     ContextType @default(AUTO)  // AUTO | MANUAL_OVERRIDE
  lastActivityAt  DateTime  @default(now())
  createdAt       DateTime  @default(now())

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("operational_contexts")
}

enum ContextType {
  AUTO            // derived from role assignments
  MANUAL_OVERRIDE // user/department manager explicitly switched context
}
```

### 5.5 Updated UserRoleAssignment — Department Scope

```prisma
model UserRoleAssignment {
  id             String   @id @default(uuid())
  userId         String
  roleId         String
  organizationId String?
  departmentId   String?  // NEW — scope to department
  unitId         String?
  assignedBy     String?
  expiresAt      DateTime?
  isActive       Boolean  @default(true)
  createdAt      DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  @@unique([userId, roleId, organizationId, departmentId, unitId])
  @@map("user_role_assignments")
}
```

### 5.6 Enum: UnitType Expansion

```prisma
enum UnitType {
  // Existing
  MR
  BT
  RONTGEN
  NUKLEER_TIP
  ONKOLOJI

  // New hospital unit types
  MAMOGRAFI
  ULTRASON
  PET_CT
  SPECT
  GAMA_KAMERA
  LINAC
  BRAKITERAPI
  TEDAVI_PLANLAMA
  ANJIYOGRAFI
  EKOKARDİYOGRAFI
  EKG
  BIYOKIMYA
  MIKROBIYOLOJI
  HEMATOLOJI
  PATOLOJI
  ACIL_RADYOLOJI
  INSAN_KAYNAKLARI
  FINANS
  BILGI_TEKNOLOJILERI
}
```

### 5.7 New Database Indexes

```prisma
// On Department
@@index([organizationId, isActive])

// On Unit
@@index([departmentId, isActive])
@@index([organizationId, departmentId])

// On User
@@index([departmentId])
@@index([personnelId])

// On UserRoleAssignment
@@index([userId, isActive, departmentId])
@@index([roleId, departmentId])
```

---

## 6. Operational Scope Types

Every entity and feature in the system is classified into one of five scope levels:

| Scope          | Symbol | Description                         | Example                                       |
| -------------- | ------ | ----------------------------------- | --------------------------------------------- |
| **Personal**   | 👤     | Only the user themselves            | My Shifts, My Day, Profile, My Attendance     |
| **Unit**       | 🏥     | A single unit within a department   | CT schedules, MR devices, BT personnel        |
| **Department** | 🏛️     | All units within a department       | Radiology-wide analytics, dept personnel list |
| **Hospital**   | 🏨     | All departments in the organization | Organization-wide reports, admin settings     |
| **Global**     | 🌐     | System-wide (cross-organization)    | Super admin audit, system config              |

---

## 7. Data Visibility Matrix

For every entity in the system, this matrix defines which scope levels can access it and which automatic filters apply.

### 7.1 Entity Scope Map

| Entity             | Owner Tenant | Default Scope | Technician    | Unit Supervisor | Dept Manager    | Hospital Director | System Admin |
| ------------------ | ------------ | ------------- | ------------- | --------------- | --------------- | ----------------- | ------------ |
| **User**           | Organization | Hospital      | Personal only | Dept users      | Dept users      | All               | All          |
| **Personnel**      | Unit         | Unit          | Own unit      | Own unit        | Dept units      | All               | All          |
| **Device**         | Unit         | Unit          | Own unit      | Own unit        | Dept units      | All               | All          |
| **Schedule**       | Unit         | Unit          | Own unit      | Own unit        | Dept units      | All               | All          |
| **Shift**          | Unit         | Unit          | Own unit      | Own unit        | Dept units      | All               | All          |
| **Attendance**     | User         | Personal      | Self          | Own unit        | Dept            | All               | All          |
| **SwapRequest**    | Unit         | Unit          | Own unit      | Own unit        | Dept            | All               | All          |
| **HandoverNote**   | Unit         | Unit          | Own unit      | Own unit        | Dept            | All               | All          |
| **DeviceIncident** | Unit         | Unit          | Own unit      | Own unit        | Dept            | All               | All          |
| **Training**       | Unit/Org     | Varies        | Own dept      | Own dept        | Dept            | All               | All          |
| **AuditLog**       | Organization | Hospital      | —             | Own scope       | Dept scope      | All               | All          |
| **Notification**   | Organization | Personal      | Personal      | Personal + unit | Personal + dept | Personal + org    | All          |
| **Report**         | Organization | Hospital      | Own unit      | Own unit        | Dept            | All               | All          |
| **Analytics**      | Organization | Hospital      | Own unit      | Own unit        | Dept            | All               | All          |
| **Compliance**     | Organization | Hospital      | —             | —               | Dept            | All               | All          |

### 7.2 Scope Cascade Rules

A user at scope level S can see:

- All entities at scope level S (their own)
- All entities at deeper scope levels (downward)
- Cannot see entities at broader scope levels (upward) unless explicitly granted

**Examples:**

- Unit Supervisor (Unit scope) can see: Personal + Unit data
- Department Manager (Dept scope) can see: Personal + Unit + Department data
- Hospital Director (Hospital scope) can see: Personal + Unit + Department + Hospital data

### 7.3 Automatic WHERE Clause Generation

Every database query must automatically generate WHERE conditions based on the user's context:

```typescript
// Pseudo-code for automatic scope enforcement
function applyScope(
  query: PrismaQuery,
  context: OperationalContext,
): PrismaQuery {
  switch (context.scopeLevel) {
    case "unit":
      return query.and({ unitId: context.unitId });
    case "department":
      if (context.departmentId) {
        return query.and({ unit: { departmentId: context.departmentId } });
      }
      return query;
    case "hospital":
      return query.and({ organizationId: context.organizationId });
    case "global":
      return query; // no filter
    default:
      return query.and({ userId: context.userId }); // personal
  }
}
```

---

## 8. UI & Navigation Visibility Matrix

### 8.1 Navigation Items by Scope

| Route                | Label        | Technician   | Unit Supervisor | Dept Manager | Hospital Director | Super Admin |
| -------------------- | ------------ | ------------ | --------------- | ------------ | ----------------- | ----------- |
| `/app/dashboard`     | Dashboard    | Unit-focused | Unit-focused    | Dept-focused | Hospital          | Hospital    |
| `/app/my-day`        | My Day       | ✅           | ✅              | ✅           | ✅                | ✅          |
| `/app/my-shifts`     | Vardiyalarım | ✅           | ✅              | ✅           | ✅                | ✅          |
| `/app/schedules`     | Program      | Own unit     | Own unit        | Dept units   | All               | All         |
| `/app/employees`     | Personel     | Own unit     | Own unit        | Dept units   | All               | All         |
| `/app/operations`    | Operasyon    | ❌           | Own unit        | Dept         | All               | All         |
| `/app/reports`       | Raporlar     | Own unit     | Own unit        | Dept         | All               | All         |
| `/app/analytics`     | Analitik     | Own unit     | Own unit        | Dept         | All               | All         |
| `/app/trainings`     | Eğitimler    | Own dept     | Own dept        | Dept         | All               | All         |
| `/app/audit`         | Denetim      | ❌           | Own scope       | Dept         | All               | All         |
| `/app/settings`      | Ayarlar      | ❌           | ❌              | Dept         | Org               | All         |
| `/app/compliance`    | Uyum         | ❌           | ❌              | Dept         | All               | All         |
| `/app/notifications` | Bildirimler  | ✅           | ✅              | ✅           | ✅                | ✅          |
| `/app/live-tracking` | Canlı Takip  | Unit         | Unit            | Dept         | All               | All         |

### 8.2 Unit-Scoped Navigation

When a user operates at **unit scope**, the sidebar navigation changes fundamentally:

- **Unit label replaces generic label**: "Dashboard" → "BT Panosu", "Personel" → "BT Personeli"
- **Unit logo/color theme**: Entire sidebar adopts the unit's color scheme
- **Cross-unit routes are hidden**: "Nükleer Tıp" tab does not appear
- **Department anchor visible**: A breadcrumb or badge shows "Radyoloji > BT" context

### 8.3 Context Switcher

Department Managers and Hospital Directors get a **Context Switcher** in the topbar:

- Dropdown: "Radyoloji" | "Nükleer Tıp" | "Kardiyoloji" | "Tüm Hastane"
- Selecting a department changes the entire UI to that department's context
- Selecting "Tüm Hastane" shows hospital-wide data

### 8.4 Dashboard KPI Adaptation

| User               | Dashboard KPIs                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------- |
| CT Technician      | CT cihaz durumu, bugünkü hasta sayısı, sıradaki işlem, vardiya bilgim                    |
| Radiology Dept Mgr | Tüm radyoloji birimleri cihaz durumu, toplam hasta, personel doluluk, bekleme süreleri   |
| Hospital Director  | Tüm departmanlar özet: Hasta sayıları, cihaz arıza durumu, personel devamsızlık, maliyet |

---

## 9. API Scope Matrix

### 9.1 Controller Scope Enforcement

| Controller                    | Current State              | Target: Auto-Scope  | Scoping Strategy                          |
| ----------------------------- | -------------------------- | ------------------- | ----------------------------------------- |
| **AuthController**            | No org/unit scope          | ✅ Personal         | JWT token includes context                |
| **SchedulesController**       | Partial (findAll only)     | ✅ Full CRUD        | unitId from context; departmentId cascade |
| **PersonnelController**       | Partial (findAll only)     | ✅ Full CRUD        | unitId from context; no org on model      |
| **DevicesController**         | None                       | ✅ Full CRUD        | unitId from context + orgId via unit join |
| **ShiftsController**          | Partial (findAll, findOne) | ✅ Full CRUD        | organizationId from context + unitId      |
| **AttendanceController**      | Self-only                  | ✅ Self + unit view | Supervisor can view unit attendance       |
| **NotificationsController**   | Partial                    | ✅ Full             | Personal list + unit broadcast scope      |
| **HandoverNotesController**   | None                       | ✅ Full CRUD        | unitId from context                       |
| **DeviceIncidentsController** | None                       | ✅ Full CRUD        | unitId from context                       |
| **TrainingController**        | None                       | ✅ Full CRUD        | department scope                          |
| **SwapRequestsController**    | None                       | ✅ Full CRUD        | unitId from context                       |
| **ReportController**          | None                       | ✅ Full             | scope-based aggregation                   |
| **AnalyticsController**       | None                       | ✅ Full             | scope-based aggregation                   |
| **AuditController**           | None                       | ✅ Full             | scope-based filtering                     |
| **RBACController**            | None                       | ✅ Full             | org-scoped role management                |
| **Compliance controllers**    | None                       | ✅ Full             | org-scoped                                |
| **RecommendationsController** | None                       | ✅ Full             | unit-scoped                               |

### 9.2 API Scope Enrichment Pattern

Every controller endpoint should follow this pattern:

```typescript
// Instead of:
@Get()
async findAll(@Request() req: RequestWithUser) {
  return this.service.findAll({ organizationId: req.user.organizationId });
}

// Use:
@Get()
async findAll(@Request() req: RequestWithUser) {
  const context = OperationalContext.from(req.user);
  return this.service.findAll(context.apply()); // scope applied automatically
}
```

### 9.3 Scope-Aware Repository Pattern

```typescript
class ScopeAwareRepository<T> {
  constructor(
    private prisma: PrismaService,
    private model: string,
    private scopeField: string, // 'unitId' | 'departmentId' | 'organizationId'
  ) {}

  async findMany(context: OperationalContext, args: PrismaArgs): Promise<T[]> {
    const scopeFilter = this.buildScopeFilter(context);
    return this.prisma[this.model].findMany({
      ...args,
      where: { ...args.where, ...scopeFilter },
    });
  }

  async findById(context: OperationalContext, id: string): Promise<T | null> {
    const record = await this.prisma[this.model].findUnique({ where: { id } });
    if (!record) return null;
    if (!this.isInScope(context, record)) return null; // scope gate
    return record;
  }

  private buildScopeFilter(context: OperationalContext): PrismaFilter {
    switch (context.scopeLevel) {
      case "unit":
        return { unitId: context.unitId };
      case "department":
        return { unit: { departmentId: context.departmentId } };
      case "hospital":
        return { unit: { organizationId: context.organizationId } };
      default:
        return {};
    }
  }

  private isInScope(context: OperationalContext, record: any): boolean {
    // Verifies a single record belongs to the user's scope
    // Used for unscoped queries (findById, update, delete)
    const scopeFilter = this.buildScopeFilter(context);
    // ... check if record matches scopeFilter
  }
}
```

---

## 10. Backend Architecture — Scope Enforcement

### 10.1 New OperationalContextService

```typescript
@Injectable()
export class OperationalContextService {
  constructor(
    private prisma: PrismaService,
    private rbacService: RbacService,
  ) {}

  async resolveContext(
    userId: string,
    sessionOverride?: { departmentId?: string; unitId?: string },
  ): Promise<OperationalContext> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { personnel: true },
    });
    if (!user) throw new UnauthorizedException();

    // Determine scope level from RBAC roles
    const rbacRoles = await this.rbacService.getUserRbacRoles(userId);
    const scopeLevel = this.determineScopeLevel(rbacRoles);

    // Resolve org/department/unit
    const organizationId = user.organizationId!;
    const departmentId = sessionOverride?.departmentId ?? user.departmentId;
    const unitId = sessionOverride?.unitId ?? user.unitId;

    // Validate: if unitId is set, derive department if not set
    const derivedDepartmentId =
      departmentId ??
      (unitId ? await this.getDepartmentFromUnit(unitId) : null);

    return new OperationalContext({
      userId: user.id,
      personnelId: user.personnelId,
      organizationId,
      departmentId: derivedDepartmentId,
      unitId,
      scopeLevel,
      role: user.role,
      rbacRoles: rbacRoles.map((r) => r.roleName),
      permissions: await this.rbacService.getUserPermissions(userId, {
        organizationId,
        departmentId: derivedDepartmentId,
        unitId,
      }),
    });
  }

  private determineScopeLevel(rbacRoles: RbacRoleAssignment[]): ScopeLevel {
    const roleNames = rbacRoles.map((r) => r.role.name);
    if (roleNames.includes("SYSTEM_ADMIN")) return ScopeLevel.GLOBAL;
    if (
      roleNames.includes("HOSPITAL_DIRECTOR") ||
      roleNames.includes("ORGANIZATION_ADMIN")
    )
      return ScopeLevel.HOSPITAL;
    if (roleNames.includes("DEPARTMENT_MANAGER")) return ScopeLevel.DEPARTMENT;
    if (
      roleNames.some((r) =>
        [
          "UNIT_SUPERVISOR",
          "SHIFT_COORDINATOR",
          "TECHNICIAN",
          "HR_MANAGER",
        ].includes(r),
      )
    )
      return ScopeLevel.UNIT;
    return ScopeLevel.PERSONAL;
  }
}
```

### 10.2 OperationalContextGuard — Replaces RolesGuard + PermissionGuard

```typescript
@Injectable()
export class OperationalContextGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private contextService: OperationalContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();

    // Resolve the operational context from the JWT user
    const contextInfo = await this.contextService.resolveContext(
      request.user.id,
      request.headers["x-context-department"]
        ? { departmentId: request.headers["x-context-department"] }
        : undefined,
    );

    // Attach context to request for downstream use
    request.operationalContext = contextInfo;

    // Check required scope (from @Scoped decorator)
    const requiredScope = this.reflector.getAllAndOverride<ScopeLevel>(
      SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredScope && contextInfo.scopeLevel < requiredScope) {
      throw new ForbiddenException("Operational context scope insufficient");
    }

    // Check required permissions (existing @Permissions decorator)
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasAll = requiredPermissions.every((p) =>
        contextInfo.permissions.includes(p),
      );
      if (!hasAll) {
        throw new ForbiddenException({
          message: "Insufficient permissions for operational context",
          required: requiredPermissions,
        });
      }
    }

    return true;
  }
}
```

### 10.3 New @Scoped Decorator

```typescript
export const SCOPE_KEY = "operational_scope";
export const Scoped = (scope: ScopeLevel) => SetMetadata(SCOPE_KEY, scope);

// Usage:
@Controller("schedules")
@Scoped(ScopeLevel.UNIT) // Minimum scope required
export class SchedulesController {
  @Get()
  @Scoped(ScopeLevel.UNIT) // Override if needed
  async findAll(@OperationalContext() context: OperationalContext) {
    return this.service.findAll(context.scopeFilter());
  }
}
```

### 10.4 New @OperationalContext Parameter Decorator

```typescript
export const OperationalContextParam = createParamDecorator(
  (data: keyof OperationalContext | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const context = request.operationalContext;
    return data ? context?.[data] : context;
  },
);
```

### 10.5 JWT Payload Enrichment

Add `unitId` and `departmentId` and `scopeLevel` to the JWT access token:

```typescript
const payload = {
  sub: user.id,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId,
  departmentId: user.departmentId, // NEW
  unitId: user.unitId, // NEW
  scopeLevel: computedScopeLevel, // NEW
  jti,
  rbacLevel,
};
```

### 10.6 Scope-Aware Service Base Class

```typescript
abstract class ScopeAwareService {
  constructor(protected contextService: OperationalContextService) {}

  protected applyScope(context: OperationalContext): Record<string, any> {
    switch (context.scopeLevel) {
      case ScopeLevel.UNIT:
        return { unitId: context.unitId };
      case ScopeLevel.DEPARTMENT:
        return {
          OR: [
            { unit: { departmentId: context.departmentId } },
            ...(context.unitId ? [{ unitId: context.unitId }] : []),
          ],
        };
      case ScopeLevel.HOSPITAL:
        return { unit: { organizationId: context.organizationId } };
      case ScopeLevel.GLOBAL:
        return {};
      default:
        return { userId: context.userId };
    }
  }

  protected verifyScope(
    context: OperationalContext,
    record: {
      unitId?: string;
      departmentId?: string;
      organizationId?: string;
      userId?: string;
    },
  ): boolean {
    // Validation logic for single-record operations
    switch (context.scopeLevel) {
      case ScopeLevel.UNIT:
        return record.unitId === context.unitId;
      case ScopeLevel.DEPARTMENT:
        return (
          record.departmentId === context.departmentId ||
          (record as any).unit?.departmentId === context.departmentId
        );
      // ...
    }
  }
}
```

---

## 11. Frontend Architecture — Context-Driven UI

### 11.1 Operational Context Store

```typescript
// frontend/src/app/core/state/operational-context.store.ts
interface OperationalContextState {
  organizationId: string;
  organizationName: string;
  departmentId: string | null;
  departmentName: string | null;
  unitId: string | null;
  unitName: string | null;
  scopeLevel: ScopeLevel;
  role: string;
  rbacRoles: string[];
  permissions: string[];
  personnelId: string | null; // link to Personnel record
}

enum ScopeLevel {
  PERSONAL = 0,
  UNIT = 1,
  DEPARTMENT = 2,
  HOSPITAL = 3,
  GLOBAL = 4,
}
```

### 11.2 Context-Driven Navigation Service

```typescript
// Replaces hardcoded mainNav() and units[] arrays
@Injectable({ providedIn: "root" })
export class NavigationService {
  private context = inject(OperationalContextStore);

  readonly navItems = computed(() => {
    const scope = this.context.scopeLevel();
    const unitId = this.context.unitId();

    const items: NavItem[] = [];

    // Personal items — always visible
    items.push(
      {
        id: "dashboard",
        label: this.dashboardLabel(),
        route: "/app/dashboard",
        icon: "...",
      },
      { id: "my-day", label: "My Day", route: "/app/my-day", icon: "..." },
      {
        id: "my-shifts",
        label: "Vardiyalarım",
        route: "/app/my-shifts",
        icon: "...",
      },
    );

    // Unit-scoped items
    if (scope >= ScopeLevel.UNIT) {
      items.push(
        {
          id: "schedules",
          label:
            scope === ScopeLevel.UNIT
              ? `${this.unitCode()} Programı`
              : "Programlar",
          route: "/app/schedules",
          icon: "...",
        },
        {
          id: "employees",
          label:
            scope === ScopeLevel.UNIT
              ? `${this.unitCode()} Personeli`
              : "Personel",
          route: "/app/employees",
          icon: "...",
        },
        {
          id: "live-tracking",
          label: "Canlı Takip",
          route: "/app/live-tracking",
          icon: "...",
        },
      );
    }

    // Department-scoped items
    if (scope >= ScopeLevel.DEPARTMENT) {
      items.push(
        {
          id: "operations",
          label: "Operasyon",
          route: "/app/operations",
          icon: "...",
        },
        {
          id: "trainings",
          label: "Eğitimler",
          route: "/app/trainings",
          icon: "...",
        },
      );
    }

    // Hospital-scoped items
    if (scope >= ScopeLevel.HOSPITAL) {
      items.push(
        {
          id: "reports",
          label: "Raporlar",
          route: "/app/reports",
          icon: "...",
        },
        {
          id: "analytics",
          label: "Analitik",
          route: "/app/analytics",
          icon: "...",
        },
        { id: "audit", label: "Denetim", route: "/app/audit", icon: "..." },
        {
          id: "compliance",
          label: "Uyum",
          route: "/app/compliance",
          icon: "...",
        },
        {
          id: "settings",
          label: "Ayarlar",
          route: "/app/settings",
          icon: "...",
        },
      );
    }

    return items;
  });

  readonly sidebarUnits = computed(() => {
    const scope = this.context.scopeLevel();
    const deptId = this.context.departmentId();

    if (scope === ScopeLevel.UNIT) {
      // Show ONLY the user's unit — no sidebar unit list at all
      return [];
    }

    if (scope === ScopeLevel.DEPARTMENT) {
      // Show only units within this department
      return this.loadUnitsByDepartment(deptId);
    }

    // Show all units (hospital-wide)
    return this.loadAllUnits();
  });
}
```

### 11.3 Route Guard — OperationalContextGuard (Frontend)

```typescript
export const operationalContextGuard: CanActivateFn = async (route) => {
  const context = inject(OperationalContextStore);
  const router = inject(Router);

  // Ensure context is loaded
  await context.ensureLoaded();

  const requiredScope = route.data?.["scope"] as ScopeLevel | undefined;
  const requiredPermissions = route.data?.["permissions"] as
    | string[]
    | undefined;

  // Check minimum scope level
  if (requiredScope !== undefined && context.scopeLevel() < requiredScope) {
    router.navigate(["/app/dashboard"]);
    return false;
  }

  // Check permissions
  if (requiredPermissions && requiredPermissions.length > 0) {
    const hasAccess = requiredPermissions.every((p) =>
      context.hasPermission(p),
    );
    if (!hasAccess) {
      router.navigate(["/app/dashboard"]);
      return false;
    }
  }

  return true;
};
```

### 11.4 Context-Driven Dashboard

```typescript
// Dashboard component adapts based on scope
@Component({...})
export class DashboardComponent {
  private context = inject(OperationalContextStore);
  private dashboardService = inject(DashboardService);

  // Dashboard content changes based on scope
  readonly kpis = computed(async () => {
    const scope = this.context.scopeLevel();
    const unitId = this.context.unitId();

    switch (scope) {
      case ScopeLevel.UNIT:
        return this.dashboardService.getUnitKpis(unitId);
      case ScopeLevel.DEPARTMENT:
        return this.dashboardService.getDepartmentKpis(this.context.departmentId());
      case ScopeLevel.HOSPITAL:
        return this.dashboardService.getHospitalKpis(this.context.organizationId());
      default:
        return this.dashboardService.getPersonalKpis();
    }
  });
}
```

### 11.5 API Service — Automatic Scope Headers

```typescript
@Injectable()
export class ApiService {
  private context = inject(OperationalContextStore);

  get<T>(url: string, options?: HttpOptions): Observable<T> {
    const headers = this.buildScopeHeaders();
    return this.http.get<T>(url, { ...options, headers });
  }

  private buildScopeHeaders(): HttpHeaders {
    let headers = new HttpHeaders();
    const deptId = this.context.departmentId();
    const unitId = this.context.unitId();

    if (deptId) headers = headers.set("X-Context-Department", deptId);
    if (unitId) headers = headers.set("X-Context-Unit", unitId);

    return headers;
  }
}
```

---

## 12. Search & Notification Scope Isolation

### 12.1 Search

**Current state:** Search (SearchPaletteComponent) searches globally without org/unit scope.

**Target:** Search is restricted to the user's operational context.

```typescript
// frontend/src/app/ui/search-palette/search-palette.component.ts
@Injectable()
class SearchService {
  private context = inject(OperationalContextStore);

  search(term: string): Observable<SearchResult[]> {
    const scope = this.context.scopeLevel();
    const params: any = { q: term };

    // Automatically scope the search query
    switch (scope) {
      case ScopeLevel.UNIT:
        params.unitId = this.context.unitId();
        break;
      case ScopeLevel.DEPARTMENT:
        params.departmentId = this.context.departmentId();
        break;
      case ScopeLevel.HOSPITAL:
        params.organizationId = this.context.organizationId();
        break;
    }

    return this.api.get("/search", { params });
  }
}
```

Backend search endpoint applies scope:

```typescript
@Get('search')
@Scoped(ScopeLevel.UNIT)
async search(@Query('q') query: string, @OperationalContext() context: OperationalContext) {
  return this.searchService.search(query, context.scopeFilter());
}
```

### 12.2 Notifications

**Current state:** Notifications are fetched by `userId` only. Broadcast/send accepts org from any caller.

**Target:**

| Notification Type    | Scope      | Recipients                     |
| -------------------- | ---------- | ------------------------------ |
| Personal             | Personal   | Specific user                  |
| Unit Broadcast       | Unit       | All users assigned to the unit |
| Department Broadcast | Department | All users in the department    |
| Hospital Broadcast   | Hospital   | All users in the organization  |
| Emergency            | Hospital   | All users (override)           |

```typescript
@Injectable()
class ScopeAwareNotificationService {
  async sendToScope(
    context: OperationalContext,
    notification: CreateNotificationDto,
  ) {
    const scopeFilter = context.scopeFilter();
    const recipients = await this.prisma.user.findMany({
      where: {
        ...scopeFilter,
        isActive: true,
        notificationPreferences: {
          some: { type: notification.type, enabled: true },
        },
      },
    });

    return this.sendToUsers(recipients, notification);
  }
}
```

---

## 13. Security Review

### 13.1 Threat Model

| Threat                                             | Current Risk                                    | OCI Mitigation                                                          |
| -------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------- |
| **Cross-unit data access**                         | High — `Personnel.findOne()` has no scope check | Eliminated — `ScopeAwareRepository.findById()` verifies scope           |
| **Cross-department visibility**                    | High — sidebar shows all units                  | Eliminated — UI only shows user's department/unit                       |
| **IDOR via entity ID**                             | High — `/schedules/:id` accepts any ID          | Mitigated — scope verification on every single-record operation         |
| **Privilege escalation**                           | Medium — dual role system creates gaps          | Eliminated — single `OperationalContextGuard` replaces two guards       |
| **Data leakage via search**                        | High — search is unscoped                       | Eliminated — scope filter applied to search queries                     |
| **Data leakage via notifications**                 | Medium — broadcast not scoped to org            | Eliminated — scope filter on recipient resolution                       |
| **Data leakage via API enumeration**               | Medium — unscoped list endpoints                | Eliminated — every list endpoint auto-filters by scope                  |
| **Insider threat (unit tech viewing other depts)** | High — no boundary exists                       | Eliminated — department isolation enforced at DB level                  |
| **Session context confusion**                      | Low — no context switching                      | Mitigated — `ContextType.AUTO` vs `MANUAL_OVERRIDE` with audit trail    |
| **Unauthorized context switch**                    | N/A                                             | Mitigated — only `DEPARTMENT_MANAGER+` can override, logged to AuditLog |

### 13.2 Security Controls

| Layer                  | Control                             | Implementation                                         |
| ---------------------- | ----------------------------------- | ------------------------------------------------------ |
| **Database**           | Row-Level Security via WHERE clause | `ScopeAwareRepository` applies scope filter            |
| **Prisma**             | Scope-aware queries                 | All `findMany`/`findUnique` go through scope wrapper   |
| **Service**            | Scope verification on mutations     | `verifyScope()` called before create/update/delete     |
| **Controller**         | `@Scoped()` decorator               | Minimum scope level enforced before handler            |
| **Guard**              | `OperationalContextGuard`           | JWT validation + scope resolution + permission check   |
| **JWT**                | Context encoded in token            | `unitId`, `departmentId`, `scopeLevel` in payload      |
| **Frontend Route**     | `operationalContextGuard`           | Scope level check + permission check                   |
| **Frontend Component** | `navItems()` computed signal        | Only renders authorized navigation items               |
| **Frontend API**       | `buildScopeHeaders()`               | Sends `X-Context-Department`, `X-Context-Unit` headers |

### 13.3 Audit Trail Enhancement

Every context switch or scope override must be audited:

```typescript
// OperationalContextGuard logs every access attempt
@Injectable()
export class OperationalContextGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ... resolve context, check scope ...
    this.auditLogService.log({
      userId: contextInfo.userId,
      action: "ACCESS_CHECK",
      entityType: context.getClass()?.name,
      metadata: {
        scopeLevel: contextInfo.scopeLevel,
        requiredScope,
        departmentId: contextInfo.departmentId,
        unitId: contextInfo.unitId,
      },
    });
    return true;
  }
}
```

### 13.4 Data Classification Tie-In

Operational context must respect data classification labels:

```typescript
const CLASSIFICATION_SCOPE_MAP: Record<DataClassification, ScopeLevel> = {
  PUBLIC: ScopeLevel.PERSONAL, // Visible to anyone authenticated
  INTERNAL: ScopeLevel.UNIT, // Visible to unit
  CONFIDENTIAL: ScopeLevel.UNIT, // Visible to unit + supervisors
  RESTRICTED: ScopeLevel.DEPARTMENT, // Visible to department managers +
  CRITICAL: ScopeLevel.HOSPITAL, // Visible to directors +
  REGULATED: ScopeLevel.GLOBAL, // Audit-only, special access
};
```

---

## 14. Migration Strategy

### 14.1 Phase 1: Foundation (Backend Data Model)

1. Create `Department` model and migration
2. Add `departmentId` to `Unit` model
3. Add `personnelId` and `departmentId` to `User` model
4. Add `departmentId` to `UserRoleAssignment` model
5. Add `OperationalContext` model
6. Seed Radiology, Nuclear Medicine, Oncology, etc. departments
7. Migrate existing units into departments
8. Link existing Personnel records to User records (if possible via email)

### 14.2 Phase 2: Backend Scope Infrastructure

1. Implement `OperationalContextService`
2. Implement `ScopeAwareRepository` base class
3. Implement `OperationalContextGuard` (replaces `RolesGuard` + `PermissionGuard`)
4. Implement `@Scoped()` decorator
5. Implement `@OperationalContext()` parameter decorator
6. Add `unitId` and `departmentId` to JWT payload
7. Create `ScopeAwareService` base class

### 14.3 Phase 3: Controller Migration

Migrate controllers one at a time:

1. `SchedulesController` — add scope to all endpoints
2. `PersonnelController` — add scope to all endpoints
3. `DevicesController` — add scope to all endpoints
4. `ShiftsController` — add scope to all endpoints
5. `HandoverNotesController` — add scope
6. `DeviceIncidentsController` — add scope
7. `AttendanceController` — add supervisor unit view
8. `NotificationsController` — add scope-aware sending
9. `TrainingController` — add department scope
10. `SwapRequestsController` — add scope
11. Reports, Analytics, Audit — add scope

### 14.4 Phase 4: Frontend Context Infrastructure

1. Create `OperationalContextStore`
2. Create `NavigationService` (replaces hardcoded nav arrays)
3. Create `operationalContextGuard` (replaces `roleGuard` + `rbacGuard`)
4. Update `ApiService` to send scope headers
5. Create `ContextSwitcherComponent` for managers/directors

### 14.5 Phase 5: Frontend Component Migration

1. `MainLayoutComponent` — use `NavigationService` for sidebar
2. `DashboardComponent` — scope-driven KPIs
3. `SearchPaletteComponent` — scope-constrained search
4. All feature components — pass scope to API services
5. Route definitions — replace `roleGuard`/`rbacGuard` with `operationalContextGuard`

### 14.6 Phase 6: Cleanup & Deprecation

1. Remove legacy `RolesGuard` and `role-guards.ts`
2. Remove legacy `ROLE_HIERARCHY` from frontend `auth.guard.ts`
3. Remove `isUnitScopedRole()` and `UNIT_SCOPED_ROLES`
4. Remove old `MinRole` constant if no longer referenced
5. Remove ad-hoc scope checks from individual controllers
6. Deprecate `User.role` field (keep for backward compat but no longer used for authorization)

---

## 15. Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Day | Task                                                                                    | Deliverable      |
| --- | --------------------------------------------------------------------------------------- | ---------------- |
| 1-2 | Prisma schema: Department model, Unit.departmentId, User.personnelId, User.departmentId | Migration script |
| 3-4 | Seed departments, migrate units into departments                                        | Seed script      |
| 5   | Link Personnel ↔ User records                                                           | Data migration   |
| 6   | Add indexes, test migration                                                             | Green migration  |
| 7   | Regression: 185/185 tests pass                                                          | ✅               |

### Phase 2: Backend Scope Infrastructure (Week 3-4)

| Day   | Task                                                      | Deliverable  |
| ----- | --------------------------------------------------------- | ------------ |
| 8-9   | `OperationalContextService` + types                       | Service      |
| 10-11 | `ScopeAwareRepository` base class                         | Repository   |
| 12    | `OperationalContextGuard` + `@Scoped()` decorator         | Guard        |
| 13    | JWT payload enrichment (unitId, departmentId, scopeLevel) | Auth changes |
| 14    | Unit tests for scope enforcement                          | Tests pass   |

### Phase 3: Controller Migration (Week 5-6)

| Day   | Task                                           | Deliverable |
| ----- | ---------------------------------------------- | ----------- |
| 15-16 | Schedules controller migration                 | Full scope  |
| 17-18 | Personnel + Devices controllers                | Full scope  |
| 19-20 | Shifts + Attendance controllers + Notification | Full scope  |
| 21-22 | Remaining controllers                          | Full scope  |
| 23    | Integration tests for scope enforcement        | Tests pass  |
| 24    | Regression: all existing tests pass            | ✅          |

### Phase 4: Frontend Context Infrastructure (Week 7)

| Day   | Task                                                    | Deliverable |
| ----- | ------------------------------------------------------- | ----------- |
| 25-26 | `OperationalContextStore` + `NavigationService`         | Store       |
| 27-28 | `operationalContextGuard` + route updates               | Guard       |
| 29    | `ApiService` scope headers + `ContextSwitcherComponent` | Components  |
| 30    | `tsc --noEmit` passes, frontend compiles                | ✅          |

### Phase 5: Frontend Component Migration (Week 8-9)

| Day   | Task                                                | Deliverable |
| ----- | --------------------------------------------------- | ----------- |
| 31-32 | MainLayout + sidebar → `NavigationService`          | Layout      |
| 33-34 | Dashboard → scope-driven KPIs                       | Dashboard   |
| 35-36 | Search + all feature components → scope-aware       | Features    |
| 37-38 | Route guard migration (replace roleGuard/rbacGuard) | Routes      |
| 39    | End-to-end testing                                  | E2E pass    |
| 40    | UAT feedback                                        | Sign-off    |

### Phase 6: Cleanup (Week 10)

| Day   | Task                                             | Deliverable  |
| ----- | ------------------------------------------------ | ------------ |
| 41-42 | Remove legacy guard code                         | Cleanup      |
| 43-44 | Remove `User.role` deprecations                  | Cleanup      |
| 45    | Final regression testing                         | Tests pass   |
| 46    | Documentation + Architecture Decision Records    | Docs         |
| 47-48 | Performance benchmark + scope query optimization | Optimization |
| 49    | Go/no-go decision                                | ✅           |
| 50    | Production deployment                            | 🚀           |

### Risk Mitigation

| Risk                                          | Probability | Impact   | Mitigation                                                                                                |
| --------------------------------------------- | ----------- | -------- | --------------------------------------------------------------------------------------------------------- |
| **Performance regression from scope queries** | Medium      | High     | Add `EXPLAIN ANALYZE` to scope queries; add composite indexes on `[organizationId, departmentId, unitId]` |
| **Data migration fails**                      | Low         | Critical | Run migration against staging first; rollback script prepared                                             |
| **Frontend context store complexity**         | Medium      | Medium   | Prototype `OperationalContextStore` in isolation before integration                                       |
| **User confusion from narrow scope**          | Medium      | Low      | Add context badge showing current department/unit; provide manual override for authorized roles           |
| **Third-party integration scope gaps**        | Low         | High     | Document scope expectations for each integration; add integration test suite                              |

---

**Document Authors:** Principal Architect  
**Review Required By:** CTO, Security Officer, Product Manager, Lead Engineer  
**Approval Status:** Draft
