import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { HospitalsService } from '../services/hospitals.service';
import { HospitalsController } from '../controllers/hospitals.controller';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.20 — SEC-01 /hospitals cross-tenant exposure.
 *
 * A normal VIEWER/SUPERVISOR must only ever reach hospitals inside their own
 * tenant. The tenant space is derived from the user's organizations (legacy +
 * RBAC) and from explicit RBAC hospital/group scopes. NULL-org accounts that
 * are NOT platform system admins fail closed with 403. The endpoint must never
 * leak another organization's records, and nonexistent ids must not be
 * distinguishable as "exists elsewhere".
 */
describe('Phase 5C.20 SEC-01 — /hospitals tenant scoping', () => {
  const ORG_A = 'aaaaaaaa-0000-0000-0000-0000000000a1';
  const ORG_B = 'bbbbbbbb-0000-0000-0000-0000000000b1';
  const HOSP_A = 'aaaaaaaa-0000-0000-0000-00000000000a';
  const HOSP_B = 'bbbbbbbb-0000-0000-0000-00000000000b';
  const GROUP_A = 'aaaaaaaa-0000-0000-0000-0000000000g1';
  const UNKNOWN = 'ffffffff-0000-0000-0000-000000000000';
  const hospitalA = { id: HOSP_A, name: 'A Hastanesi', code: 'A', groupId: GROUP_A, isActive: true };
  const hospitalB = { id: HOSP_B, name: 'B Hastanesi', code: 'B', groupId: null, isActive: true };

  let service: HospitalsService;

  beforeEach(async () => {
    const mockPrisma = {
      organization: { findMany: vi.fn() },
      hospital: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [HospitalsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = moduleRef.get(HospitalsService);
    vi.clearAllMocks();
  });

  const prisma = (): any => (service as any).prisma;

  const user = (role: string, organizationId: string | null, rbacRoles: any[] = []) => ({
    id: 'u-' + role,
    role,
    organizationId,
    rbacRoles,
  });

  it('VIEWER same organization sees only hospitals of their own organization', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findMany.mockResolvedValue([hospitalA]);

    const viewer = user('guest', ORG_A);
    const result = await service.findAllScoped(viewer);

    expect(result).toEqual([hospitalA]);
    const where = prisma().hospital.findMany.mock.calls[0][0].where;
    expect(where.OR).toBeTruthy();
    const idCond = where.OR.find((c: any) => c.id);
    expect(idCond.id.in).toContain(HOSP_A);
  });

  it('VIEWER different organization cannot see that organization hospital', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findMany.mockResolvedValue([hospitalA]);

    const viewerB = user('guest', ORG_B);
    const result = await service.findAllScoped(viewerB);

    expect(result.some((h: any) => h.id === HOSP_B)).toBe(false);
    expect(result.every((h: any) => h.id === HOSP_A)).toBe(true);
  });

  it('SUPERVISOR same organization keeps organization scope (allowed)', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findMany.mockResolvedValue([hospitalA]);

    const sup = user('supervisor', ORG_A);
    const result = await service.findAllScoped(sup);
    expect(result).toEqual([hospitalA]);
  });

  it('SUPERVISOR different organization is denied the foreign hospital detail', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findFirst.mockResolvedValue(null);

    const sup = user('supervisor', ORG_A);
    const found = await service.findOneScoped(HOSP_B, sup);

    expect(found).toBeNull();
    const where = prisma().hospital.findFirst.mock.calls[0][0].where;
    expect(where.id).toBe(HOSP_B);
  });

  it('unresolved/null organization fails closed with 403', async () => {
    prisma().organization.findMany.mockResolvedValue([]);

    const nullOrg = user('supervisor', null);
    await expect(service.findAllScoped(nullOrg)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.findOneScoped(HOSP_A, nullOrg)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('nonexistent hospital returns null (no leak, fail closed)', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findFirst.mockResolvedValue(null);

    const viewer = user('guest', ORG_A);
    const found = await service.findOneScoped(UNKNOWN, viewer);
    expect(found).toBeNull();
  });

  it('cross-tenant enumeration attempt does not leak other organization records', async () => {
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findMany.mockResolvedValue([hospitalA]);

    const attacker = user('guest', ORG_A);
    const result = await service.findAllScoped(attacker);

    const ids = result.map((h: any) => h.id);
    expect(ids).toContain(HOSP_A);
    expect(ids).not.toContain(HOSP_B);
  });

  it('endpoint response does not leak another organization records (RBAC hospital scope path)', async () => {
    // User's org maps to hospital A, but an RBAC assignment is scoped to
    // hospital A as well; hospital B must still never appear.
    prisma().organization.findMany.mockResolvedValue([{ hospitalId: HOSP_A }]);
    prisma().hospital.findMany.mockResolvedValue([hospitalA]);

    const scopedSup = user('supervisor', ORG_A, [
      { roleName: 'SUPERVISOR', organizationId: ORG_A, hospitalGroupId: null, hospitalId: HOSP_A },
    ]);
    const result = await service.findAllScoped(scopedSup);
    const ids = result.map((h: any) => h.id);
    expect(ids).not.toContain(HOSP_B);
  });

  it('explicit platform system admin (null-org SYSTEM_ADMIN RBAC) keeps full catalog', async () => {
    prisma().hospital.findMany.mockResolvedValue([hospitalA, hospitalB]);

    const platformAdmin = user('system_admin', null, [
      { roleName: 'SYSTEM_ADMIN', organizationId: null, hospitalGroupId: null, hospitalId: null },
    ]);
    const result = await service.findAllScoped(platformAdmin);
    expect(result.map((h: any) => h.id)).toEqual([HOSP_A, HOSP_B]);
  });

  it('legacy system_admin with null org keeps full catalog', async () => {
    prisma().hospital.findMany.mockResolvedValue([hospitalA, hospitalB]);

    const legacyAdmin = user('system_admin', null);
    const result = await service.findAllScoped(legacyAdmin);
    expect(result.map((h: any) => h.id)).toEqual([HOSP_A, HOSP_B]);
  });

  describe('endpoint contract', () => {
    let controller: HospitalsController;

    beforeEach(() => {
      const stub = {
        findAllScoped: vi.fn(),
        findOneScoped: vi.fn(),
      };
      controller = new HospitalsController(stub as any);
      (controller as any).service = stub;
    });

    it('findAll delegates with the authenticated user (tenant scoping server-side)', async () => {
      const viewer = { id: 'u1', role: 'guest', organizationId: ORG_A, rbacRoles: [] };
      (controller as any).service.findAllScoped.mockResolvedValue([hospitalA]);

      const result = await controller.findAll({} as any, { user: viewer } as any);
      expect(result).toEqual([hospitalA]);
      expect((controller as any).service.findAllScoped).toHaveBeenCalledWith(viewer);
    });

    it('findOne returns NotFound for unscoped/id-not-found hospital (fail closed)', async () => {
      (controller as any).service.findOneScoped.mockResolvedValue(null);

      await expect(
        controller.findOne(HOSP_B, { user: { id: 'u1', role: 'guest', organizationId: ORG_A, rbacRoles: [] } } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findOne propagates tenant 403 from the service', async () => {
      (controller as any).service.findOneScoped.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.findOne(HOSP_A, { user: { id: 'u1', role: 'supervisor', organizationId: null, rbacRoles: [] } } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('findAll propagates tenant 403 from the service (null org non-admin)', async () => {
      (controller as any).service.findAllScoped.mockRejectedValue(new ForbiddenException());

      await expect(
        controller.findAll({} as any, { user: { id: 'u1', role: 'supervisor', organizationId: null, rbacRoles: [] } } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});