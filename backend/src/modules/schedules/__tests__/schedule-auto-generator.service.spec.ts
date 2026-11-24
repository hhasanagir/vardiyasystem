import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { PrismaService } from '../../../prisma.service';
import { ScheduleValidationService } from '../schedule-validation.service';
import { UnitScopeService } from '../../rbac/services/unit-scope.service';

function blockingReport() {
  return { hasBlocking: true, violations: [{ rule: 'UNIT_CLOSED', severity: 'BLOCKING', isOverrideAllowed: false }] };
}
function cleanReport() {
  return { hasBlocking: false, violations: [] };
}

function assignment(id: number) {
  return {
    personnelId: `p${id}`,
    deviceId: `dev${id}`,
    date: '2026-08-10',
    shiftType: 'day' as const,
    startTime: '08:00',
    endTime: '16:00',
    personnelType: 'technician',
  };
}

describe('ScheduleAutoGeneratorService.apply (STEP 4 hardening)', () => {
  let service: ScheduleAutoGeneratorService;
  let prisma: {
    schedule: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    assignment: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> };
    scheduleSnapshot: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };
  let scheduleValidation: {
    validateAssignment: ReturnType<typeof vi.fn>;
    validateAssignmentsBatch: ReturnType<typeof vi.fn>;
  };
  let unitScopeService: UnitScopeService;

  beforeEach(() => {
    prisma = {
      schedule: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({}),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assignment: { findMany: vi.fn().mockResolvedValue([]), createMany: vi.fn().mockResolvedValue({ count: 0 }) },
      scheduleSnapshot: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => cb(prisma)),
    };
    scheduleValidation = {
      validateAssignment: vi.fn(),
      // P2-15 — the apply boundary now performs one batched validation call.
      validateAssignmentsBatch: vi.fn((_id: string, candidates: any[]) =>
        candidates.map(() => cleanReport())),
    };
    unitScopeService = { canAccessUnit: vi.fn().mockResolvedValue(true) } as unknown as UnitScopeService;
    service = new ScheduleAutoGeneratorService(
      prisma as unknown as PrismaService,
      scheduleValidation as unknown as ScheduleValidationService,
      unitScopeService,
    );
  });

  it('persists a valid batch (created count reflects all non-conflicting candidates)', async () => {
    prisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1', id: 'sd', version: 3 });
    scheduleValidation.validateAssignmentsBatch.mockResolvedValueOnce([cleanReport(), cleanReport()]);
    prisma.assignment.createMany.mockResolvedValue({ count: 2 });
    // First call = pre-apply conflict scan (empty); second call = authoritative
    // post-insert read used to build the provenance snapshot.
    prisma.assignment.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 'a-1', personnelId: 'p1', deviceId: 'dev1', unitId: 'u-1',
          personnelGroupId: null, shiftTemplateId: null, kind: 'device',
          date: '2026-08-10', shiftType: 'day', startTime: '08:00', endTime: '16:00',
          personnelType: 'technician', isConfirmed: false,
          personnel: { name: 'Personel 1' }, device: { name: 'Cihaz 1', code: 'DEV1' },
        },
      ]);

    const result = await service.apply(
      { scheduleId: 'sd', assignments: [assignment(1), assignment(2)] } as any,
      'user-1',
    );

    expect(result.created).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.assignment.createMany).toHaveBeenCalledTimes(1);
    // PHASE 5C.25 — the schedule version bump is an atomic CAS (updateMany with
    // the fetched version predicate) inside the same transaction.
    expect(prisma.schedule.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'sd', version: expect.any(Number) }),
        data: { version: { increment: 1 } },
      }),
    );
    // P3-09 — provenance snapshot is written in the SAME transaction with
    // server-derived actor/time and real persisted assignment names.
    // Typed view of the recorded call: keeps the provenance assertions strict
    // without introducing unsafe `any` member access in the lint gate.
    interface SnapshotCreateCall {
      data: {
        scheduleId: string;
        version: number;
        createdById: string;
        data: {
          assignments: Array<{ personnelName: string; deviceCode: string | null }>;
          metadata: {
            generatedBy: string;
            algorithm: string;
            totalAssignments: number;
            totalWorkingDays: number;
            generatedAt: string;
          };
        };
      };
    }
    const calls = (
      prisma.scheduleSnapshot.create as unknown as { mock: { calls: SnapshotCreateCall[][] } }
    ).mock.calls;
    expect(calls).toHaveLength(1);
    const snapshot = calls[0][0].data;
    expect(snapshot).toMatchObject({
      scheduleId: 'sd',
      version: 4,
      createdById: 'user-1',
    });
    expect(snapshot.data.assignments[0]).toMatchObject({
      personnelName: 'Personel 1',
      deviceCode: 'DEV1',
    });
    expect(snapshot.data.metadata).toMatchObject({
      generatedBy: 'user-1',
      algorithm: 'auto-generator.apply',
      totalAssignments: 1,
      totalWorkingDays: 1,
    });
    expect(snapshot.data.metadata.generatedAt).toEqual(expect.any(String));
  });

  it('rejects the ENTIRE batch (zero persisted) when any candidate is Blocking UNIT_CLOSED/DEVICE_OFF_DATE', async () => {
    prisma.schedule.findUnique.mockResolvedValue({ unitId: 'u-1', id: 'sd' });
    scheduleValidation.validateAssignmentsBatch
      .mockResolvedValueOnce([cleanReport(), blockingReport()]);

    await expect(service.apply({ scheduleId: 'sd', assignments: [assignment(1), assignment(2)] } as any, 'user-1'))
      .rejects.toThrow(ConflictException);

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.assignment.createMany).not.toHaveBeenCalled();
    expect(prisma.schedule.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the schedule does not exist (no mutation)', async () => {
    prisma.schedule.findUnique.mockResolvedValue(null);

    await expect(service.apply({ scheduleId: 'missing', assignments: [assignment(1)] } as any, 'user-1'))
      .rejects.toThrow(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
