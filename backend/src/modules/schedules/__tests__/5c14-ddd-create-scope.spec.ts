import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SchedulesDDDController } from '../schedules-ddd.controller';
import { UNIT_SCOPE_KEY } from '../../rbac/decorators/unit-scope.decorator';
import { UnitScopeGuard } from '../../rbac/guards/unit-scope.guard';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { AUDIT_METADATA_KEY } from '../../audit-log/audit.constants';
import { MinRole } from '../../../guards/min-role';

const GUARDS_KEY = '__guards__';
const ROLES_KEY = 'roles';

const ORG = 'org-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';
const UNIT_FOREIGN = 'unit-foreign';

const fsA = { id: 'u1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
const fsNull = { id: 'u2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
const sup = { id: 'u3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };

/**
 * Phase 5C.14 — SEC-3: POST /schedules-ddd scope enforcement.
 *
 * The create route must declare a backend-authoritative target-unit contract
 * (@UnitScope(unitBodyField)) and mount UnitScopeGuard; the guard must confine
 * a saha sorumlusu to his assigned unit and deny every role cross-org, with a
 * NULL unit assignment failing CLOSED.
 */
describe('Phase 5C.14 — SEC-3: DDD schedule create scope enforcement', () => {
  const mockPrisma: any = {
    unit: {
      findUnique: vi.fn(async ({ where }: any) => {
        if (where.id === UNIT_A) return { id: UNIT_A, organizationId: ORG };
        if (where.id === UNIT_B) return { id: UNIT_B, organizationId: ORG };
        if (where.id === UNIT_FOREIGN) return { id: UNIT_FOREIGN, organizationId: 'foreign-org' };
        return null;
      }),
      findFirst: vi.fn(async () => null),
    },
  };

  const host = (user: any, body: any, params: any = {}) => ({
    getHandler: () => SchedulesDDDController.prototype.create,
    getClass: () => SchedulesDDDController,
    switchToHttp: () => ({ getRequest: () => ({ user, body, params }) }),
  });

  const reflector: any = {
    getAllAndOverride: vi.fn(() => ({ unitBodyField: 'unitId' })),
  };

  let unitScopeService: UnitScopeService;

  beforeEach(() => {
    vi.clearAllMocks();
    unitScopeService = new UnitScopeService(mockPrisma as any);
  });

  describe('route contract', () => {
    it('declares @UnitScope({ unitBodyField: "unitId" }) on POST /schedules-ddd', () => {
      const scope = Reflect.getMetadata(UNIT_SCOPE_KEY, SchedulesDDDController.prototype.create);
      expect(scope).toEqual({ unitBodyField: 'unitId' });
    });

    it('mounts UnitScopeGuard on the create route', () => {
      const guards = Reflect.getMetadata(GUARDS_KEY, SchedulesDDDController.prototype.create) ?? [];
      expect(guards).toContain(UnitScopeGuard);
    });

    it('requires SUPERVISOR+ level and audits the create', () => {
      const roles: string[] = Reflect.getMetadata(ROLES_KEY, SchedulesDDDController.prototype.create) ?? [];
      expect(roles).toContain(MinRole.SUPERVISOR);
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, SchedulesDDDController.prototype.create)).toMatchObject({
        action: 'SCHEDULE_CREATED',
        entityType: 'schedule',
      });
    });
  });

  describe('UnitScopeGuard behavior', () => {
    it('allows a saha sorumlusu targeting his OWN unit', async () => {
      const guard = new UnitScopeGuard(reflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(fsA, { unitId: UNIT_A }) as any)).resolves.toBe(true);
    });

    it('DENIES a saha sorumlusu targeting ANY other unit', async () => {
      const guard = new UnitScopeGuard(reflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(fsA, { unitId: UNIT_B }) as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('fails CLOSED when a strictly unit-scoped actor cannot resolve a target unit', async () => {
      const guard = new UnitScopeGuard(reflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(fsNull, {}) as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('denies cross-ORGANIZATION access for supervisors', async () => {
      const guard = new UnitScopeGuard(reflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(sup, { unitId: UNIT_FOREIGN }) as any)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows supervisors to target any unit within the same org', async () => {
      const guard = new UnitScopeGuard(reflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(sup, { unitId: UNIT_B }) as any)).resolves.toBe(true);
    });

    it('passes through routes that declare no @UnitScope contract', async () => {
      const noScopeReflector: any = { getAllAndOverride: vi.fn(() => undefined) };
      const guard = new UnitScopeGuard(noScopeReflector as any, unitScopeService, mockPrisma as any);
      await expect(guard.canActivate(host(fsA, { unitId: UNIT_B }) as any)).resolves.toBe(true);
    });
  });
});