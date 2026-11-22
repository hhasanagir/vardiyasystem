import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuthorizationService } from '../authorization.service';
import { RbacService } from '../rbac.service';
import { AuthService } from '../auth.service';

function makeRbacMock(overrides: Partial<Record<keyof RbacService, unknown>> = {}): Partial<RbacService> {
  return {
    hasPermission: vi.fn(() => false),
    hasAnyPermission: vi.fn(() => false),
    hasAllPermissions: vi.fn(() => false),
    hasRole: vi.fn(() => false),
    isFieldSupervisor: vi.fn(() => false),
    fieldSupervisorUnitId: vi.fn(() => undefined),
    getFieldSupervisorUnitType: vi.fn(() => Promise.resolve(undefined)),
    ensureLoaded: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

function makeAuthMock(role: string | null): Partial<AuthService> {
  return {
    user: () =>
      role
        ? ({ role, organizationId: 'org-1', unit: null } as any)
        : null,
  } as any;
}

const fieldSupervisorFlow = [
  { role: 'FIELD_SUPERVISOR', unitId: 'unit-mr' },
  { role: 'SUPERVISOR', unitId: null },
];

/** Build an AuthorizationService around a mock RbacService. */
function buildAuthz(rbac: Partial<RbacService>, auth: Partial<AuthService>): AuthorizationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [HttpClientTestingModule],
    providers: [
      { provide: RbacService, useValue: rbac },
      { provide: AuthService, useValue: auth },
      AuthorizationService,
    ],
  });
  return TestBed.inject(AuthorizationService);
}

describe('AuthorizationService (defense-in-depth facade)', () => {
  describe('Supervisor ≠ Field Supervisor', () => {
    it('distinguishes a SUPERVISOR from a FIELD_SUPERVISOR', () => {
      const supRbac = makeRbacMock({ hasRole: vi.fn(rn => rn === 'SUPERVISOR') });
      const sup = buildAuthz(supRbac, makeAuthMock('supervisor'));
      expect(sup.isSupervisor()).toBe(true);
      expect(sup.isFieldSupervisor()).toBe(false);

      const fsRbac = makeRbacMock({ hasRole: vi.fn(rn => rn === 'FIELD_SUPERVISOR'), isFieldSupervisor: vi.fn(() => true) });
      const fs = buildAuthz(fsRbac, makeAuthMock('field_supervisor'));
      expect(fs.isFieldSupervisor()).toBe(true);
      expect(fs.isSupervisor()).toBe(false);
    });
  });

  describe('Field Supervisor single-unit scope', () => {
    it('allows management of the assigned unit only', async () => {
      const rbac = makeRbacMock({
        isFieldSupervisor: vi.fn(() => true),
        fieldSupervisorUnitId: vi.fn(() => 'unit-mr'),
        getFieldSupervisorUnitType: vi.fn(() => Promise.resolve('mr')),
      });
      const rbacService = rbac as RbacService;
      const fs = buildAuthz(rbacService, makeAuthMock('field_supervisor'));
      expect(await fs.canManageUnit('mr')).toBe(true);
      expect(await fs.canManageUnit('bt')).toBe(false);
    });

    it('fails closed when the assignment resolves to a null/unknown unit', async () => {
      const rbac = makeRbacMock({
        isFieldSupervisor: vi.fn(() => true),
        fieldSupervisorUnitId: vi.fn(() => undefined),
        getFieldSupervisorUnitType: vi.fn(() => Promise.resolve(undefined)),
      });
      const rbacService = rbac as RbacService;
      const fs = buildAuthz(rbacService, makeAuthMock('field_supervisor'));
      expect(await fs.canManageUnit('mr')).toBe(false);
    });
  });

  describe('Supervisor org-wide', () => {
    it('may manage any unit within the organization', async () => {
      const rbac = makeRbacMock({ hasRole: vi.fn(rn => rn === 'SUPERVISOR') });
      const sup = buildAuthz(rbac, makeAuthMock('supervisor'));
      expect(await sup.canManageUnit('mr')).toBe(true);
      expect(await sup.canManageUnit('onkoloji')).toBe(true);
    });
  });

  describe('canMutate (defense-in-depth gate)', () => {
    it('uses the RBAC permission when available', () => {
      const rbac = makeRbacMock({ hasPermission: vi.fn(p => p === 'schedule.update') });
      const authz = buildAuthz(rbac, makeAuthMock('supervisor'));
      expect(authz.canMutate('schedule', 'update')).toBe(true);
      expect(authz.canMutate('schedule', 'publish')).toBe(false);
    });

    it('gates device.off behind the device.manage RBAC permission', () => {
      const granted = buildAuthz(makeRbacMock({ hasPermission: vi.fn(p => p === 'device.manage') }), makeAuthMock('supervisor'));
      expect(granted.canMutate('device', 'off')).toBe(true);
      const denied = buildAuthz(makeRbacMock(), makeAuthMock('supervisor'));
      expect(denied.canMutate('device', 'off')).toBe(false);
    });

    it('falls back to the operation-lead floor when no permission mapping exists', () => {
      const sup = buildAuthz(makeRbacMock(), makeAuthMock('supervisor'));
      expect(sup.canMutate('swap', 'publish')).toBe(true);
      const fsRbac = makeRbacMock({ isFieldSupervisor: vi.fn(() => true) });
      expect(buildAuthz(fsRbac, makeAuthMock('field_supervisor')).canMutate('swap', 'publish')).toBe(true);
      expect(buildAuthz(makeRbacMock(), makeAuthMock('technician')).canMutate('swap', 'publish')).toBe(false);
    });
  });

  describe('getOrganization / getScopedUnit', () => {
    it('surfaces the authenticated principal organization', () => {
      const authz = buildAuthz(makeRbacMock(), makeAuthMock('supervisor'));
      expect(authz.getOrganization()).toBe('org-1');
    });

    it('returns the RBAC-assigned unit for a field supervisor', () => {
      const rbac = makeRbacMock({ fieldSupervisorUnitId: vi.fn(() => 'unit-mr') });
      const authz = buildAuthz(rbac, makeAuthMock('field_supervisor'));
      expect(authz.getScopedUnit()).toBe('unit-mr');
    });
  });

  it('falls back to the legacy supervisor role while RBAC is silent, then RBAC wins once assigned', () => {
    // RBAC has loaded no roles yet: the legacy supervisor keeps the facade usable.
    const silent = buildAuthz(makeRbacMock(), makeAuthMock('supervisor'));
    expect(silent.isSupervisor()).toBe(true);
    // RBAC FIELD_SUPERVISOR wins over the legacy technician role.
    const fsRbac = makeRbacMock({ isFieldSupervisor: vi.fn(() => true) });
    const fs = buildAuthz(fsRbac, makeAuthMock('technician'));
    expect(fs.isFieldSupervisor()).toBe(true);
    // SUPERVISOR and FIELD_SUPERVISOR are never merged.
    expect(fs.isSupervisor()).toBe(false);
  });

  it('exposes the supervisor vs field-supervisor flow constants (no role merge)', () => {
    expect(fieldSupervisorFlow[0].role).toBe('FIELD_SUPERVISOR');
    expect(fieldSupervisorFlow[1].role).toBe('SUPERVISOR');
    expect(fieldSupervisorFlow[0].role).not.toBe(fieldSupervisorFlow[1].role);
  });
});
