# RBAC Authorization Audit

**Date:** 2026-06-18
**Auditor:** Principal Security Architect
**Scope:** Full-stack authorization analysis

## Executive Summary

The codebase contains **two independent authorization systems** running in parallel — a legacy `UserRole`-based system and a newer RBAC system. Neither is fully integrated with the other, creating a fragmented security posture with **14 identified gaps**, including 4 critical vulnerabilities.

**Risk Level:** HIGH — JWT tokens carry only legacy roles; hybrid guards create bypass paths.

---

## 1. Architecture Review

### Current State: Dual Auth Systems

```
┌──────────────────────────────────────────────────────┐
│              JWT Authentication Layer                 │
│  Token Payload: { sub, email, role(LEGACY), orgId }  │
└──────────────┬───────────────────────────────────────┘
               │
        ┌──────┴──────┐
        ▼              ▼
┌──────────────┐ ┌──────────────────┐
│  LEGACY      │ │  RBAC SYSTEM     │
│  UserRole    │ │  (New, Partial)  │
│              │ │                  │
│  Guards:     │ │  Guards:         │
│  RolesGuard  │ │  PermissionGuard │
│  (min role)  │ │  RbacRolesGuard  │
│              │ │                  │
│  Used in:    │ │  Used in:        │
│  80% of      │ │  10% of          │
│  controllers │ │  controllers     │
└──────────────┘ └──────────────────┘
```

**Problem:** Some controllers use `[JwtAuthGuard, RolesGuard]` (legacy), some use `[JwtAuthGuard, PermissionGuard]` (RBAC), and some use `[JwtAuthGuard, RolesGuard, PermissionGuard]` (hybrid). No consistency.

---

## 2. Critical Vulnerabilities

### C-01: No RBAC Auto-Assignment on Registration

**File:** `backend/src/modules/auth/auth.service.ts`
**Risk:** HIGH

**Description:** `AuthService.register()` and `AuthService.login()` only set `User.role` (legacy). New users receive zero RBAC permissions. If the legacy `RolesGuard` is removed (or bypassed), the user has no authorization to any RBAC-protected endpoint.

**Attack Vector:** Register a new user → login → access RBAC-only endpoints → no permission check on GET /rbac/me/permissions → empty permissions → denial of service or unexpected access.

**Fix:** Auto-assign default RBAC role based on legacy `UserRole` level.

---

### C-02: JWT Payload Lacks RBAC Data

**File:** `backend/src/modules/auth/auth.service.ts:generateToken()`
**Risk:** HIGH

**Description:** The JWT access token payload contains only `role: user.role` (legacy). RBAC permissions and role names are fetched server-side by `JwtStrategy.validate()` and added to `request.user`, but they are **not verifiable from the token itself**. A compromised database could inject permissions.

**Attack Vector:** Database is compromised → RBAC tables return incorrect permissions → server-side permission check is unreliable.

**Mitigation:** Embed RBAC role level and permission hash in JWT; verify client-side.

---

### C-03: `isRbacAvailable` Permanently Disables RBAC

**File:** `backend/src/modules/rbac/rbac.service.ts`
**Risk:** HIGH

**Description:** If any database query to the RBAC tables throws an error, `isRbacAvailable` is set to `false` permanently. All subsequent RBAC checks return empty permissions. A transient error (e.g., connection timeout) could permanently disable authorization until server restart, allowing unrestricted access.

**Fix:** Remove permanent disable; use per-request error handling with local fallback.

---

### C-04: Super-Admin Bypass Missing in RBAC Guards

**Files:** `PermissionGuard`, `RbacRolesGuard`
**Risk:** HIGH

**Description:** Neither RBAC guard checks for super-admin privileges. The legacy system had `if (user.role === 'super_admin') return true` checks. The new guards would deny a `SYSTEM_ADMIN` if a specific permission was missing from the role configuration.

**Fix:** Add `SYSTEM_ADMIN` bypass at the top of both guards.

---

## 3. Medium Severity Issues

### M-01: Inconsistent Guard Usage

**Files:** All controllers
**Risk:** MEDIUM

15 controllers use legacy-only guards. 2 controllers use RBAC-only guards. Some schedule endpoints use both. There is no migration plan or deprecation strategy. New endpoints may inadvertently omit authorization entirely.

**Fix:** Implement a unified `AuthGuard` that handles both systems.

---

### M-02: No `@Scope()` Validation

**Files:** All guards
**Risk:** MEDIUM

