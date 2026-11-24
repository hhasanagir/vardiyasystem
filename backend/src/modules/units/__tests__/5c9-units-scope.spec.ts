import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { UnitsController } from '../units.controller';
import { UnitsService } from '../units.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.9 — Units module scoping.
 *
 * GET /units confined to own unit for saha sorumlusu; org-scoped for supervisor.
 * Client-supplied organizationId must not allow cross-org enumeration.
 * GET /units/:id and /units/:id/devices deny cross-unit / cross-org access.
 */
describe('Phase 5C.9 — Units module scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let controller: UnitsController;
  let mockService: any;
  let mockPrismaUnit: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = {
      findAll: vi.fn(async () => []),
      findOne: vi.fn(async () => ({ id: UNIT_A, organizationId: ORG })),
      getDevices: vi.fn(async () => []),
    };
    mockPrismaUnit = { findUnique: vi.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UnitsController],
      providers: [
        { provide: UnitsService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: { unit: mockPrismaUnit } },
      ],
    }).compile();

    controller = moduleRef.get(UnitsController);
  });

  const req = (user: any) => ({ user });

  it('FIELD_SUPERVISOR (unit A) findAll returns only unit A', async () => {
    mockService.findAll.mockResolvedValue([{ id: UNIT_A }, { id: UNIT_B }]);
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    const result = await controller.findAll({}, req(fsA));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(UNIT_A);
  });

  it('FIELD_SUPERVISOR (unit A) cannot enumerate units via client org param', async () => {
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({ organizationId: OTHER_ORG } as any, req(fsA));
    // The client org must never be used for a strictly-scoped user.
    expect(mockService.findAll.mock.calls[0][0].organizationId).toBe(ORG);
  });

  it('FIELD_SUPERVISOR with null unit is DENIED on findAll (fail closed)', async () => {
    const fsNull = { id: 'u-2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll({}, req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPERVISOR findAll is org-scoped', async () => {
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll({ organizationId: OTHER_ORG } as any, req(sup));
    expect(mockService.findAll.mock.calls[0][0].organizationId).toBe(ORG);
  });

  it('FIELD_SUPERVISOR (unit A) findOne on unit B is DENIED', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne(UNIT_B, req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FIELD_SUPERVISOR (unit A) getDevices on unit B is DENIED', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.getDevices(UNIT_B, req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FIELD_SUPERVISOR (unit A) findOne on own unit A is ALLOWED', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue({ id: UNIT_A, organizationId: ORG });
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne(UNIT_A, req(fsA))).resolves.toBeTruthy();
  });

  it('SUPERVISOR findOne on cross-org unit is DENIED', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: OTHER_ORG });
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne(UNIT_B, req(sup))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPERVISOR findOne on same-org unit is ALLOWED', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne(UNIT_B, req(sup))).resolves.toBeTruthy();
  });

  it('unknown unit id is DENIED (not leaked as 404 for scoped actor)', async () => {
    mockPrismaUnit.findUnique.mockResolvedValue(null);
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findOne('nope', req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });
});
