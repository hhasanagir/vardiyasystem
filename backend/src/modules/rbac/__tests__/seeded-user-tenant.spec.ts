import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { UnitType, UserRole } from '@prisma/client';
import { seedUserTenant, SEED_UNIT_FOR_ROLE } from '../../../seed.service';
import { isCrossTenantRole, CROSS_TENANT_ROLES } from '../interfaces/rbac.types';

const UNITS = new Map<UnitType, { id: string; organizationId: string | null }>([
  [UnitType.supervizor, { id: 'unit-supervizor', organizationId: 'org-1' }],
  [UnitType.mr, { id: 'unit-mr', organizationId: 'org-1' }],
]);

/**
 * A seeded user row without an organization is not a cosmetic gap:
 * `TenantContextInterceptor` derives the tenant from `user.organizationId` and
 * `TenantMiddleware` can only inject a predicate when one exists, so a tenant
 * role with a NULL organization silently reads and writes across every tenant.
 * These tests pin the seed rule that prevents that, and the role classification
 * the interceptor's fail-closed guard relies on.
 */
describe('seeded users carry a tenant', () => {
  describe('cross-tenant roles stay unscoped BY DESIGN', () => {
    it.each([UserRole.system_admin, UserRole.hospital_admin])('%s resolves to no unit and no organization', (role) => {
      expect(isCrossTenantRole(role)).toBe(true);
      expect(seedUserTenant({ role }, UNITS)).toEqual({ unitId: null, organizationId: null });
    });

    it('covers exactly the two cross-tenant roles', () => {
      expect([...CROSS_TENANT_ROLES].sort()).toEqual(['hospital_admin', 'system_admin']);
    });
  });

  describe('every tenant-scoped role resolves to a real unit and its organization', () => {
    const tenantRoles = Object.values(UserRole).filter((role) => !isCrossTenantRole(role));

    it('covers the whole UserRole enum', () => {
      // Guards against a newly added role silently shipping without a unit.
      expect(tenantRoles.length).toBe(Object.values(UserRole).length - CROSS_TENANT_ROLES.size);
    });

    it.each(tenantRoles)('%s has a seeded unit type', (role) => {
      expect(SEED_UNIT_FOR_ROLE[role]).toBeDefined();
    });

    it.each(tenantRoles)('%s resolves to a unit and the organization OF THAT UNIT', (role) => {
      const expectedUnit = UNITS.get(SEED_UNIT_FOR_ROLE[role]!);
      expect(seedUserTenant({ role }, UNITS)).toEqual({
        unitId: expectedUnit!.id,
        organizationId: expectedUnit!.organizationId,
      });
    });
  });

  describe('the organization is never invented', () => {
    it('returns no tenant when the unit type does not exist in this deployment', () => {
      const empty = new Map<UnitType, { id: string; organizationId: string | null }>();
      expect(seedUserTenant({ role: UserRole.technician }, empty)).toEqual({
        unitId: null,
        organizationId: null,
      });
    });

    it('keeps the unit but never invents an organization, leaving the guard to refuse the account', () => {
      const orphaned = new Map<UnitType, { id: string; organizationId: string | null }>([
        [UnitType.supervizor, { id: 'unit-x', organizationId: null }],
      ]);
      // The unit assignment is still true, so it is written; the organization
      // stays NULL because it is derived, never guessed. Such an account is
      // stopped by `TenantContextInterceptor` (TENANT_CONTEXT_MISSING) instead
      // of silently querying every tenant.
      expect(seedUserTenant({ role: UserRole.supervisor }, orphaned)).toEqual({
        unitId: 'unit-x',
        organizationId: null,
      });
    });

    it('an explicit unitType overrides the role default', () => {
      expect(seedUserTenant({ role: UserRole.technician, unitType: UnitType.supervizor }, UNITS)).toEqual({
        unitId: 'unit-supervizor',
        organizationId: 'org-1',
      });
    });
  });

  describe('isCrossTenantRole is strict about unknown input', () => {
    it.each([null, undefined, '', 'not_a_role', 'technician', 'supervisor'])(
      'refuses to treat %s as cross-tenant',
      (role) => {
        expect(isCrossTenantRole(role)).toBe(false);
      },
    );
  });
});
