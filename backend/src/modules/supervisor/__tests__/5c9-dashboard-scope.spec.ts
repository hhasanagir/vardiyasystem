import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SupervisorService } from '../supervisor.service';
import { SupervisorController } from '../supervisor.controller';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.9 — Supervisor dashboard unit/org scope.
 *
 * FIELD_SUPERVISOR is confined to the assigned unit (scope filters every DB
 * query); SUPERVISOR is org-scoped; null unit assignment fails closed (403).
 */
describe('Phase 5C.9 — Supervisor dashboard scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let service: SupervisorService;
  const mockPrisma: any = {
    personnel: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    device: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    deviceIncident: { count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    notification: { findMany: vi.fn(async () => []) },
    dutyRoster: { findMany: vi.fn(async () => []) },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const compile = async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [SupervisorService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    return moduleRef.get<SupervisorService>(SupervisorService);
  };

  it('FIELD_SUPERVISOR scope (unit A) applies unitId filter to personnel, device, incident, roster queries', async () => {
    service = await compile();
    await service.getDashboard('2026-01-01', { unitId: UNIT_A, organizationId: ORG, denyAll: false }, 'u-1');

    expect(mockPrisma.personnel.count).toHaveBeenCalledWith({ where: { isActive: true, unitId: UNIT_A } });
    expect(mockPrisma.device.count).toHaveBeenCalledWith({ where: { isActive: true, unitId: UNIT_A } });
    const incidentCountWhere = mockPrisma.deviceIncident.count.mock.calls[0][0].where;
    expect(incidentCountWhere.unitId).toBe(UNIT_A);
    const rosterWhere = mockPrisma.dutyRoster.findMany.mock.calls[0][0].where;
    expect(rosterWhere.unitId).toBe(UNIT_A);
  });

  it('SUPERVISOR scope (org only) applies organizationId to personnel/device/roster and unit.organizationId to incidents', async () => {
    service = await compile();
    await service.getDashboard('2026-01-01', { unitId: null, organizationId: ORG, denyAll: false }, 'u-1');

    expect(mockPrisma.personnel.count).toHaveBeenCalledWith({ where: { isActive: true, organizationId: ORG } });
    expect(mockPrisma.device.count).toHaveBeenCalledWith({ where: { isActive: true, organizationId: ORG } });
    const incidentCountWhere = mockPrisma.deviceIncident.count.mock.calls[0][0].where;
    expect(incidentCountWhere.unit.organizationId).toBe(ORG);
    const rosterWhere = mockPrisma.dutyRoster.findMany.mock.calls[0][0].where;
    expect(rosterWhere.organizationId).toBe(ORG);
  });

  it('notifications are confined to the user own-org + own received', async () => {
    service = await compile();
    await service.getDashboard('2026-01-01', { unitId: UNIT_A, organizationId: ORG, denyAll: false }, 'u-42');
    const notifWhere = mockPrisma.notification.findMany.mock.calls[0][0].where;
    expect(notifWhere.organizationId).toBe(ORG);
    expect(notifWhere.recipients.some.userId).toBe('u-42');
  });
});

describe('Phase 5C.9 — Supervisor controller denyAll', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';

  it('FIELD_SUPERVISOR with null unit assignment is DENIED (403) on dashboard', async () => {
    const mockService: any = { getDashboard: vi.fn(async () => ({})) };
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SupervisorController],
      providers: [
        { provide: SupervisorService, useValue: mockService },
        UnitScopeService,
        { provide: PrismaService, useValue: { unit: { findUnique: vi.fn(), findFirst: vi.fn() } } },
      ],
    }).compile();
    const controller = moduleRef.get(SupervisorController);

    const fsNull = {
      id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [],
    };
    await expect(controller.getDashboard(undefined, { user: fsNull } as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(mockService.getDashboard).not.toHaveBeenCalled();
  });
});
