import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { SchedulesController } from '../schedules.controller';
import { SchedulesService } from '../schedules.service';
import { SchedulesWorkflowService } from '../schedules-workflow.service';
import { SchedulesExportService } from '../schedules-export.service';
import { ScheduleAlertService } from '../schedule-alert.service';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { ScheduleDryRunService } from '../schedule-dry-run.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';

/**
 * Phase 5C.9 — Schedule export security.
 *
 * GET /schedules/export/excel and export/pdf must NOT trust the client-supplied
 * `unit`. FIELD_SUPERVISOR: owns unit OR else 403; null unit = 403. SUPERVISOR:
 * any unit in own org allowed, cross-org denied.
 */
describe('Phase 5C.9 — Schedule export unit scope', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '079400fa-e937-40d2-8cb9-03725e6f17a0';

  let controller: SchedulesController;
  let mockExport: any;
  let mockPrismaUnit: any;

  const makeRes = () => ({
    set: vi.fn(),
    send: vi.fn(),
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    mockExport = {
      exportExcel: vi.fn(async () => new Uint8Array([1, 2, 3])),
      exportPdf: vi.fn(async () => Buffer.from('pdf')),
    };
    mockPrismaUnit = { findFirst: vi.fn() };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [SchedulesController],
      providers: [
        { provide: SchedulesService, useValue: {} },
        { provide: SchedulesWorkflowService, useValue: {} },
        { provide: SchedulesExportService, useValue: mockExport },
        { provide: ScheduleAlertService, useValue: {} },
        { provide: ScheduleAutoGeneratorService, useValue: {} },
        { provide: ScheduleDryRunService, useValue: {} },
        UnitScopeService,
        { provide: PrismaService, useValue: { unit: mockPrismaUnit } },
        { provide: ScheduleGateway, useValue: {} },
      ],
    }).compile();

    controller = moduleRef.get(SchedulesController);
  });

  const req = (user: any) => ({ user });

  it('FIELD_SUPERVISOR (unit A) can export unit A (ALLOW)', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue({ id: UNIT_A, organizationId: ORG });
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel(UNIT_A, 1, 2026, req(fsA), makeRes() as any)).resolves.toBeUndefined();
    await expect(controller.exportPdf(UNIT_A, 1, 2026, req(fsA), makeRes() as any)).resolves.toBeUndefined();
    expect(mockExport.exportExcel).toHaveBeenCalled();
    expect(mockExport.exportPdf).toHaveBeenCalled();
  });

  it('FIELD_SUPERVISOR (unit A) exporting unit B is DENIED', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel(UNIT_B, 1, 2026, req(fsA), makeRes() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.exportPdf(UNIT_B, 1, 2026, req(fsA), makeRes() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(mockExport.exportExcel).not.toHaveBeenCalled();
    expect(mockExport.exportPdf).not.toHaveBeenCalled();
  });

  it('FIELD_SUPERVISOR exporting an unresolvable/unknown unit is DENIED (fail closed)', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue(null);
    const fsA = {
      id: 'u-fsa', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel('unknown', 1, 2026, req(fsA), makeRes() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FIELD_SUPERVISOR with null unit assignment exporting any unit is DENIED (fail closed)', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue({ id: UNIT_A, organizationId: ORG });
    const fsNull = {
      id: 'u-fsn', role: 'field_supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel(UNIT_A, 1, 2026, req(fsNull), makeRes() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SUPERVISOR can export unit B in same org (ALLOW)', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: ORG });
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel(UNIT_B, 1, 2026, req(sup), makeRes() as any)).resolves.toBeUndefined();
  });

  it('SUPERVISOR exporting a foreign-org unit is DENIED', async () => {
    mockPrismaUnit.findFirst.mockResolvedValue({ id: UNIT_B, organizationId: 'foreign-org' });
    const sup = {
      id: 'u-sup', role: 'supervisor', unitId: null, organizationId: ORG,
      rbacRoles: [],
    };
    await expect(controller.exportExcel(UNIT_B, 1, 2026, req(sup), makeRes() as any))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
});
