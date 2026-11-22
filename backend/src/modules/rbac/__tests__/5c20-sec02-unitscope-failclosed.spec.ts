import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnitScopeService } from '../services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.20 — SEC-02 canAccessUnit NULL-org fail-open.
 *
 * A NULL/undefined user organization must never produce an authorization
 * success for unit access. SUPERVISOR stays organization-scoped,
 * FIELD_SUPERVISOR stays strictly single-unit scoped, cross-tenant units are
 * always denied, and the ONLY unresolved-org path that may succeed is an
 * explicitly platform-scoped SYSTEM_ADMIN (legacy system_admin or a null-org
 * SYSTEM_ADMIN RBAC assignment — the RBAC model's "globalSystemAdmin").
 */
describe('Phase 5C.20 SEC-02 — unit-scope fail-closed on unresolved org', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const UNIT = {
    mr: '71a3fe39-8c0f-4573-a50b-966a376c04f8',
    bt: '079400fa-e937-40d2-8cb9-03725e6f17a0',
  };

  let service: UnitScopeService;

  beforeEach(async () => {
    const mockPrisma: any = { unit: { findUnique: vi.fn(), findFirst: vi.fn() } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UnitScopeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(UnitScopeService);
  });

  const user = (
    role: string,
    unitId: string | null,
    organizationId?: string | null,
    rbacRoles: any[] = [],
  ) => ({
    id: 'u-' + role,
    role,
    unitId,
    organizationId: organizationId === undefined ? ORG : organizationId,
    rbacRoles,
  });

  it('SUPERVISOR same-org unit -> ALLOWED', async () => {
    const sup = user('supervisor', null, ORG);
    expect(await service.canAccessUnit(sup, UNIT.mr, ORG)).toBe(true);
  });

  it('SUPERVISOR different-org unit -> DENIED', async () => {
    const sup = user('supervisor', null, ORG);
    expect(await service.canAccessUnit(sup, UNIT.mr, OTHER_ORG)).toBe(false);
  });

  it('SUPERVISOR null org -> DENIED', async () => {
    const supNull = user('supervisor', null, null);
    expect(await service.canAccessUnit(supNull, UNIT.mr, ORG)).toBe(false);
    expect(await service.canAccessUnit(supNull, UNIT.mr)).toBe(false);
  });

  it('FIELD_SUPERVISOR same unit -> ALLOWED', async () => {
    const fs = user('field_supervisor', UNIT.mr, ORG);
    expect(await service.canAccessUnit(fs, UNIT.mr, ORG)).toBe(true);
  });

  it('FIELD_SUPERVISOR sibling unit -> DENIED', async () => {
    const fs = user('field_supervisor', UNIT.mr, ORG);
    expect(await service.canAccessUnit(fs, UNIT.bt, ORG)).toBe(false);
  });

  it('FIELD_SUPERVISOR different org -> DENIED', async () => {
    const fs = user('field_supervisor', UNIT.mr, ORG);
    expect(await service.canAccessUnit(fs, UNIT.mr, OTHER_ORG)).toBe(false);
  });

  it('FIELD_SUPERVISOR null org -> DENIED even for the assigned unit', async () => {
    const fsNull = user('field_supervisor', UNIT.mr, null);
    expect(await service.canAccessUnit(fsNull, UNIT.mr, ORG)).toBe(false);
    expect(await service.canAccessUnit(fsNull, UNIT.mr)).toBe(false);
  });

  it('unknown/nonexistent unit -> DENIED for strictly unit-scoped role', async () => {
    const fs = user('field_supervisor', UNIT.mr, ORG);
    const unknown = 'ffffffff-0000-0000-0000-000000000000';
    expect(await service.canAccessUnit(fs, unknown, ORG)).toBe(false);
  });

  it('unresolved user organization -> DENIED (no role, no rbac, no org)', async () => {
    const unresolved = { id: 'u-x', role: 'supervisor', unitId: null, organizationId: null, rbacRoles: [] };
    expect(await service.canAccessUnit(unresolved, UNIT.mr, ORG)).toBe(false);
    expect(await service.canAccessUnit(unresolved, UNIT.mr)).toBe(false);
  });

  it('no cross-tenant access path: supervisor AND field_supervisor foreign org denied', async () => {
    const sup = user('supervisor', null, ORG);
    const fs = user('field_supervisor', UNIT.mr, ORG);
    expect(await service.canAccessUnit(sup, UNIT.bt, OTHER_ORG)).toBe(false);
    expect(await service.canAccessUnit(fs, UNIT.bt, OTHER_ORG)).toBe(false);
  });

  it('explicit platform SYSTEM_ADMIN (null-org RBAC assignment) preserves cross-tenant unit access', async () => {
    const platformAdmin = user('system_admin', null, null, [
      { roleName: 'SYSTEM_ADMIN', unitId: null, organizationId: null },
    ]);
    expect(await service.canAccessUnit(platformAdmin, UNIT.mr, ORG)).toBe(true);
    expect(await service.canAccessUnit(platformAdmin, UNIT.bt, OTHER_ORG)).toBe(true);
  });

  it('legacy system_admin with null org preserves unit access (platform admin)', async () => {
    const legacyAdmin = user('system_admin', null, null);
    expect(await service.canAccessUnit(legacyAdmin, UNIT.mr, ORG)).toBe(true);
  });

  it('non-admin null-org user is NOT rescueable by a unit-only FIELD_SUPERVISOR RBAC assignment', async () => {
    // Assigning a FIELD_SUPERVISOR scope does NOT make an unresolved-org account
    // a tenant-capable actor: the org is still unresolved => fail closed.
    const fsByRbac = user('supervisor', null, null, [
      { roleName: 'FIELD_SUPERVISOR', unitId: UNIT.mr, organizationId: null },
    ]);
    expect(await service.isStrictlyUnitScoped(fsByRbac)).toBe(true);
    expect(await service.canAccessUnit(fsByRbac, UNIT.mr, ORG)).toBe(false);
  });
});