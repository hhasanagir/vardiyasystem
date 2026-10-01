import { describe, it, expect } from 'vitest';
import {
  MIN_REST_HOURS,
  REQUIRED_REST_HOURS,
  MAX_CONSECUTIVE_NIGHTS,
} from '../domain/constants';
import { FairnessEngine } from '../domain/models/fairness-engine';
import {
  FatigueEngine,
  WORKLOAD_LIMITS,
  DEFAULT_FATIGUE_COEFFICIENTS,
} from '../domain/models/fatigue-engine';
import { WorkloadCalculator } from '../domain/models/workload-calculator';
import {
  ServiceLine,
  createSchedulingStrategy,
} from '../domain/strategies/scheduling-strategy';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

const emptyAssignments = new AssignmentCollection();

describe('MIN_REST_HOURS - Canonical Value', () => {
  it('constants.ts MIN_REST_HOURS should be 11', () => {
    expect(MIN_REST_HOURS).toBe(11);
  });

  it('constants.ts REQUIRED_REST_HOURS should be 11', () => {
    expect(REQUIRED_REST_HOURS).toBe(11);
  });

  it('constants values should be consistent', () => {
    expect(MIN_REST_HOURS).toBe(REQUIRED_REST_HOURS);
  });

  it('MAX_CONSECUTIVE_NIGHTS should be 3', () => {
    expect(MAX_CONSECUTIVE_NIGHTS).toBe(3);
  });
});

describe('FatigueEngine - Canonical Constants', () => {
  it('WORKLOAD_LIMITS.minRecoveryHoursLegal should match REQUIRED_REST_HOURS (11)', () => {
    expect(WORKLOAD_LIMITS.minRecoveryHoursLegal).toBe(REQUIRED_REST_HOURS);
  });

  it('WORKLOAD_LIMITS.maxConsecutiveDays should be 6', () => {
    expect(WORKLOAD_LIMITS.maxConsecutiveDays).toBe(6);
  });

  it('WORKLOAD_LIMITS.maxNightShiftsPerWeek should be 3', () => {
    expect(WORKLOAD_LIMITS.maxNightShiftsPerWeek).toBe(3);
  });
});

describe('FairnessEngine - Canonical Weights', () => {
  it('should use nightWeight=0.25, weekendWeight=0.20, holidayWeight=0.15, workloadWeight=0.40', () => {
    const engine = new FairnessEngine();
    const result = engine.calculate({
      assignments: emptyAssignments,
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    const expected =
      result.nightScore * 0.25 +
      result.weekendScore * 0.2 +
      result.holidayScore * 0.15 +
      result.workloadScore * 0.4;
    expect(result.overallScore).toBe(Math.round(expected * 10) / 10);
  });
});

describe('Hard/Soft Constraint Invariants', () => {
  it('fatigue score must be clamped 0..100 under all conditions', () => {
    const engine = new FatigueEngine();

    const results = [
      engine.evaluate({
        candidateDate: '2026-01-01',
        candidateShiftType: 'day',
        candidateStartTime: '08:00',
        candidateEndTime: '16:00',
        personnelId: 'p1',
        existingAssignments: emptyAssignments,
        holidays: new Set(['2026-01-01']),
      }),
      engine.evaluate({
        candidateDate: '2026-01-05',
        candidateShiftType: 'day',
        candidateStartTime: '08:00',
        candidateEndTime: '16:00',
        personnelId: 'p1',
        existingAssignments: emptyAssignments,
        holidays: new Set(),
      }),
    ];

    for (const result of results) {
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });

  it('soft constraints must NOT invalidate candidates - score remains valid', () => {
    const engine = new FatigueEngine();
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(),
    });
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe('low');
  });

  it('workload calculator balance must be clamped 0..100', () => {
    const calculator = new WorkloadCalculator();
    const result = calculator.calculate({
      assignments: emptyAssignments,
      personnel: [{ id: 'p1', name: 'A', maxWeeklyHours: 40 }],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBeGreaterThanOrEqual(0);
    expect(result.balancePercent).toBeLessThanOrEqual(100);
  });
});

describe('Service Line Strategy', () => {
  it('should create Imaging strategy', () => {
    const strategy = createSchedulingStrategy(ServiceLine.IMAGING);
    expect(strategy.serviceLine).toBe(ServiceLine.IMAGING);
  });

  it('should create Radiation Oncology strategy', () => {
    const strategy = createSchedulingStrategy(ServiceLine.RADIATION_ONCOLOGY);
    expect(strategy.serviceLine).toBe(ServiceLine.RADIATION_ONCOLOGY);
  });

  it('Imaging and RT strategies should be separate instances', () => {
    const imaging = createSchedulingStrategy(ServiceLine.IMAGING);
    const rt = createSchedulingStrategy(ServiceLine.RADIATION_ONCOLOGY);
    expect(imaging.serviceLine).not.toBe(rt.serviceLine);
  });

  it('RT strategy should have RT-specific hard constraints', () => {
    const rt = createSchedulingStrategy(ServiceLine.RADIATION_ONCOLOGY);
    const hardConstraints = rt.getExtraHardConstraints();
    expect(hardConstraints).toContain('RT_DOSE_LIMIT');
    expect(hardConstraints).toContain('RT_MACHINE_QUALIFICATION');
    expect(hardConstraints).toContain('RT_TREATMENT_PROTOCOL');
  });

  it('Imaging strategy should not contain RT constraints', () => {
    const imaging = createSchedulingStrategy(ServiceLine.IMAGING);
    const hardConstraints = imaging.getExtraHardConstraints();
    expect(hardConstraints).not.toContain('RT_DOSE_LIMIT');
    expect(hardConstraints).not.toContain('RT_MACHINE_QUALIFICATION');
  });
});
