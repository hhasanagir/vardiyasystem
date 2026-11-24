import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SchedulesDDDController } from '../schedules-ddd.controller';
import { ScheduleApplicationService } from '../schedule-application.service';
import { ScheduleValidationService } from '../schedule-validation.service';
import { PrismaScheduleRepository } from '../infrastructure/prisma-schedule.repository';
import { ScheduleJobQueueService } from '../job-queue/schedule-job-queue.service';
import { ScheduleJobStatusService } from '../job-queue/schedule-job-status.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';
import { RbacService } from '../../rbac/rbac.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { ScopeResolutionService } from '../../rbac/services/scope-resolution.service';

/**
 * Phase 5C.9 — DDD schedule controller unit/org confinement.
 *
 * GET /schedules-ddd and GET /schedules-ddd/:id must enforce the authoritative
 * unit scope: FIELD_SUPERVISOR confined to own unit (null unit fail-closed),
 * SUPERVISOR org-wide, cross-org denied.
 */
describe('Phase 5C.9 — DDD schedule controller scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let controller: SchedulesDDDController;
  let unitScopeService: UnitScopeService;
  let appService: ScheduleApplicationService;

  const mockRbacService = {
    getUserMaxRoleLevel: vi.fn(async () => 0),
    getUserPermissions: vi.fn(async () => [] as string[]),
    getRolePermissions: vi.fn(async () => [] as string[]),
  };

  const mockAuditLog = { log: vi.fn(async () => undefined) };

  const mockScopeResolution = {
    getUserAssignments: vi.fn(async () => []),
    resolveCoveringAssignments: vi.fn(() => []),
  };

  const mockPrisma = {
    schedule: { findUnique: vi.fn() },
    assignment: { findMany: vi.fn(async () => []) },
  };

  const mockAppService: any = {
    listSchedules: vi.fn(async () => []),
    getSchedule: vi.fn(async (id: string) => ({
      id,
      toSnapshot: () => ({ id }),
      approvalData: null,
      unitId: UNIT_A,
      month: 1,
      year: 2026,
      status: 'draft',
      scheduleVersion: 1,
      createdById: 'u-1',
      publishedAt: null,
    })),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesDDDController],
      providers: [
        {
          provide: ScheduleApplicationService,
          useValue: mockAppService,
        },
        { provide: ScheduleValidationService, useValue: {} },
        { provide: PrismaScheduleRepository, useValue: {} },
        { provide: ScheduleJobQueueService, useValue: {} },
        { provide: ScheduleJobStatusService, useValue: {} },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RbacService, useValue: mockRbacService },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: ScopeResolutionService, useValue: mockScopeResolution },
        UnitScopeService,
      ],
    }).compile();

    controller = moduleRef.get(SchedulesDDDController);
    unitScopeService = moduleRef.get(UnitScopeService);
    appService = moduleRef.get(ScheduleApplicationService);
  });

  const req = (user: any) => ({ user });

  it('FIELD_SUPERVISOR (unit A) list confined to unit A for DDD list', async () => {
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await controller.list({}, req(fsA));
    expect(mockAppService.listSchedules).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: UNIT_A, organizationId: ORG }),
    );
  });

  it('FIELD_SUPERVISOR (unit A) requesting unit B list is DENIED', async () => {
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.list({ unitId: UNIT_B }, req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FIELD_SUPERVISOR with null unit assignment is DENIED on list (fail closed)', async () => {
    const fsNull = {
      id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.list({}, req(fsNull))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('RBAC-only FIELD_SUPERVISOR (legacy role supervisor) is still unit-confined on list', async () => {
    const rbacFs = {
      id: 'u-rfs', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: UNIT_A, organizationId: ORG }],
    };
    await controller.list({}, req(rbacFs));
    expect(mockAppService.listSchedules).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: UNIT_A }),
    );
  });

  it('SUPERVISOR list is NOT unit-confined (org-wide)', async () => {
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await controller.list({}, req(sup));
    expect(mockAppService.listSchedules).toHaveBeenCalledWith(
      expect.objectContaining({ unitId: undefined, organizationId: ORG }),
    );
  });

  it('getOne: FIELD_SUPERVISOR (unit A) can read schedule in unit A', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_A, organizationId: ORG });
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('sched-1', req(fsA))).resolves.toBeTruthy();
  });

  it('getOne: FIELD_SUPERVISOR (unit A) reading schedule in unit B is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B, organizationId: ORG });
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('sched-1', req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getOne: FIELD_SUPERVISOR reading schedule in another organization is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_A, organizationId: 'foreign-org' });
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('sched-1', req(fsA))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getOne: SUPERVISOR can read schedule in any unit within own org', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B, organizationId: ORG });
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('sched-1', req(sup))).resolves.toBeTruthy();
  });

  it('getOne: SUPERVISOR reading schedule in another org is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({ unitId: UNIT_B, organizationId: 'foreign-org' });
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('sched-1', req(sup))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('getOne: nonexistent schedule is NOT_FOUND (404, not forbidden)', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(null);
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.getOne('nope', req(sup))).rejects.toBeInstanceOf(NotFoundException);
  });
});