Permissions are checked for _existence_ but not _scope_. A `UNIT_SUPERVISOR` in Unit A could theoretically access data in Unit B if the permission name matches. The `UserRoleAssignment` stores `organizationId` and `unitId`, but neither `PermissionGuard` nor `RbacRolesGuard` validates that the user's scope matches the requested resource.

**Fix:** Implement scope matching in guards.

---

### M-03: Cache Propagation Delay

**Files:** `JwtStrategy` (60s), `RbacService` (30s)
**Risk:** MEDIUM

Changes to RBAC role assignments take 30-60 seconds to propagate. A role removal or permission revocation remains effective for up to 60 seconds. In a healthcare environment, this delay is unacceptable for security-critical decisions.

**Fix:** Reduce cache TTLs or implement cache invalidation on assignment changes.

---

### M-04: Frontend RBAC Not Utilized

**Files:** Frontend components
**Risk:** MEDIUM

The `rbac.service.ts` exists and fetches permissions, but there are **no structural directives** (`*hasPermission`, `*hasRole`) in any component templates. The `rbacGuard` is defined but it's unclear if any route actually uses it. The frontend relies entirely on the legacy `User.role` for UI decisions.

**Fix:** Create structural directives, apply to templates.

---

### M-05: RBAC Seed Assigns No Users

**File:** `rbac-seed.service.ts`
**Risk:** MEDIUM

The seed data creates 9 roles and 53 permissions with a full permission matrix, but assigns **zero users** to any RBAC role. After seeding, the system is non-functional for RBAC until an administrator manually assigns roles. Combined with C-01, new users are completely locked out of RBAC-protected endpoints.

**Fix:** Seed auto-assignment rules based on legacy `UserRole`.

---

## 4. Low Severity Issues

### L-01: Frontend-Backend Role Enum Mismatch

Frontend `UserRoleEnum` has `assistant_technician` and `office_staff` that don't exist in backend Prisma `UserRole` enum. These roles can never be assigned or matched.

### L-02: Type Safety via `as any`

`rbac.service.ts` uses `as any` in 6+ locations, bypassing TypeScript type checking on Prisma queries.

### L-03: Inline Frontend Role Hierarchy

`auth.guard.ts` defines its own `ROLE_HIERARCHY` (7→1) separate from the backend (100→30). While the relative ordering is correct, the duplicate definition creates a maintenance risk.

---

## 5. Route Protection Gap Analysis

| Controller                  | Guard                           | System | Protected?         |
| --------------------------- | ------------------------------- | ------ | ------------------ |
| AuthController              | JwtAuthGuard                    | Legacy | ✅                 |
| PersonnelController         | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| SchedulesController         | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| SchedulesWorkflowController | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| RbacController              | JwtAuthGuard + PermissionGuard  | RBAC   | ✅ (strong)        |
| UnitsController             | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| DevicesController           | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| AttendanceController        | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| AuditLogController          | JwtAuthGuard + AuditAccessGuard | Custom | ✅                 |
| SkillsController            | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| TrainingsController         | JwtAuthGuard + RolesGuard       | Legacy | ✅ (but weak)      |
| PushTokensController        | JwtAuthGuard                    | None   | ⚠️ No role check   |
| MeController                | JwtAuthGuard                    | None   | ⚠️ User-level only |
| HealthController            | None                            | None   | ✅ (public)        |

---

## 6. Remediation Plan

| Priority | Issue                         | Fix                                   | Effort |
| -------- | ----------------------------- | ------------------------------------- | ------ |
| P0       | C-01: No RBAC auto-assignment | Add mapping in auth service           | 2h     |
| P0       | C-02: JWT lacks RBAC          | Embed role level in JWT payload       | 1h     |
| P0       | C-03: Permanent RBAC disable  | Remove `isRbacAvailable`              | 1h     |
| P0       | C-04: No super-admin bypass   | Add bypass to both guards             | 1h     |
| P1       | M-01: Inconsistent guards     | Create unified AuthGuard              | 4h     |
| P1       | M-02: No scope validation     | Implement ScopeGuard                  | 4h     |
| P1       | M-04: Frontend RBAC           | Create directives, apply to templates | 6h     |
| P2       | M-03: Cache propagation       | Reduce TTL, add invalidation          | 2h     |
| P2       | M-05: Seed assignments        | Add auto-assignment in seed           | 1h     |
| P3       | L-01/L-02/L-03                | Clean up enums, types, hierarchy      | 2h     |
