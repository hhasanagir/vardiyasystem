import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { ROLE_LEVELS, RbacRoleName } from '../interfaces/rbac.types';

/**
 * Result of resolving a user's effective unit scope.
 * - strictUnitId non-null  => user is confined to exactly this unit (field responsible / saha sorumlusu).
 * - organizationId         => the tenant the user belongs to (may be null for legacy NULL-org accounts).
 */
export interface ResolvedScope {
  strictUnitId: string | null;
  organizationId: string | null;
  role: string;
}

interface RbacRoleRef {
  roleName: string;
  unitId: string | null;
  organizationId: string | null;
}

interface ScopeUser {
  id: string;
  role?: string | null;
  unitId?: string | null;
  organizationId?: string | null;
  rbacRoles?: RbacRoleRef[];
}

/**
 * Central unit-scope authorization logic.
 *
 * Enforces the critical business rule: SAHA_SORUMLUSU (field responsible) is
 * confined to exactly ONE assigned unit and may never touch sibling units,
 * while SUPERVISOR and above (supervisor, chief technician, project manager,
 * hospital/system admin) manage all units in their scope.
 */
@Injectable()
export class UnitScopeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Is this role a strict single-unit role? Only FIELD_SUPERVISOR for now. */
  isStrictlyUnitScopedRole(role: string | undefined | null): boolean {
    if (!role) return false;
    return role === 'field_supervisor';
  }

  /**
   * Whether the user is strictly single-unit scoped, considering BOTH the legacy
   * User.role AND the RBAC assignment (source of truth: a FIELD_SUPERVISOR via
   * RBAC is strictly unit-scoped even when the legacy role column differs).
   */
  isStrictlyUnitScoped(user: ScopeUser): boolean {
    return this.isStrictlyUnitScopedRole(user?.role) || this.hasFieldSupervisorRbac(user);
  }

  private hasFieldSupervisorRbac(user: ScopeUser): boolean {
    return (user?.rbacRoles ?? []).some((r) => r.roleName === 'FIELD_SUPERVISOR');
  }

  /** Resolve the effective unit+org scope for an authenticated user. */
  async resolveScope(user: ScopeUser): Promise<ResolvedScope> {
    const role = user?.role ?? null;

    if (this.isStrictlyUnitScoped(user)) {
      const unitId = user?.unitId ?? this.pickUnitFromRbacRoles(user);
      return { strictUnitId: unitId, organizationId: user?.organizationId ?? null, role: 'field_supervisor' };
    }

    return { strictUnitId: null, organizationId: user?.organizationId ?? null, role: role ?? '' };
  }

  private pickUnitFromRbacRoles(user: ScopeUser): string | null {
    const fieldRole = (user?.rbacRoles ?? []).find((r) => r.roleName === 'FIELD_SUPERVISOR');
    return (fieldRole?.unitId) || user?.unitId || null;
  }

  /**
   * Phase 5C.20 SEC-02: explicit platform-wide system admin.
   *
   * Mirrors the "globalSystemAdmin" representation already used by the RBAC
   * service (level >= SYSTEM_ADMIN via ROLE_LEVELS.SYSTEM_ADMIN with a NULL
   * organizationId assignment). A legacy `system_admin`/`super_admin` account
   * with a NULL organization is treated the same way. This is the ONLY
   * unresolved-tenant exception to the fail-closed rule.
   */
  private isExplicitGlobalSystemAdmin(user: ScopeUser): boolean {
    const legacyPlatformRole = user?.role === 'system_admin' || user?.role === 'super_admin';
    if (legacyPlatformRole) return true;
    return (user?.rbacRoles ?? []).some(
      (r) => r.roleName === 'SYSTEM_ADMIN' && r.organizationId == null,
    );
  }

  /**
   * Phase 5C.20 SEC-02: unit-access authorization entry point.
   *
   * Returns true if the user may operate on the given targetUnitId within the
   * given target organization.
   * - Fail closed: a NULL/undefined user organization never grants unit access,
   *   except for an explicitly platform-scoped SYSTEM_ADMIN (see above).
   * - Same-org enforcement: when both organizations are known and differ,
   *   access is denied (cross-tenant => false).
   * - Strictly unit-scoped users must match the target unit exactly (cross-unit => false).
   * - Non-unit-scoped roles may manage any unit in the tenant.
   */
  async canAccessUnit(
    user: ScopeUser,
    targetUnitId?: string | null,
    targetOrganizationId?: string | null,
  ): Promise<boolean> {
    const scope = await this.resolveScope(user);

    // Phase 5C.20 SEC-02: a NULL/undefined user organization must NEVER grant
    // unit access (fail closed). The only exception is an explicitly
    // platform-scoped SYSTEM_ADMIN (see isExplicitGlobalSystemAdmin above).
    // This closes the previous fail-open where a NULL-org SUPERVISOR (or a
    // NULL-org FIELD_SUPERVISOR with a matching unit) passed the same-org check
    // by omission and fell through to an allow.
    if (scope.organizationId == null) {
      return this.isExplicitGlobalSystemAdmin(user);
    }

    if (targetOrganizationId && scope.organizationId && targetOrganizationId !== scope.organizationId) {
      return false;
    }

    if (!this.isStrictlyUnitScoped(user)) {
      return true;
    }

    if (!scope.strictUnitId) {
      return false;
    }

    if (!targetUnitId) {
      return true;
    }

    return targetUnitId === scope.strictUnitId;
  }

  /**
   * Resolve the effective READ scope (filtering unit + org) for a user.
   *
   * This is the SINGLE SOURCE OF TRUTH used by list endpoints (GET /schedules,
   * GET /personnel) to confine unit-scoped roles to their assigned unit.
   *
   * - FIELD_SUPERVISOR (saha sorumlusu): confined to the unit from their RBAC
   *   assignment (or legacy user.unitId fallback). Sibling unit reads are DENY.
   * - Legacy unit engineers (medical_engineer, senior_technician): keep their
   *   legacy unit confinement via user.unitId when present.
   * - SUPERVISOR and above / all other roles: NOT unit confined (org scope only).
   */
  async resolveReadScope(user: ScopeUser): Promise<{ unitId: string | null; organizationId: string | null; denyAll: boolean }> {
    const scope = await this.resolveScope(user);

    if (scope.strictUnitId) {
      return { unitId: scope.strictUnitId, organizationId: scope.organizationId, denyAll: false };
    }

    if (this.isLegacyUnitEngineer(user?.role) && user?.unitId) {
      return { unitId: user.unitId, organizationId: user.organizationId ?? null, denyAll: false };
    }

    // A strictly unit-scoped actor (field supervisor) with no resolvable unit MUST
    // NOT see sibling/all units: deny the whole list (fail closed).
    if (this.isStrictlyUnitScoped(user)) {
      return { unitId: null, organizationId: user?.organizationId ?? null, denyAll: true };
    }

    return { unitId: null, organizationId: user?.organizationId ?? null, denyAll: false };
  }

  /** Legacy unit-comfined engineering roles kept for list-read parity. */
  private isLegacyUnitEngineer(role?: string | null): boolean {
    return role === 'medical_engineer' || role === 'senior_technician';
  }

  /** Resolve an entity's unitId from the database by id, for the given entity type. */
  async resolveTargetUnitId(
    entityType: 'personnel' | 'schedule' | 'device' | 'assignment' | 'swap',
    id: string,
  ): Promise<string | null> {
    switch (entityType) {
      case 'personnel': {
        const p = await this.prisma.personnel.findUnique({ where: { id }, select: { unitId: true } });
        return p?.unitId ?? null;
      }
      case 'schedule': {
        const s = await this.prisma.schedule.findUnique({ where: { id }, select: { unitId: true } });
        return s?.unitId ?? null;
      }
      case 'device': {
        const d = await this.prisma.device.findUnique({ where: { id }, select: { unitId: true } });
        return d?.unitId ?? null;
      }
      case 'assignment': {
        const a = await this.prisma.assignment.findUnique({ where: { id }, select: { unitId: true, scheduleId: true } });
        if (a?.unitId) return a.unitId;
        if (a?.scheduleId) {
          const s = await this.prisma.schedule.findUnique({ where: { id: a.scheduleId }, select: { unitId: true } });
          return s?.unitId ?? null;
        }
        return null;
      }
      case 'swap': {
        const sr = await this.prisma.swapRequest.findUnique({
          where: { id },
          select: { requesterId: true },
        });
        if (!sr) return null;
        const p = await this.prisma.personnel.findUnique({ where: { id: sr.requesterId }, select: { unitId: true } });
        return p?.unitId ?? null;
      }
      default:
        return null;
    }
  }

  /**
   * Resolve an entity's target unit AND organization by id. Used by write
   * endpoints (e.g. device-status) to enforce cross-unit and cross-org scope
   * against a client-supplied entity id BEFORE mutating.
   */
  async resolveTargetScope(
    entityType: 'personnel' | 'schedule' | 'device' | 'assignment' | 'swap',
    id: string,
  ): Promise<{ unitId: string; organizationId: string | null } | null> {
    const unitId = await this.resolveTargetUnitId(entityType, id);
    if (!unitId) return null;
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      select: { organizationId: true },
    });
    return { unitId, organizationId: unit?.organizationId ?? null };
  }

  /** Max RBAC level helper for the guard. */
  maxLevel(user: ScopeUser): number {
    if (!user?.rbacRoles?.length) return 0;
    return Math.max(
      0,
      ...user.rbacRoles.map((r) => ROLE_LEVELS[r.roleName as RbacRoleName] ?? 0),
    );
  }
}
