import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DevicesController } from '../devices.controller';
import { DevicesService } from '../devices.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.17 — AU-02 Devices cross-tenant access.
 *
 * GET /devices must be org-confined for supervisor and unit-confined for
 * field_supervisor. GET /devices/unit/:code must deny units from another org.
 */
describe('Phase 5C.17 — AU-02 Devices scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const OTHER_ORG = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let controller: DevicesController;
  let mockService: any;
  let mockPrisma: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockService = {
      findAll: vi.fn(async () => ({ devices: [], total: 0 })),
      findByUnitCode: vi.fn(async () => ({ devices: [], total: 0 })),
    };
    mockPrisma = {
      unit: { findFirst: vi.fn() },
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [DevicesController],
      providers: [
        { provide: DevicesService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    controller = moduleRef.get(DevicesController);
  });

  const req = (user: any) => ({ user });

  it('SUPERVISOR findAll is org-confined (client org ignored)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await controller.findAll(undefined, undefined, req(sup));
    // No scoped unit for supervisor, only organizationId
    expect(mockService.findAll.mock.calls[0][0]).toEqual({ organizationId: ORG });
  });

  it('FIELD_SUPERVISOR (unit A) findAll is unit-confined to unit A', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await controller.findAll(undefined, undefined, req(fsA));
    expect(mockService.findAll.mock.calls[0][0]).toEqual({ organizationId: ORG, scopedUnitId: UNIT_A });
  });

  it('FIELD_SUPERVISOR with null unit is DENIED on findAll (fail closed)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const fsNull = { id: 'u-2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findAll(undefined, undefined, req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findByUnitCode denies a unit from another org', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: OTHER_ORG });
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findByUnitCode('MR', req(sup))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findByUnitCode allows a unit from the same org', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findByUnitCode('MR', req(sup))).resolves.toBeTruthy();
  });

  it('findByUnitCode denies a strictly-scoped user targeting a sibling unit', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findByUnitCode('BT', req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('findByUnitCode allows a strictly-scoped user on their own unit', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue({ id: UNIT_A, organizationId: ORG });
    const fsA = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findByUnitCode('MR', req(fsA))).resolves.toBeTruthy();
  });

  it('findByUnitCode with unknown unit is a 404 (not 500)', async () => {
    mockPrisma.unit.findFirst.mockResolvedValue(null);
    const sup = { id: 'u-3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
    await expect(controller.findByUnitCode('BOGUS', req(sup))).rejects.toBeInstanceOf(NotFoundException);
  });
});