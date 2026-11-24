import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException, NotFoundException, RequestMethod } from '@nestjs/common';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';
import { SchedulesController } from '../schedules.controller';
import { AUDIT_METADATA_KEY } from '../../audit-log/audit.constants';

const ORG = 'org-1';
const UNIT_A = 'unit-a';
const UNIT_B = 'unit-b';

const fsA = { id: 'u1', role: 'field_supervisor', unitId: UNIT_A, organizationId: ORG, rbacRoles: [] };
const fsNull = { id: 'u2', role: 'field_supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };
const sup = { id: 'u3', role: 'supervisor', unitId: null, organizationId: ORG, rbacRoles: [] };

/**
 * Phase 5C.14 — SEC-A: POST /schedules/generate/apply scope enforcement.
 *
 * Auto-apply must be backend-authoritative: the schedule row (never the client)
 * determines the target unit, and a strictly unit-scoped actor (saha sorumlusu)
 * is confined to his assigned unit (null assignment fails CLOSED).
 */
describe('Phase 5C.14 — SEC-A: auto-apply unit scope', () => {
  const mockPrisma: any = {
    schedule: { findUnique: vi.fn() },
    assignment: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: any) =>
      fn({
        assignment: {
          createMany: vi.fn(async () => ({ count: 1 })),
          findMany: vi.fn(() => Promise.resolve([])),
        },
        schedule: {
          update: vi.fn(),
          updateMany: vi.fn(async () => ({ count: 1 })),
        },
        scheduleSnapshot: {
          findFirst: vi.fn(() => Promise.resolve(null)),
          create: vi.fn(() => Promise.resolve({})),
        },
      }),
    ),
  };
  const mockValidation: any = {
    validateAssignment: vi.fn(async () => ({ hasBlocking: false, violations: [] })),
    // P2-15 — apply now loads validation context once for the whole batch.
    validateAssignmentsBatch: vi.fn((_id: string, candidates: any[]) =>
      candidates.map(() => ({ hasBlocking: false, violations: [] }))),
  };

  const dto = {
    scheduleId: 's-1',
    assignments: [
      {
        personnelId: 'p-1', deviceId: 'd-1', date: '2026-06-15',
        shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician',
      },
    ],
  };

  let service: ScheduleAutoGeneratorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ScheduleAutoGeneratorService(
      mockPrisma as any,
      mockValidation as any,
      new UnitScopeService({} as any) as any,
    );
  });

  it('FIELD_SUPERVISOR may apply to a schedule in his own unit', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1', unitId: UNIT_A, unit: { organizationId: ORG },
    });
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    await expect(service.apply(dto as any, fsA.id, fsA as any)).resolves.toMatchObject({ created: 1 });
  });

  it('FIELD_SUPERVISOR applying to ANY other unit is DENIED before any DB write', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1', unitId: UNIT_B, unit: { organizationId: ORG },
    });
    await expect(service.apply(dto as any, fsA.id, fsA as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('FIELD_SUPERVISOR with a NULL unit assignment is DENIED (fail closed, never "all units")', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1', unitId: UNIT_A, unit: { organizationId: ORG },
    });
    await expect(service.apply(dto as any, fsNull.id, fsNull as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('SUPERVISOR is NOT unit-confined and may apply within the same org', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1', unitId: UNIT_B, unit: { organizationId: ORG },
    });
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    await expect(service.apply(dto as any, sup.id, sup as any)).resolves.toMatchObject({ created: 1 });
  });

  it('SUPERVISOR applying to a schedule in ANOTHER organization is DENIED', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue({
      id: 's-1', unitId: UNIT_A, unit: { organizationId: 'foreign-org' },
    });
    await expect(service.apply(dto as any, sup.id, sup as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockPrisma.assignment.findMany).not.toHaveBeenCalled();
  });

  it('a missing schedule is NOT_FOUND (404), not a scope verdict', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(null);
    await expect(service.apply(dto as any, sup.id, sup as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('binds POST /schedules/generate/apply to a dedicated handler with ASSIGNMENTS_APPLIED audit metadata', () => {
    const handler = SchedulesController.prototype.apply;
    expect(Reflect.getMetadata('path', handler)).toBe('generate/apply');
    expect(Reflect.getMetadata('method', handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(AUDIT_METADATA_KEY, handler)).toMatchObject({
      action: 'ASSIGNMENTS_APPLIED',
      entityType: 'assignment',
    });
  });
});