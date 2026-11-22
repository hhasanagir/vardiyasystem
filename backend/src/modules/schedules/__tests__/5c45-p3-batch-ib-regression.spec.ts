import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SchedulesController } from '../schedules.controller';
import { ScheduleAlertService } from '../schedule-alert.service';
import { CoverageEngine } from '../domain/coverage/coverage-engine';
import { toCoverageAssignmentInputs } from '../domain/coverage/coverage-input-mapper';
import { CoverageLine, CoverageResult } from '../domain/coverage/coverage-types';
import { SupervisorCenterService } from '../../supervisor-center/supervisor-center.service';
import { InsightsService } from '../../insights/insights.service';

const EMPTY_COVERAGE: CoverageResult = {
  lines: [],
  underCoverage: [],
  requiredSlots: 0,
  assignedSlots: 0,
  coveragePercent: 100,
  allCovered: true,
  uncoveredDates: [],
};

const underCoveredLine: CoverageLine = {
  key: 'd1:2026-06-04:day:technician',
  deviceId: 'd1',
  deviceName: 'MR-1',
  date: '2026-06-04',
  shiftType: 'day',
  personnelType: 'technician',
  required: 1,
  assigned: 0,
  shortfall: 1,
};

describe('P3-06 — legacy endpoint cleanup', () => {
  it('removes dead routes and keeps only the deprecated personal-shift alias', () => {
    const proto = SchedulesController.prototype as unknown as Record<string, unknown>;

    expect(proto.findByUnit).toBeUndefined();
    expect(proto.getVersion).toBeUndefined();
    expect(proto.getSnapshots).toBeUndefined();
    expect(proto.duplicate).toBeUndefined();
    expect(proto.preview).toBeUndefined();

    expect(proto.findMyShifts).toBeDefined();
    const deprecatedAlias = proto.findMyShifts as object;
    expect(Reflect.getMetadata('swagger/apiOperation', deprecatedAlias)).toMatchObject({
      deprecated: true,
    });
  });
});

