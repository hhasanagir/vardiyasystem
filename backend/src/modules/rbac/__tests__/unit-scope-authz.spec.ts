import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UnitScopeService } from '../services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.7 — Organizational hierarchy + unit-scope authorization.
 *
 * Deterministic test matrix for the CRITICAL BUSINESS RULE:
 *   - SAHA_SORUMLUSU (field responsible) is confined to the single assigned unit.
 *   - SUPERVISOR and above (supervisor, chief technician, project manager,
 *     hospital/system admin) manage all units in their scope.
 *   - Cross-unit and cross-tenant access is denied.
 */
describe('Phase 5C.7 — Unit-scope authorization', () => {
  let service: UnitScopeService;

  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  const UNIT = {
    mr: '71a3fe39-8c0f-4573-a50b-966a376c04f8',
    bt: '079400fa-e937-40d2-8cb9-03725e6f17a0',
    rontgen: '4f450c7a-9bcb-40ff-963f-840e6686dc9f',
    nukleer: 'b24f1343-6579-4cd5-baf1-9789003e6723',
    onkoloji: '5f0b8cc2-33df-4f4c-8d52-d87e97d7bda8',
  };

  beforeEach(async () => {
    const mockPrisma: any = { unit: { findUnique: vi.fn(), findFirst: vi.fn() } };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [UnitScopeService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(UnitScopeService);
  });

  const user = (role: string, unitId: string | null, organizationId: string | null = ORG) => ({
    id: 'u-' + role,
    role,
    unitId,
    organizationId,
  });

  it('PROJECT_MANAGER has full operational scope across all units', async () => {
    const pm = user('project_manager', null);
    for (const u of Object.values(UNIT)) {
      expect(await service.canAccessUnit(pm, u)).toBe(true);
    }
  });

  it('CHIEF_TECHNICIAN has full operational scope across all units', async () => {
    const ct = user('chief_technician', null);
    for (const u of Object.values(UNIT)) {
      expect(await service.canAccessUnit(ct, u)).toBe(true);
    }
  });

  it('SUPERVISOR manages all operational units (ALLOWED)', async () => {
    const sup = user('supervisor', null);
    for (const u of Object.values(UNIT)) {
      expect(await service.canAccessUnit(sup, u)).toBe(true);
    }
  });

  it('MR saha sorumlusu can access only MR', async () => {
    const mr = user('field_supervisor', UNIT.mr);
    expect(await service.canAccessUnit(mr, UNIT.mr)).toBe(true);
    expect(await service.canAccessUnit(mr, UNIT.bt)).toBe(false);
  });

  it('BT saha sorumlusu can access only BT', async () => {
    const bt = user('field_supervisor', UNIT.bt);
    expect(await service.canAccessUnit(bt, UNIT.bt)).toBe(true);
    expect(await service.canAccessUnit(bt, UNIT.mr)).toBe(false);
  });

  it('Röntgen, Nükleer, RadOnk saha sorumluları can access only their own unit', async () => {
    const rontgen = user('field_supervisor', UNIT.rontgen);
    const nukleer = user('field_supervisor', UNIT.nukleer);
    const onkoloji = user('field_supervisor', UNIT.onkoloji);
    expect(await service.canAccessUnit(rontgen, UNIT.rontgen)).toBe(true);
    expect(await service.canAccessUnit(rontgen, UNIT.nukleer)).toBe(false);
    expect(await service.canAccessUnit(nukleer, UNIT.nukleer)).toBe(true);
    expect(await service.canAccessUnit(nukleer, UNIT.rontgen)).toBe(false);
    expect(await service.canAccessUnit(onkoloji, UNIT.onkoloji)).toBe(true);
    expect(await service.canAccessUnit(onkoloji, UNIT.mr)).toBe(false);
  });

  it('MR saha sorumlusu cannot access BT schedule (DENIED)', async () => {
    const mr = user('field_supervisor', UNIT.mr);
    expect(await service.canAccessUnit(mr, UNIT.bt)).toBe(false);
  });

  it('BT saha sorumlusu cannot mutate MR personnel (DENIED)', async () => {
    const bt = user('field_supervisor', UNIT.bt);
    expect(await service.canAccessUnit(bt, UNIT.mr)).toBe(false);
  });

  it('any saha sorumlusu cannot mutate another units device (DENIED)', async () => {
    const nukleer = user('field_supervisor', UNIT.nukleer);
    expect(await service.canAccessUnit(nukleer, UNIT.bt)).toBe(false);
    expect(await service.canAccessUnit(nukleer, UNIT.rontgen)).toBe(false);
  });

  it('SUPERVISOR can mutate all units (ALLOWED)', async () => {
    const sup = user('supervisor', null);
    expect(await service.canAccessUnit(sup, UNIT.mr)).toBe(true);
    expect(await service.canAccessUnit(sup, UNIT.bt)).toBe(true);
    expect(await service.canAccessUnit(sup, UNIT.rontgen)).toBe(true);
    expect(await service.canAccessUnit(sup, UNIT.nukleer)).toBe(true);
    expect(await service.canAccessUnit(sup, UNIT.onkoloji)).toBe(true);
  });

  it('cross-tenant access is DENIED even for supervisor', async () => {
    const sup = user('supervisor', null, ORG);
    expect(await service.canAccessUnit(sup, UNIT.mr, OTHER_ORG)).toBe(false);
  });

  it('cross-tenant saha sorumlusu access is DENIED', async () => {
    const mr = user('field_supervisor', UNIT.mr, ORG);
    expect(await service.canAccessUnit(mr, UNIT.mr, OTHER_ORG)).toBe(false);
  });

  it('HR role is NOT an operational unit manager and free scope is not granted broadly', async () => {
    // HR is outside the operational hierarchy; it must not be treated as a
    // strictly unit-scoped role, but also must not receive operational power
    // beyond its permission set. Here we only assert it does not get
    // accidentally unit-confined.
    const hr = user('hr', null);
    expect(await service.isStrictlyUnitScopedRole(hr.role)).toBe(false);
    expect(await service.canAccessUnit(hr, UNIT.mr)).toBe(true); // org-scope read via RBAC only
  });

  it('SYSTEM_ADMIN and HOSPITAL_ADMIN span all units (ALLOWED)', async () => {
    const sa = user('system_admin', null);
    const ha = user('hospital_admin', null);
    for (const u of Object.values(UNIT)) {
      expect(await service.canAccessUnit(sa, u)).toBe(true);
      expect(await service.canAccessUnit(ha, u)).toBe(true);
    }
  });

  it('IMAGING_DIRECTOR spans all units (ALLOWED)', async () => {
    const id = user('imaging_director', null);
    for (const u of Object.values(UNIT)) {
      expect(await service.canAccessUnit(id, u)).toBe(true);
    }
  });

  it('SUPERVISOR is NOT strictly unit-scoped (org/hierarchy role)', async () => {
    const sup = user('supervisor', null);
    expect(service.isStrictlyUnitScopedRole(sup.role)).toBe(false);
    const scope = await service.resolveScope(sup);
    expect(scope.strictUnitId).toBeNull();
  });

  it('MR saha sorumlusu is DENIED every sibling unit explicitly', async () => {
    const mr = user('field_supervisor', UNIT.mr);
    expect(await service.canAccessUnit(mr, UNIT.bt)).toBe(false);
    expect(await service.canAccessUnit(mr, UNIT.rontgen)).toBe(false);
    expect(await service.canAccessUnit(mr, UNIT.nukleer)).toBe(false);
    expect(await service.canAccessUnit(mr, UNIT.onkoloji)).toBe(false);
  });

  it('unknown/unsaved unit is DENIED for strictly unit-scoped role', async () => {
    const mr = user('field_supervisor', UNIT.mr);
    const unknown = 'ffffffff-0000-0000-0000-000000000000';
    expect(await service.canAccessUnit(mr, unknown)).toBe(false);
  });

  it('unauthorized mutation target (sibling unit) is DENIED', async () => {
    // Read-side equivalent of a mutation guard decision: a nukleer saha
    // sorumlusu attempting to write to the onkoloji unit is denied.
    const nukleer = user('field_supervisor', UNIT.nukleer);
    expect(await service.canAccessUnit(nukleer, UNIT.onkoloji)).toBe(false);
  });

  it('cross-tenant same-unit is DENIED even for project manager', async () => {
    const pm = user('project_manager', null, ORG);
    expect(await service.canAccessUnit(pm, UNIT.mr, OTHER_ORG)).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Phase 5C.8 — resolveReadScope (list-read confinement single source of truth)
  // ---------------------------------------------------------------------------

  it('list read scope of a field_supervisor is confined to the assigned unit', async () => {
    const mr = user('field_supervisor', UNIT.mr, ORG);
    const scope = await service.resolveReadScope(mr);
    expect(scope.unitId).toBe(UNIT.mr);
    expect(scope.organizationId).toBe(ORG);
  });

  it('RBAC-assigned field_supervisor with null legacy unitId is confined via rbacRoles', async () => {
    const fs = {
      id: 'u-fs-rbac',
      role: 'supervisor', // legacy user.role is NOT field_supervisor
      unitId: null,
      organizationId: ORG,
      rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: UNIT.bt, organizationId: ORG }],
    };
    const scope = await service.resolveReadScope(fs);
    expect(scope.unitId).toBe(UNIT.bt);
    expect(scope.organizationId).toBe(ORG);
  });

  it('SUPERVISOR is NOT unit-confined in list reads (org scope only)', async () => {
    const sup = user('supervisor', null, ORG);
    const scope = await service.resolveReadScope(sup);
    expect(scope.unitId).toBeNull();
    expect(scope.organizationId).toBe(ORG);
  });

  it('legacy unit engineers keep their unit confinement in list reads', async () => {
    const medEng = user('medical_engineer', UNIT.rontgen, ORG);
    const scope = await service.resolveReadScope(medEng);
    expect(scope.unitId).toBe(UNIT.rontgen);
  });

  it('senior technician keeps legacy unit confinement in list reads', async () => {
    const st = user('senior_technician', UNIT.nukleer, ORG);
    const scope = await service.resolveReadScope(st);
    expect(scope.unitId).toBe(UNIT.nukleer);
  });

  it('system admin / hospital admin are NOT unit-confined in list reads', async () => {
    const sa = user('system_admin', null, ORG);
    const ha = user('hospital_admin', null, ORG);
    expect((await service.resolveReadScope(sa)).unitId).toBeNull();
    expect((await service.resolveReadScope(ha)).unitId).toBeNull();
  });

  it('unassigned field_supervisor (legacy + RBAC null) is not widened: reads confined to none', async () => {
    // An RBAC field_supervisor without a scoped unit must NOT fall back to a
    // broad all-org read; the resolved scope must signal denyAll so list
    // endpoints will not leak sibling-unit data.
    const fs = user('field_supervisor', null, ORG);
    const scope = await service.resolveReadScope(fs);
    expect(scope.unitId).toBeNull();
    expect(scope.denyAll).toBe(true);
  });

  it('RBAC-assigned field_supervisor with legacy role that is NOT field_supervisor is still strictly confined', async () => {
    // enrichUserWithPermissions leaves req.user.role as the legacy column; the
    // RBAC FIELD_SUPERVISOR assignment is the authoritative source of truth.
    const fs = {
      id: 'u-fs-rbac2',
      role: 'supervisor',
      unitId: null,
      organizationId: ORG,
      rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: UNIT.mr, organizationId: ORG }],
    };
    expect(service.isStrictlyUnitScoped(fs)).toBe(true);
    expect((await service.resolveScope(fs)).strictUnitId).toBe(UNIT.mr);
    expect(await service.canAccessUnit(fs, UNIT.mr)).toBe(true);
    expect(await service.canAccessUnit(fs, UNIT.bt)).toBe(false);
    expect((await service.resolveReadScope(fs)).unitId).toBe(UNIT.mr);
  });
});
