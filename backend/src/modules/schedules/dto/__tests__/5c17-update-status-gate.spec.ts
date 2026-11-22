import { Test, TestingModule } from '@nestjs/testing';
import { SchedulesService } from '../../schedules.service';
import { PrismaService } from '../../../../prisma.service';
import { AuditLogService } from '../../../audit-log/audit-log.service';
import { UnitsService } from '../../../units/units.service';
import { SchedulesWorkflowService } from '../../schedules-workflow.service';
import { ScheduleGateway } from '../../../websocket/schedule.gateway';
import { NotificationEventService } from '../../../notifications/notification-event.service';
import { MetricsService } from '../../../../metrics/metrics.service';
import { EventBusService } from '../../../../events/event-bus.service';
import { UnitScopeService } from '../../../rbac/services/unit-scope.service';
import { validate } from 'class-validator';
import { UpdateScheduleDto } from '../update-schedule.dto';
import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Phase 5C.17 — UA4-1 direct schedule status mutation.
 *
 * PUT /schedules/:id must NOT accept a `status` field (transport: DTO
 * whitelist). The service update() must never write status or publishedAt;
 * status transitions are exclusively owned by the workflow service
 * (submit/approve/reject/publish/archive).
 */
describe('Phase 5C.17 — UA4-1 direct status mutation', () => {
  describe('UpdateScheduleDto', () => {
    const pipeOptions = { whitelist: true, forbidNonWhitelisted: true };

    it('rejects `status` as a non-whitelisted property', async () => {
      const dto = new UpdateScheduleDto();
      (dto as any).status = 'published';
      const errors = await validate(dto, pipeOptions);
      const messages = errors.map(e => Object.values(e.constraints || {}).join('; ')).join('; ');
      expect(messages).toMatch(/should not exist/i);
    });

    it('accepts assignments without a status property', async () => {
      const dto = new UpdateScheduleDto();
      dto.assignments = [];
      const errors = await validate(dto, pipeOptions);
      expect(errors.length).toBe(0);
    });

    it('does not declare a status property at all', () => {
      const dto = new UpdateScheduleDto();
      expect((dto as any).status).toBeUndefined();
      expect('status' in dto).toBe(false);
    });
  });

  describe('SchedulesService.update', () => {
    let service: SchedulesService;
    let mockPrisma: any;
    let updateSpy: any;
    let txScheduleUpdateSpy: any;

    beforeEach(async () => {
      updateSpy = vi.fn().mockImplementation(async (args: any) => ({ id: 's-1', version: 4, ...args.data }));

      mockPrisma = {
        schedule: {
          findUnique: vi.fn().mockResolvedValue({ id: 's-1', version: 3, status: 'draft', unitId: 'u-1', month: 6, year: 2026 }),
          update: updateSpy,
        },
        assignment: {
          deleteMany: vi.fn(),
          createMany: vi.fn(),
        },
        scheduleSnapshot: {
          create: vi.fn(),
          findFirst: vi.fn().mockResolvedValue(null),
        },
        $transaction: vi.fn().mockImplementation(async (fn: any) => {
          txScheduleUpdateSpy = vi.fn().mockImplementation(async (args: any) => ({ id: 's-1', version: 4, ...args.data }));
          return fn({
            assignment: { deleteMany: vi.fn(), createMany: vi.fn() },
            schedule: { update: txScheduleUpdateSpy },
          });
        }),
      };

      const mockUnitsService = { findAll: vi.fn(), findOne: vi.fn(), findByOrganization: vi.fn(), getDevices: vi.fn() };
      const mockAuditLog = { log: vi.fn().mockResolvedValue(undefined) };
      const mockWorkflowService = { submitForReview: vi.fn(), approve: vi.fn(), reject: vi.fn(), publish: vi.fn() };
      const mockGateway = { broadcastPersonnelUpdate: vi.fn(), broadcastAlertUpdate: vi.fn(), server: { to: vi.fn().mockReturnValue({ emit: vi.fn() }) } };
      const mockNotificationEvent = {};
      const mockMetrics = { authLoginTotal: { inc: vi.fn() }, httpRequestsTotal: { inc: vi.fn() }, httpRequestDuration: { observe: vi.fn() }, dbQueryDuration: { observe: vi.fn() }, dbSlowQueriesTotal: { inc: vi.fn() }, dbQueriesTotal: { inc: vi.fn() }, wsEventsTotal: { inc: vi.fn() }, wsErrorsTotal: { inc: vi.fn() } };
      const mockEventBus = { publish: vi.fn() };
      const mockUnitScope = {
        resolveScope: vi.fn().mockResolvedValue({ strictUnitId: null, organizationId: 'org-1', role: 'supervisor' }),
        isStrictlyUnitScoped: vi.fn().mockReturnValue(false),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SchedulesService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: AuditLogService, useValue: mockAuditLog },
          { provide: UnitsService, useValue: mockUnitsService },
          { provide: SchedulesWorkflowService, useValue: mockWorkflowService },
          { provide: ScheduleGateway, useValue: mockGateway },
          { provide: NotificationEventService, useValue: mockNotificationEvent },
          { provide: MetricsService, useValue: mockMetrics },
          { provide: EventBusService, useValue: mockEventBus },
          { provide: UnitScopeService, useValue: mockUnitScope },
        ],
      }).compile();

      service = module.get(SchedulesService);
      vi.clearAllMocks();
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 's-1', version: 3, status: 'draft', unitId: 'u-1', month: 6, year: 2026 });
    });

    it('update() tx payload never carries status or publishedAt', async () => {
      await service.update('s-1', { assignments: [] } as any, 'user-1', 3);

      // The transaction already executed during the real service call; the
      // schedule.update spy captured the payload.
      expect(txScheduleUpdateSpy).toBeDefined();
      expect(txScheduleUpdateSpy.mock.calls.length).toBeGreaterThan(0);
      const args = txScheduleUpdateSpy.mock.calls[0][0];
      expect(args.data).not.toHaveProperty('status');
      expect(args.data).not.toHaveProperty('publishedAt');
      expect(args.data.version).toEqual({ increment: 1 });
    });

    it('update() keeps optimistic locking (ConflictException on version mismatch)', async () => {
      mockPrisma.schedule.findUnique.mockResolvedValue({ id: 's-1', version: 5, status: 'draft' });
      await expect(
        service.update('s-1', { assignments: [] } as any, 'user-1', 3),
      ).rejects.toBeInstanceOf(Error);
    });
  });
});