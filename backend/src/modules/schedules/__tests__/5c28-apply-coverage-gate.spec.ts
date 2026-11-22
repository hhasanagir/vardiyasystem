import 'reflect-metadata';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScheduleAutoGeneratorService } from '../schedule-auto-generator.service';
import { ScheduleCoverageService } from '../services/schedule-coverage.service';

/**
 * Phase 5C.28 — P1-1 mandatory coverage gate at the auto-apply boundary.
 *
 * ScheduleAutoGeneratorService.apply() must evaluate the EXACT merged proposal
 * (persisted schedule assignments + the pending batch) through the single
 * authoritative ScheduleCoverageService and reject the entire apply when
 * mandatory under-coverage remains, BEFORE any row reaches createMany().
 */

const BASE_SCHEDULE = {
  id: 's-1',
  unitId: 'unit-1',
  status: 'draft',
  version: 3,
  year: 2026,
  month: 6,
  unit: { organizationId: 'org-1' },
};

const CANDIDATE = {
  personnelId: 'p-1',
  deviceId: 'd-1',
  date: '2026-06-15',
  shiftType: 'day',
  startTime: '08:00',
  endTime: '16:00',
  personnelType: 'technician',
};

const candidateExtras = [
  {
    personnelId: 'p-1',
    deviceId: 'd-1',
    date: '2026-06-15',
    shiftType: 'day',
    personnelType: 'technician',
  },
];

const underLine = () => ({
  key: 'd-1|2026-06-15|day|technician',
  deviceId: 'd-1',
  deviceName: 'MR-1',
  date: '2026-06-15',
  shiftType: 'day',
  personnelType: 'technician',
  required: 1,
  assigned: 0,
  shortfall: 1,
  isSharedBlock: false,
});

function coverageResult(overrides: Record<string, unknown> = {}) {
  return {
    lines: [],
    underCoverage: [],
    requiredSlots: 22,
    assignedSlots: 22,
    coveragePercent: 100,
    allCovered: true,
    uncoveredDates: [],
    ...overrides,
  };
}

