import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { PersonnelController } from '../personnel.controller';
import { PersonnelService } from '../personnel.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.17 — AU-01 Personnel cross-tenant access.
 *
 * GET /personnel must be org-confined for supervisor and unit-confined for
 * field_supervisor. Client-supplied organizationId must never widen the scope.
 * Mutations (create/update/delete) must reject cross-org unit targets and
 * cross-org personnel.
 */
describe('Phase 5C.17 — AU-01 Personnel scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let controller: PersonnelController;
  let mockService: any;
  let mockPrisma: any;
  let serviceUnderTest: () => PersonnelService;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = {
      findAll: vi.fn(async () => []),
      findOne: vi.fn(async () => ({ id: 'p-1', organizationId: ORG })),
      resolveUnit: vi.fn(async (v: string) => (v === UNIT_A || v === UNIT_B ? { id: v } : null)),
      getWorkload: vi.fn(async () => ({})),
      create: vi.fn(async (dto: any, uid?: string, org?: string) => ({ ...dto, id: 'p-new', organizationId: org })),
      update: vi.fn(async (id: string, dto: any, uid?: string, org?: string) => ({ id, ...dto, organizationId: org })),
      delete: vi.fn(async (id: string, uid?: string, org?: string) => ({ id })),
    };
    mockPrisma = {
      personnel: { findUnique: vi.fn(), findMany: vi.fn(async () => []), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
      unit: { findFirst: vi.fn(), findUnique: vi.fn() },
      assignment: { findMany: vi.fn(async () => []) },
    };

    const auditMock = { log: vi.fn(async () => ({})) };
    const eventMock = { publish: vi.fn() };
    const gatewayMock = { broadcastPersonnelUpdate: vi.fn(async () => ({})) };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [PersonnelController],
      providers: [
        { provide: PersonnelService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = moduleRef.get(PersonnelController);

    serviceUnderTest = () =>
      new PersonnelService(mockPrisma, auditMock as any, gatewayMock as any, eventMock as any);
  });

  const req = (user: any) => ({ user });

  it('SUPERVISOR findAll is org-confined (client org ignored)', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({ organizationId: OTHER_ORG } as any, req(sup));
    expect(mockService.findAll.mock.calls[0][0].organizationId).toBe(ORG);
  });

  it('SUPERVISOR findAll passes no unit constraint', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({} as any, req(sup));
    expect(mockService.findAll.mock.calls[0][0].unitId).toBeUndefined();
  });

  it('FIELD_SUPERVISOR (unit A) findAll is forced to unit A', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({} as any, req(fsA));
    expect(mockService.findAll.mock.calls[0][0].unitId).toBe(UNIT_A);
    expect(mockService.findAll.mock.calls[0][0].organizationId).toBe(ORG);
  });

  it('FIELD_SUPERVISOR (unit A) requesting unit B is DENIED', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll({ unitId: UNIT_B } as any, req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FIELD_SUPERVISOR (unit A) requesting own unit A is ALLOWED', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({ unitId: UNIT_A } as any, req(fsA));
    expect(mockService.findAll.mock.calls[0][0].unitId).toBe(UNIT_A);
  });

  it('FIELD_SUPERVISOR with null unit is DENIED on findAll (fail closed)', async () => {
    const fsNull = { id: 'u-2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll({} as any, req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create passes actor organizationId to service', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.create({ name: 'P', unitId: UNIT_A } as any, req(sup));
    expect(mockService.create.mock.calls[0][0]).toEqual({ name: 'P', unitId: UNIT_A });
    expect(mockService.create.mock.calls[0][2]).toBe(ORG);
  });

  it('update passes actor organizationId to service', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.update('p-1', { name: 'P2' } as any, req(sup));
    expect(mockService.update.mock.calls[0][3]).toBe(ORG);
  });

  it('delete passes actor organizationId to service', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.delete('p-1', req(sup));
    expect(mockService.delete.mock.calls[0][2]).toBe(ORG);
  });

  it('getWorkload passes actor organizationId to service', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.getWorkload('p-1', 6, 2026, req(sup));
    expect(mockService.getWorkload.mock.calls[0][3]).toBe(ORG);
  });

  it('create into a unit of another org is DENIED (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: OTHER_ORG });
    await expect(svc.create({ name: 'P', unitId: UNIT_B } as any, 'u-3', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('create into a same-org unit is ALLOWED (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_A, organizationId: ORG });
    mockPrisma.personnel.create.mockResolvedValue({ id: 'p-new', unitId: UNIT_A, unit: { organizationId: ORG } });
    const result = await svc.create({ name: 'P', unitId: UNIT_A } as any, 'u-3', ORG);
    expect(result.id).toBe('p-new');
  });

  it('update of personnel belonging to another org is DENIED (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.personnel.findUnique.mockResolvedValue({ id: 'p-1', organizationId: OTHER_ORG, unitId: UNIT_B, version: 5 });
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    await expect(svc.update('p-1', { name: 'X' } as any, 'u-3', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('update moving personnel to a unit of another org is DENIED (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.personnel.findUnique.mockResolvedValue({ id: 'p-1', organizationId: ORG, unitId: UNIT_A, version: 5 });
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: OTHER_ORG });
    mockPrisma.unit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: OTHER_ORG });
    await expect(svc.update('p-1', { unitId: UNIT_B } as any, 'u-3', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('delete of personnel belonging to another org is DENIED (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.personnel.findUnique.mockResolvedValue({ id: 'p-1', organizationId: OTHER_ORG, unitId: UNIT_B });
    mockPrisma.personnel.delete.mockResolvedValue({ id: 'p-1' });
    await expect(svc.delete('p-1', 'u-3', ORG)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SAHA list with month/year filters workload queries by organizationId (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.personnel.findMany.mockResolvedValue([{ id: 'p-1' }]);
    await svc.findAll({ organizationId: ORG, month: 6, year: 2026 });
    expect(mockPrisma.assignment.findMany.mock.calls[0][0].where.organizationId).toBe(ORG);
  });

  it('create with unknown unit returns BadRequest (service)', async () => {
    const svc = serviceUnderTest();
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    await expect(svc.create({ name: 'P', unitId: 'nope' } as any, 'u-3', ORG)).rejects.toBeInstanceOf(BadRequestException);
  });
});