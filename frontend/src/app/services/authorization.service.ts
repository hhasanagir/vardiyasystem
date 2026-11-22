import { Injectable, inject } from '@angular/core';
import { RbacService } from './rbac.service';
import { AuthService } from './auth.service';
import { hasMinRole } from '../shared/utils/role-hierarchy';

/**
 * Frontend authorization facade — DEFENSE IN DEPTH only.
 *
 * The backend is ALWAYS the authoritative source for authorization decisions.
 * Never treat a client-supplied organizationId/unitId/role/permission as
 * trustworthy for a security decision; use these helpers only to shape UX
 * (show/hide actions, route gating) and to fail closed before calling the API.
 *
 * RBAC assignments (loaded from /rbac/me/permissions) take precedence over the
 * legacy user.role. When they conflict, RBAC wins.
 */
@Injectable({ providedIn: 'root' })
export class AuthorizationService {
  private readonly rbac = inject(RbacService);
  private readonly auth = inject(AuthService);

  /** Whether the actor holds a given RBAC permission (permission name, e.g. "schedule.update"). */
  can(permission: string): boolean {
    return this.rbac.hasPermission(permission);
  }

  /** Whether the actor holds ANY of the given permissions. */
  canAny(permissions: string[]): boolean {
    return this.rbac.hasAnyPermission(permissions);
  }

  /** Whether the actor holds ALL of the given permissions. */
  canAll(permissions: string[]): boolean {
    return this.rbac.hasAllPermissions(permissions);
  }

  /**
   * Whether the actor may manage the given plan unit. For a field supervisor
   * this restricts to their assigned unit (fail closed). Returns a Promise
   * because unit resolution may hit the API once.
   */
  async canManageUnit(unitType: string): Promise<boolean> {
    await this.rbac.ensureLoaded();
    if (!this.isFieldSupervisor()) return true;
    const ownType = await this.rbac.getFieldSupervisorUnitType();
    return !!ownType && ownType === unitType;
  }

  /** Whether the actor is a SUPERVISOR (org-scoped, all radiology units). */
  isSupervisor(): boolean {
    return this.rbac.hasRole('SUPERVISOR') || hasMinRole(this.auth.user()?.role || '', 'supervisor');
  }

  /** Whether the actor is a FIELD_SUPERVISOR (SAHA SORUMLUSU, single-unit). */
  isFieldSupervisor(): boolean {
    return this.rbac.isFieldSupervisor() || this.auth.user()?.role === 'field_supervisor';
  }

  /** True for any operationally-elevated role (supervisor or above). */
  isOperationsLead(): boolean {
    return this.isSupervisor() || this.isFieldSupervisor();
  }

  /** The single unit id the field supervisor is scoped to (undefined otherwise). */
  getScopedUnit(): string | undefined {
    return this.rbac.fieldSupervisorUnitId();
  }

  /** Resolve the field supervisor's plan unit type (mr/bt/...) or undefined. */
  getScopedUnitType(): Promise<string | undefined> {
    return this.rbac.getFieldSupervisorUnitType();
  }

  /** Organization id from the authenticated principal (legacy user). */
  getOrganization(): string | null {
    return this.auth.user()?.organizationId ?? null;
  }

  /**
   * Whether the actor may perform a given mutation on a resource.
   * Pure UX/defense-in-depth helper; the backend enforces the real decision.
   * When the exact permission name is unknown, fall back to role floors so the
   * UI is not overly restrictive for legitimate operators.
   */
  canMutate(resource: string, action: string): boolean {
    const permissionMap: Record<string, Record<string, string>> = {
      schedule: {
        create: 'schedule.create',
        update: 'schedule.update',
        submit: 'schedule.submit',
        approve: 'schedule.approve',
        publish: 'schedule.publish',
        override: 'schedule.override',
        export: 'schedule.export',
        generate: 'schedule.generate',
      },
      swap: {
        create: 'swap.create',
        approve: 'swap.approve',
        reject: 'swap.reject',
      },
      device: {
        off: 'device.manage',
        update: 'device.update',
      },
      personnel: {
        create: 'personnel.create',
        update: 'personnel.update',
        delete: 'personnel.delete',
      },
      unit: {
        create: 'unit.create',
        update: 'unit.update',
      },
      audit: {
        flag: 'audit.flag',
      },
    };

    const permission = permissionMap[resource]?.[action];
    if (permission) return this.rbac.hasPermission(permission);

    // Fallback role floors (defense-in-depth only).
    switch (resource) {
      case 'schedule':
      case 'device':
      case 'swap':
        return this.isOperationsLead();
      default:
        return false;
    }
  }
}