describe('Phase 5C.28 — P1-1 auto-apply mandatory coverage gate', () => {
  let mockPrisma: any;
  let mockValidation: any;
  let mockScope: any;
  let mockCoverage: { evaluateScheduleCoverage: ReturnType<typeof vi.fn> };
  let txCreateMany: ReturnType<typeof vi.fn>;
  let txUpdateMany: ReturnType<typeof vi.fn>;
  let txFindMany: ReturnType<typeof vi.fn>;
  let txSnapshotFindFirst: ReturnType<typeof vi.fn>;
  let txSnapshotCreate: ReturnType<typeof vi.fn>;
  let service: ScheduleAutoGeneratorService;

  const actor: any = { id: 'u-1', role: 'field_supervisor', unitId: 'unit-1', organizationId: 'org-1', rbacRoles: [] };
  const dto = { scheduleId: 's-1', assignments: [CANDIDATE] };

  beforeEach(() => {
    vi.clearAllMocks();
    txCreateMany = vi.fn(async () => ({ count: 1 }));
    txUpdateMany = vi.fn(async () => ({ count: 1 }));
    txFindMany = vi.fn(() => Promise.resolve([]));
    txSnapshotFindFirst = vi.fn(() => Promise.resolve(null));
    txSnapshotCreate = vi.fn(() => Promise.resolve({}));
    mockPrisma = {
      schedule: { findUnique: vi.fn() },
      assignment: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: any) =>
        fn({
          assignment: { createMany: txCreateMany, findMany: txFindMany },
          schedule: { updateMany: txUpdateMany },
          scheduleSnapshot: { findFirst: txSnapshotFindFirst, create: txSnapshotCreate },
        }),
      ),
    };
    mockValidation = {
      validateAssignment: vi.fn(async () => ({ hasBlocking: false, violations: [] })),
      // P2-15 — batch validation preserves the all-or-nothing blocking gate.
      validateAssignmentsBatch: vi.fn((_id: string, candidates: any[]) =>
        candidates.map(() => ({ hasBlocking: false, violations: [] }))),
    };
    mockScope = { canAccessUnit: vi.fn(async () => true) };
    mockCoverage = { evaluateScheduleCoverage: vi.fn() };
    mockPrisma.schedule.findUnique.mockResolvedValue(BASE_SCHEDULE);
    mockPrisma.assignment.findMany.mockResolvedValue([]);
    service = new ScheduleAutoGeneratorService(
      mockPrisma as any,
      mockValidation as any,
      mockScope as any,
      undefined as any,
      mockCoverage as unknown as ScheduleCoverageService,
    );
  });

  it('TEST A — mandatory under-coverage rejects the whole apply (409, canOverride=false) BEFORE createMany', async () => {
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(
      coverageResult({
        underCoverage: [underLine()],
        requiredSlots: 1,
        assignedSlots: 0,
        coveragePercent: 0,
        allCovered: false,
      }),
    );

    const err = await service.apply(dto as any, actor.id, actor).catch(e => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(err.getStatus()).toBe(409);
    expect(err.getResponse()).toMatchObject({ canOverride: false, hasBlocking: true });
    expect(String(err.getResponse().message)).toContain('minimum personel');
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txCreateMany).not.toHaveBeenCalled();
  });

  it('TEST A — the merged proposal is evaluated: persisted schedule + exact pending batch', async () => {
    mockPrisma.assignment.findMany.mockResolvedValue([
      { personnelId: 'p-0', deviceId: 'd-2', date: '2026-06-14', shiftType: 'evening', personnelType: 'technician' },
    ]);
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(coverageResult());

    await service.apply(dto as any, actor.id, actor).catch(() => undefined);

    expect(mockCoverage.evaluateScheduleCoverage).toHaveBeenCalledTimes(1);
    expect(mockCoverage.evaluateScheduleCoverage).toHaveBeenCalledWith(
      { unitId: 'unit-1', scheduleId: 's-1', year: 2026, month: 6 },
      candidateExtras,
    );
  });

  it('TEST B — a fully covered proposal applies successfully (existing behavior preserved)', async () => {
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(coverageResult());

    const result = await service.apply(dto as any, actor.id, actor);

    expect(result).toMatchObject({ created: 1, skipped: 0 });
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txCreateMany).toHaveBeenCalledTimes(1);
    // P3-09 — the authoritative coverage result is captured in provenance.
    expect(txSnapshotCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            generatedBy: actor.id,
            algorithm: 'auto-generator.apply',
            score: 100,
            coverage: {
              requiredSlots: 22,
              assignedSlots: 22,
              coveragePercent: 100,
              underCoveredSlots: 0,
            },
          }),
        }),
      }),
    });
  });

  it('TEST C — device-off / closed slots are not misreported as missing coverage by the gate', async () => {
    // Slot is off/closed => the authoritative loader excludes the requirement,
    // so the service reports full coverage; the gate must NOT fabricate a block.
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(coverageResult());

    const result = await service.apply(dto as any, actor.id, actor);

    expect(result).toMatchObject({ created: 1 });
    expect(txCreateMany).toHaveBeenCalledTimes(1);
  });

  it('TEST D — personnel unavailable dates keep ineligible staff from satisfying coverage', async () => {
    // A blocked/absent candidate cannot fill the slot => the merged proposal is
    // still under-covered; the gate must reject and persist nothing.
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(
      coverageResult({
        underCoverage: [underLine()],
        requiredSlots: 1,
        assignedSlots: 0,
        coveragePercent: 0,
        allCovered: false,
      }),
    );

    const err = await service.apply(dto as any, actor.id, actor).catch(e => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(txCreateMany).not.toHaveBeenCalled();
  });

  it('TEST E — unit scope is enforced BEFORE coverage evaluation and any write', async () => {
    mockScope.canAccessUnit.mockResolvedValue(false);

    const err = await service.apply(dto as any, actor.id, actor).catch(e => e);

    expect(err).toBeInstanceOf(ForbiddenException);
    expect(mockCoverage.evaluateScheduleCoverage).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('TEST E — FIELD_SUPERVISOR with a NULL unit assignment fails CLOSED (no "all units")', async () => {
    mockScope.canAccessUnit.mockImplementation(async (user: any) => {
      return Boolean(user.unitId) && user.unitId === BASE_SCHEDULE.unitId;
    });

    await expect(
      service.apply(dto as any, actor.id, { ...actor, unitId: null } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockCoverage.evaluateScheduleCoverage).not.toHaveBeenCalled();
  });

  it('TEST F — optimistic concurrency (CAS) still fails atomically and nothing is written', async () => {
    mockCoverage.evaluateScheduleCoverage.mockResolvedValue(coverageResult());
    txUpdateMany.mockResolvedValue({ count: 0 });

    const err = await service.apply(dto as any, actor.id, actor).catch(e => e);

    expect(err).toBeInstanceOf(ConflictException);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txCreateMany).not.toHaveBeenCalled();
  });

  it('a missing schedule is NOT_FOUND (404), not a coverage verdict', async () => {
    mockPrisma.schedule.findUnique.mockResolvedValue(null);

    await expect(service.apply(dto as any, actor.id, actor)).rejects.toBeInstanceOf(NotFoundException);
    expect(mockCoverage.evaluateScheduleCoverage).not.toHaveBeenCalled();
  });

  it('an empty batch (no rows to persist) skips the coverage gate', async () => {
    mockPrisma.assignment.findMany.mockResolvedValue([
      { personnelId: 'p-1', deviceId: 'd-1', date: '2026-06-15', shiftType: 'day', personnelType: 'technician' },
    ]);

    const result = await service.apply({ scheduleId: 's-1', assignments: [CANDIDATE] } as any, actor.id, actor);

    expect(result).toMatchObject({ created: 0, skipped: 1 });
    expect(mockCoverage.evaluateScheduleCoverage).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});