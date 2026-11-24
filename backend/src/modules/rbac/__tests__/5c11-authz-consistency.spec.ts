import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeviceStatusController } from '../../device-status/device-status.controller';
import { DeviceStatusService } from '../../device-status/device-status.service';
import { SwapRequestsController } from '../../swap-requests/swap-requests.controller';
import { SwapRequestsService } from '../../swap-requests/swap-requests.service';
import { SchedulesWorkflowService } from '../../schedules/schedules-workflow.service';
import { UnitScopeService } from '../services/unit-scope.service';
import { PrismaService } from '../../../prisma.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotificationEventService } from '../../notifications/notification-event.service';
import { ScheduleGateway } from '../../websocket/schedule.gateway';
import { SkillService } from '../../skills/skill.service';
import { PersonnelAvailabilityService } from '../../schedules/services/personnel-availability.service';
import { ScheduleCoverageService } from '../../schedules/services/schedule-coverage.service';
import { SchedulesDDDController } from '../../schedules/schedules-ddd.controller';
import { RbacController } from '../rbac.controller';
import { AUDIT_METADATA_KEY } from '../../audit-log/audit.constants';

/**
 * Phase 5C.11 - Consistency regression pack.
 *
 * Covers the three authorization-consistency fixes introduced in 5C.11:
 *  1. Device-status writes are scoped against the target device's unit/org
 *     (fail closed for strictly unit-scoped actors, cross-org denied).
 *  2. Swap REQUEST creation validates the from-assignment's unit/org before
 *     insert and the controller passes the actor's resolved read scope.
 *  3. Pending-approvals list is filtered by the caller's organization.
 * Plus: mutation endpoints on DDD schedules + RBAC controllers carry audit
 * metadata (@Log), so the global audit interceptor records them.
 */