describe('P3-11 — CoverageEngine is the single staffing source', () => {
  it('emits exactly one missing_staff alert per authoritative under-coverage line', async () => {
    const coverageMock = {
      evaluateScheduleCoverage: vi.fn(() => Promise.resolve({
        ...EMPTY_COVERAGE,
        lines: [underCoveredLine],
        underCoverage: [underCoveredLine],
        requiredSlots: 1,
        assignedSlots: 0,
        coveragePercent: 0,
        allCovered: false,
        uncoveredDates: ['2026-06-04'],
      })),
    };
    const prisma = {
      schedule: {
        findUnique: vi.fn(() => Promise.resolve({
          unitId: 'u-1',
          year: 2026,
          month: 6,
          unit: { type: 'MR' },
          assignments: [],
        })),
      },
    };

    const service = new ScheduleAlertService(prisma as never, coverageMock as never);
    const alerts = await service.getAlerts('s-1');

    expect(coverageMock.evaluateScheduleCoverage).toHaveBeenCalledWith({
      unitId: 'u-1',
      scheduleId: 's-1',
      year: 2026,
      month: 6,
    });
    const missing = alerts.filter(a => a.type === 'missing_staff');
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({
      date: '2026-06-04',
      deviceId: 'd1',
      deviceName: 'MR-1',
    });
    expect(missing[0].message).toContain('gerekli 1, atanmış 0');
  });

  it('never creates a missing-slot on weekends, holidays, off dates or disabled shifts', () => {
    const base = {
      year: 2026,
      month: 6,
      includeNightShifts: true,
      shiftDefs: [{ id: 'sh-1', deviceId: 'd1', shiftType: 'day', personnelType: 'technician' }],
      holidays: new Set(['2026-06-01']),
      deviceOffDates: new Set(['d1:2026-06-02']),
      shiftDateOverrides: new Set(['sh-1|2026-06-03']),
      technicianPersonnelCount: 1,
      assistantPersonnelCount: 0,
      supervisorPersonnelCount: 0,
      assignments: [],
      blockedPersonnelDates: new Map(),
    };

    const weekdayOnly = new CoverageEngine().evaluateCoverage({
      ...base,
      includeWeekends: true,
      devices: [{ id: 'd1', name: 'MR-1', mode: 'vardiya', workDays: [1, 2, 3, 4, 5] }],
    });
    const closedDates = new Set([
      '2026-06-01', // holiday (Monday)
      '2026-06-02', // device off date (Tuesday)
      '2026-06-03', // disabled shift override (Wednesday)
      '2026-06-06', // Saturday
      '2026-06-07', // Sunday
    ]);
    expect(
      weekdayOnly.underCoverage.some(line => closedDates.has(line.date)),
    ).toBe(false);

    const sevenDayDevice = new CoverageEngine().evaluateCoverage({
      ...base,
      includeWeekends: false,
      devices: [{ id: 'd1', name: 'MR-1', mode: 'vardiya', workDays: [0, 1, 2, 3, 4, 5, 6] }],
    });
    expect(
      sevenDayDevice.underCoverage.some(line => line.date === '2026-06-06' || line.date === '2026-06-07'),
    ).toBe(false);
  });

  it('normalises duty-roster rows and deduplicates overlapping assignment overlays', () => {
    const mapped = toCoverageAssignmentInputs([
      {
        personnelId: 'p1', deviceId: 'd1', date: '2026-06-04',
        shiftType: 'day', personnelType: 'technician',
      },
      {
        personnelId: 'p1', deviceId: 'd1', date: '2026-06-04',
        role: 'tekniker', shiftType: 'day',
      },
      {
        personnelId: 'p2', deviceId: null, date: '2026-06-04',
        role: 'yardimci_tekniker', shiftType: 'day',
      },
    ]);

    expect(mapped).toEqual([
      {
        personnelId: 'p1', deviceId: 'd1', date: '2026-06-04',
        shiftType: 'day', personnelType: 'technician',
      },
    ]);
  });

  it('uses coverage shortfall instead of mode-based 1/2 device counting in supervisor center', async () => {
    const coverageMock = {
      evaluateScheduleCoverage: vi.fn(() => Promise.resolve({
        ...EMPTY_COVERAGE,
        lines: [underCoveredLine],
      })),
    };
    const prisma = {
      device: {
        findMany: vi.fn(() => Promise.resolve([
          { id: 'd1', name: 'MR-1', unitId: 'u-1', mode: 'vardiya', unit: { id: 'u-1', name: 'Radyoloji' } },
          { id: 'd2', name: 'BT-1', unitId: 'u-1', mode: 'polyclinic', unit: { id: 'u-1', name: 'Radyoloji' } },
        ])),
      },
      dutyRoster: { findMany: vi.fn(() => Promise.resolve([])) },
    };

    const service = new SupervisorCenterService(prisma as never, coverageMock as never);
    const result = await service.getShiftCoverage(
      { organizationId: 'org-1', unitId: 'u-1' },
      '2026-06-04',
    );

    expect(result.coverage.find(c => c.deviceId === 'd1')).toMatchObject({
      required: 1,
      filled: 0,
      missingCount: 1,
      coveragePercent: 0,
    });
    // No in-scope slot => 0/0, 100%, and NO missing-staff alarm.
    expect(result.coverage.find(c => c.deviceId === 'd2')).toMatchObject({
      required: 0,
      filled: 0,
      missingCount: 0,
      coveragePercent: 100,
    });
    expect(result.overallCoverage).toBe(0);
  });

  it('derives insight staffing KPIs from coverage results, not deviceCount - personnelCount', async () => {
    const prisma = {
      unit: {
        findMany: vi.fn(() => Promise.resolve([
          {
            id: 'u-1', code: 'MR', name: 'Radyoloji', type: 'mr',
            personnel: [{ id: 'p1', name: 'Personel', nightShiftEligible: true, experienceYears: 2 }],
            devices: [{ id: 'd1', code: 'MR-1', mode: 'vardiya', workDays: [1, 2, 3, 4, 5] }],
            schedules: [
              {
                id: 's-1', year: 2026, month: 6,
                assignments: [{ personnelId: 'p1', shiftType: 'day', date: '2026-06-04', personnel: { nightShiftEligible: true } }],
              },
            ],
          },
        ])),
      },
      holiday: { findMany: vi.fn(() => Promise.resolve([])) },
    };
    const coverageMock = {
      evaluateScheduleCoverage: vi.fn(() => Promise.resolve({
        ...EMPTY_COVERAGE,
        lines: [],
        requiredSlots: 10,
        assignedSlots: 8,
        coveragePercent: 80,
        underCoverage: [
          { ...underCoveredLine, shortfall: 1 },
          { ...underCoveredLine, key: 'd1:2026-06-05:day:technician', date: '2026-06-05', shortfall: 1 },
        ],
      })),
    };

    const result = await new InsightsService(prisma as never, coverageMock as never)
      .getDashboardInsights('org-1');

    expect(result.units[0]).toMatchObject({
      staffingGap: 2,
      staffingGapRatio: 20,
      coveragePercent: 80,
      requiredSlots: 10,
      assignedSlots: 8,
    });
    expect(result.summary.unitsWithGaps).toBe(1);
  });
});
