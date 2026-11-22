import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SupervisorCenterService } from '../supervisor-center.service';
import { SupervisorCenterController } from '../supervisor-center.controller';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleCoverageService } from '../../schedules/services/schedule-coverage.service';

/**
 * Phase 5C.9 — Supervisor Center dashboard unit/org scope.
 *
 * The supervisor-center dashboard covers cross-cutting panels (swaps,
 * maintenance, calibration, warranty, notifications, stock). Scope must be
 * enforced: FIELD_SUPERVISOR confined to the assigned unit, SUPERVISOR to the
 * org, and null unit assignment fails closed (403).
 */
describe('Phase 5C.9 — Supervisor Center dashboard scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';

  const empty = async () => [];
  const zero = async () => 0;
  const mockCoverage = {
    evaluateScheduleCoverage: vi.fn(() => Promise.resolve({
      lines: [],
      underCoverage: [],
      requiredSlots: 0,
      assignedSlots: 0,
      coveragePercent: 100,
      allCovered: true,
      uncoveredDates: [],
    })),
  };

  let service: SupervisorCenterService;
  const mockPrisma: any = {
    personnel: { findMany: vi.fn(empty) },
    device: { findMany: vi.fn(empty) },
    deviceStatusLog: { findMany: vi.fn(empty) },
    deviceIncident: { findMany: vi.fn(empty), count: vi.fn(zero) },
    swapRequest: { findMany: vi.fn(empty) },
    attendanceRecord: { findMany: vi.fn(empty) },
    assignment: { findMany: vi.fn(empty) },
    maintenanceRecord: { count: vi.fn(zero) },
    consumableStock: { findMany: vi.fn(empty), fields: { minimumStock: 'minimumStock' } },
    calibrationRecord: { findMany: vi.fn(empty) },
    enterpriseAsset: { findMany: vi.fn(empty) },
    notification: { findMany: vi.fn(empty) },
    stockAlert: { findMany: vi.fn(empty) },
    dutyRoster: { findMany: vi.fn(empty) },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const compile = async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SupervisorCenterService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ScheduleCoverageService, useValue: mockCoverage },
      ],
    }).compile();
    return moduleRef.get<SupervisorCenterService>(SupervisorCenterService);
  };

  it('FIELD_SUPERVISOR (unit A) confines operational panels to unitId and swaps via schedule.unitId', async () => {
    service = await compile();
    await service.getDashboard({ organizationId: ORG, unitId: UNIT_A }, '2026-01-01');

    expect(mockPrisma.personnel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unitId: UNIT_A }) }),
    );
    expect(mockPrisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unitId: UNIT_A }) }),
    );
    const swapWhere = mockPrisma.swapRequest.findMany.mock.calls[0][0].where;
    expect(swapWhere.fromAssignment.schedule.unitId).toBe(UNIT_A);
    const opIncident = mockPrisma.deviceIncident.findMany.mock.calls[0][0].where;
    expect(opIncident.unitId).toBe(UNIT_A);
    const maintenanceWhere = mockPrisma.maintenanceRecord.count.mock.calls[0][0].where;
    expect(maintenanceWhere.asset.unitId).toBe(UNIT_A);
    const warrantyWhere = mockPrisma.enterpriseAsset.findMany.mock.calls[0][0].where;
    expect(warrantyWhere.unitId).toBe(UNIT_A);
    const rosterWhere = mockPrisma.dutyRoster.findMany.mock.calls[0][0].where;
    expect(rosterWhere.unitId).toBe(UNIT_A);
  });

  it('SUPERVISOR (org only) scopes personnel/device to org and swaps via schedule.organizationId', async () => {
    service = await compile();
    await service.getDashboard({ organizationId: ORG, unitId: null }, '2026-01-01');

    expect(mockPrisma.personnel.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unit: { organizationId: ORG } }) }),
    );
    const swapWhere = mockPrisma.swapRequest.findMany.mock.calls[0][0].where;
    expect(swapWhere.fromAssignment.schedule.organizationId).toBe(ORG);
    const maintenanceWhere = mockPrisma.maintenanceRecord.count.mock.calls[0][0].where;
    expect(maintenanceWhere.asset.organizationId).toBe(ORG);
    expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ organizationId: ORG }) }),
    );
    const rosterWhere = mockPrisma.dutyRoster.findMany.mock.calls[0][0].where;
    expect(rosterWhere.organizationId).toBe(ORG);
  });

  it('shift coverage confines devices and rosters to unit for FIELD_SUPERVISOR', async () => {
    service = await compile();
    await service.getShiftCoverage({ organizationId: ORG, unitId: UNIT_A }, '2026-01-01');

    expect(mockPrisma.device.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ unitId: UNIT_A }) }),
    );
    const rosterWhere = mockPrisma.dutyRoster.findMany.mock.calls[0][0].where;
    expect(rosterWhere.unitId).toBe(UNIT_A);
  });
});

describe('Phase 5C.9 — Supervisor Center controller denyAll', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';

  it('FIELD_SUPERVISOR with null unit assignment is DENIED (403) on dashboard and shift-coverage', async () => {
    const mockService: any = {
      getDashboard: vi.fn(async () => ({})),
      getShiftCoverage: vi.fn(async () => ({})),
    };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SupervisorCenterController],
      providers: [
        { provide: SupervisorCenterService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: { unit: { findUnique: vi.fn(), findFirst: vi.fn() } } },
      ],
    }).compile();
    const controller = moduleRef.get(SupervisorCenterController);

    const fsNull = {
      id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [],
    };
    await expect(controller.getDashboard(undefined, { user: fsNull } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.getShiftCoverage(undefined, { user: fsNull } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(mockService.getDashboard).not.toHaveBeenCalled();
    expect(mockService.getShiftCoverage).not.toHaveBeenCalled();
  });
});