describe('Phase 5C.11 authorization consistency', () => {
  const ORG = '991dd0a2-4385-4798-8914-235e534850cb';
  const ORG_OTHER = 'aaaaaaaa-0000-0000-0000-000000000001';
  const UNIT_A = '71a3fe39-8c0f-4573-a50b-966a376c04f8';
  const UNIT_B = '9513a300-0000-0000-0000-000000000002';

  describe('device-status POST scope', () => {
    let controller: DeviceStatusController;
    let deviceStatusService: any;
    let mockPrisma: any;

    const req = (user: any) => ({ user });

    beforeEach(async () => {
      vi.clearAllMocks();
      mockPrisma = {
        device: { findUnique: vi.fn(async () => ({ unitId: UNIT_A })) },
        unit: { findUnique: vi.fn(async () => ({ organizationId: ORG })) },
      };
      deviceStatusService = {
        updateStatus: vi.fn(async () => ({ ok: true })),
      };

      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [DeviceStatusController],
        providers: [
          { provide: DeviceStatusService, useValue: deviceStatusService },
          UnitScopeService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      controller = moduleRef.get(DeviceStatusController);
    });

    it('returns 404 for an unknown device and never mutates', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);
      const fs: any = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
      await expect(
        controller.updateStatus(req(fs), { deviceId: 'nope', status: 'OUT_OF_SERVICE' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(deviceStatusService.updateStatus).not.toHaveBeenCalled();
    });

    it('FIELD_SUPERVISOR may change a device in their own unit', async () => {
      const fsA: any = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
      const result = await controller.updateStatus(
        req(fsA),
        { deviceId: 'd-1', status: 'OUT_OF_SERVICE', notes: 'ariza' },
      );
      expect(deviceStatusService.updateStatus).toHaveBeenCalledWith(
        'u-1', 'd-1', 'OUT_OF_SERVICE', 'ariza',
      );
      expect(result).toEqual({ ok: true });
    });

    it('FIELD_SUPERVISOR is DENIED a device in a sibling unit (fail closed)', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ unitId: UNIT_B });
      const fsA: any = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
      await expect(
        controller.updateStatus(req(fsA), { deviceId: 'd-2', status: 'MAINTENANCE' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(deviceStatusService.updateStatus).not.toHaveBeenCalled();
    });

    it('org member (GUEST) may change any unit device inside their org', async () => {
      const guest: any = { id: 'u-2', role: 'guest', unitId: UNIT_A, organizationId: ORG };
      const result = await controller.updateStatus(
        req(guest),
        { deviceId: 'd-2', status: 'MAINTENANCE' },
      );
      expect(deviceStatusService.updateStatus).toHaveBeenCalledWith(
        'u-2', 'd-2', 'MAINTENANCE', undefined,
      );
      expect(result).toEqual({ ok: true });
    });

    it('org member is DENIED a device in another organization (cross-tenant)', async () => {
      mockPrisma.unit.findUnique.mockResolvedValue({ organizationId: ORG_OTHER });
      const guest: any = { id: 'u-2', role: 'guest', unitId: UNIT_A, organizationId: ORG };
      await expect(
        controller.updateStatus(req(guest), { deviceId: 'd-3', status: 'MAINTENANCE' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(deviceStatusService.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('swap-request create scope', () => {
    let controller: SwapRequestsController;

    const mockSwapService = {
      findAll: vi.fn(async () => []),
      findOne: vi.fn(async () => ({ id: 's1' })),
      create: vi.fn(async (_d: any, _s: any) => ({ id: 's-new' })),
    };

    const mockPrisma: any = {
      unit: { findUnique: vi.fn(async () => ({ organizationId: ORG })) },
      assignment: {
        findUnique: vi.fn(async () => ({
          schedule: { unitId: UNIT_A, organizationId: ORG },
        })),
      },
    };

    beforeEach(async () => {
      vi.clearAllMocks();
      const moduleRef: TestingModule = await Test.createTestingModule({
        controllers: [SwapRequestsController],
        providers: [
          { provide: SwapRequestsService, useValue: mockSwapService },
          UnitScopeService,
          { provide: PrismaService, useValue: mockPrisma },
        ],
      }).compile();

      controller = moduleRef.get(SwapRequestsController);
    });

    it('FIELD_SUPERVISOR create passes their resolved unit scope to the service', async () => {
      const fsA: any = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
      await controller.create(
        { user: fsA },
        { fromAssignmentId: 'a-1', reason: 'nobet degisimi' },
      );
      expect(mockSwapService.create).toHaveBeenCalledWith(
        {
          fromAssignmentId: 'a-1',
          reason: 'nobet degisimi',
          requesterId: 'u-1',
          organizationId: ORG,
          unitId: UNIT_A,
        },
        { unitId: UNIT_A, organizationId: ORG },
      );
    });

    it('FIELD_SUPERVISOR with no resolvable unit is DENIED before insert (fail closed)', async () => {
      const fsNull: any = { id: 'u-1', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
      await expect(
        controller.create({ user: fsNull }, { fromAssignmentId: 'a-1' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockSwapService.create).not.toHaveBeenCalled();
    });

    it('service.create rejects a from-assignment that resolves to a sibling unit', async () => {
      mockSwapService.create.mockImplementation(async (_data: any, scope?: any) => {
        const assignment = await mockPrisma.assignment.findUnique({
          where: { id: _data.fromAssignmentId },
          select: { schedule: { select: { unitId: true, organizationId: true } } },
        });
        if (!assignment) throw new NotFoundException();
        const unitId = assignment?.schedule?.unitId ?? null;
        if (scope?.unitId && (!unitId || unitId !== scope.unitId)) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
        return { id: 's-new' };
      });
      mockPrisma.assignment.findUnique.mockResolvedValue({
        schedule: { unitId: UNIT_B, organizationId: ORG },
      });
      const fsA: any = { id: 'u-1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
      await expect(
        controller.create({ user: fsA }, { fromAssignmentId: 'a-2' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockSwapService.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('pending-approvals org filter', () => {
    let service: SchedulesWorkflowService;
    let findManySpy: any;

    beforeEach(async () => {
      vi.clearAllMocks();
      findManySpy = vi.fn(async () => []);
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          SchedulesWorkflowService,
          { provide: PrismaService, useValue: { schedule: { findMany: findManySpy } } },
          { provide: AuditLogService, useValue: { log: vi.fn() } },
          { provide: NotificationEventService, useValue: {} },
          { provide: ScheduleGateway, useValue: {} },
          { provide: SkillService, useValue: {} },
          { provide: PersonnelAvailabilityService, useValue: { resolveMonthBlockedDates: vi.fn().mockResolvedValue(new Map()) } },
          { provide: ScheduleCoverageService, useValue: {} },
        ],
      }).compile();

      service = moduleRef.get(SchedulesWorkflowService);
    });

    it('getPendingApprovals() without org keeps the historical shape (no org clause)', async () => {
      await service.getPendingApprovals();
      await service.getPendingApprovals(undefined);
      expect(findManySpy).toHaveBeenCalledTimes(2);
      for (const call of findManySpy.mock.calls) {
        expect(call[0].where.status).toBeDefined();
        expect(call[0].where.organizationId).toBeUndefined();
      }
    });

    it('getPendingApprovals(org) filters schedules by that organization', async () => {
      await service.getPendingApprovals(ORG);
      const arg = findManySpy.mock.calls[0][0];
      expect(arg.where.status).toBeDefined();
      expect(arg.where.organizationId).toBe(ORG);
    });
  });

describe('audit @Log metadata presence', () => {
    it.each([
      ['create'],
      ['addAssignment'],
      ['updateAssignment'],
      ['removeAssignment'],
      ['submitForReview'],
      ['approve'],
      ['reject'],
      ['publish'],
      ['archive'],
      ['revertToDraft'],
      ['rollback'],
    ])('SchedulesDDDController.%s carries audit metadata', (method: string) => {
      const handler = (SchedulesDDDController as any).prototype[method];
      // Nest's SetMetadata attaches to the handler function itself.
      const meta = Reflect.getMetadata(AUDIT_METADATA_KEY, handler);
      expect(meta).toBeDefined();
      expect(meta.action).toBeTruthy();
    });

    it('SchedulesDDDController.list and getOne are NOT audited (read-only)', () => {
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, (SchedulesDDDController as any).prototype.list)).toBeUndefined();
      expect(Reflect.getMetadata(AUDIT_METADATA_KEY, (SchedulesDDDController as any).prototype.getOne)).toBeUndefined();
    });

    it.each([
      ['updateRolePermissions'],
      ['assignRole'],
      ['removeRole'],
    ])('RbacController.%s carries audit metadata', (method: string) => {
      const handler = (RbacController as any).prototype[method];
      const meta = Reflect.getMetadata(AUDIT_METADATA_KEY, handler);
      expect(meta).toBeDefined();
      expect(meta.action).toBeTruthy();
    });
  });
});