import { Injectable, signal, inject, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../environments';
import { AuthService } from './auth.service';

/** Maps a unit code to the plan route unit type (source of truth for frontend routing). */
export const UNIT_TYPE_BY_CODE: Record<string, string> = {
  MR: 'mr',
  BT: 'bt',
  RONTGEN: 'rontgen',
  NUKLEER: 'nukleer',
  RONK: 'onkoloji',
  SUPERVIZOR: 'supervizor',
};

export interface RbacRoleInfo {
  roleId: string;
  roleName: string;
  scope: string;
  organizationId?: string | null;
  unitId?: string | null;
}

export interface RbacPermissionsResponse {
  permissions: string[];
  rbacRoles: RbacRoleInfo[];
}

interface UnitLite {
  id: string;
  code: string;
  type: string;
}

@Injectable({ providedIn: 'root' })
export class RbacService {
  private readonly apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  private permissions = signal<string[]>([]);
  private rbacRoles = signal<RbacRoleInfo[]>([]);
  private loaded = signal(false);
  private loadPromise: Promise<void> | null = null;
  private unitsCache: UnitLite[] | null = null;
  private unitsPromise: Promise<UnitLite[]> | null = null;

  readonly hasAnyRole = computed(() => this.rbacRoles().length > 0);

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.ensureLoaded();
    }
  }

  /**
   * Loads the permission set once. Concurrent callers share the in-flight
   * request instead of returning early: a guard that resolved while the load
   * was still running saw an empty permission set and bounced the user off a
   * page they are entitled to.
   */
  async ensureLoaded(): Promise<void> {
    if (this.loaded()) return;
    if (!this.loadPromise) {
      this.loadPromise = firstValueFrom(
        this.http.get<RbacPermissionsResponse>(`${this.apiUrl}/rbac/me/permissions`)
      )
        .then((res) => {
          this.permissions.set(res.permissions ?? []);
          this.rbacRoles.set(res.rbacRoles ?? []);
        })
        .catch(() => {
          // Fail closed: a failed load grants nothing.
          this.permissions.set([]);
          this.rbacRoles.set([]);
        })
        .finally(() => {
          this.loaded.set(true);
          this.loadPromise = null;
        });
    }
    return this.loadPromise;
  }

  hasPermission(permission: string): boolean {
    return this.permissions().includes(permission);
  }

  hasAllPermissions(permissions: string[]): boolean {
    return permissions.every(p => this.permissions().includes(p));
  }

  hasAnyPermission(permissions: string[]): boolean {
    return permissions.some(p => this.permissions().includes(p));
  }

  hasRole(roleName: string): boolean {
    return this.rbacRoles().some(r => r.roleName === roleName);
  }

  hasAnyOfRoles(roleNames: string[]): boolean {
    return roleNames.some(rn => this.rbacRoles().some(r => r.roleName === rn));
  }

  /** Whether the current actor is a field supervisor per the RBAC assignment. */
  isFieldSupervisor(): boolean {
    return this.hasRole('FIELD_SUPERVISOR');
  }

  /** The RBAC-assigned unit id of a field supervisor (empty when not assigned). */
  fieldSupervisorUnitId(): string | undefined {
    if (!this.isFieldSupervisor()) return undefined;
    const role = this.rbacRoles().find(r => r.roleName === 'FIELD_SUPERVISOR');
    return role?.unitId || undefined;
  }

  private loadUnits(): Promise<UnitLite[]> {
    if (this.unitsCache) return Promise.resolve(this.unitsCache);
    // Same rule as ensureLoaded: share the request, never hand back an empty
    // list to a caller that arrived while the load was in flight.
    if (!this.unitsPromise) {
      this.unitsPromise = firstValueFrom(this.http.get<UnitLite[]>(`${this.apiUrl}/units`))
        .then((units) => {
          this.unitsCache = Array.isArray(units) ? units : [];
          return this.unitsCache;
        })
        .catch(() => {
          this.unitsCache = [];
          return this.unitsCache;
        })
        .finally(() => {
          this.unitsPromise = null;
        });
    }
    return this.unitsPromise;
  }

  /**
   * Resolve the field supervisor's assigned plan unit type (mr/bt/... ) by
   * mapping their RBAC unit assignment to a unit code/type. Returns undefined
   * when the assignment cannot be resolved (callers should fail closed).
   */
  async getFieldSupervisorUnitType(): Promise<string | undefined> {
    await this.ensureLoaded();
    const unitId = this.fieldSupervisorUnitId();
    if (!unitId) {
      return this.authUserFieldUnitTypeFromLegacy();
    }
    if (!this.unitsCache) await this.loadUnits();
    const unit = this.unitsCache?.find(u => u.id === unitId);    if (unit?.type) return unit.type.toLowerCase();
    if (unit?.code) return UNIT_TYPE_BY_CODE[unit.code.trim().toUpperCase()];
    return undefined;
  }

  /**
   * Resolve a plan unit type from a schedule's unitId (unit UUID, unit code or a
   * legacy plan unit-type code). Returns undefined when it cannot be resolved so
   * callers can fail closed instead of guessing.
   */
  async resolveUnitTypeById(unitId: string): Promise<string | undefined> {
    await this.ensureLoaded();
    if (!unitId) return undefined;

    await this.loadUnits();
    const needle = unitId.trim().toLowerCase();
    const unit = this.unitsCache?.find(
      u => u.id.toLowerCase() === needle || u.code.trim().toLowerCase() === needle,
    );
    if (unit?.type) return unit.type.toLowerCase();
    if (unit?.code) return UNIT_TYPE_BY_CODE[unit.code.trim().toUpperCase()];

    // Legacy DDD schedules carry the plan unit-type code directly in unitId.
    const direct = new Set<string>(Object.values(UNIT_TYPE_BY_CODE));
    return direct.has(needle) ? needle : undefined;
  }

  /** Fallback: derive the unit type from the legacy user.unit.code when present. */
  private authUserFieldUnitTypeFromLegacy(): string | undefined {
    const unit = this.auth.user()?.unit;
    if (!unit?.code) return undefined;
    return UNIT_TYPE_BY_CODE[unit.code.trim().toUpperCase()];
  }

  /**
   * Whether the current field supervisor owns the given plan unit type.
   * Fails closed (denies) when the assignment cannot be resolved.
   */
  async canFieldSupervisorAccessUnit(unitType: string): Promise<boolean> {
    if (!this.isFieldSupervisor()) return true;
    const ownType = await this.getFieldSupervisorUnitType();
    return !!ownType && ownType === unitType;
  }

  reset(): void {
    this.permissions.set([]);
    this.rbacRoles.set([]);
    this.loaded.set(false);
  }
}
