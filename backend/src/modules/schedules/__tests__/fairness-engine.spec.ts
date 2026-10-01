import { describe, it, expect } from 'vitest';
import {
  FairnessEngine,
  FairnessInput,
  FairnessPersonnelInfo,
} from '../domain/models/fairness-engine';

function makeFairnessInput(
  personnel: FairnessPersonnelInfo[],
  assignFn: (pid: string) => {
    nights: number;
    weekends: number;
    holidays: number;
    hours: number;
  },
): FairnessInput {
  return {
    assignments: null as any,
    personnel,
    holidays: new Set(['2026-01-01', '2026-04-23']),
    monthDays: 30,
  };
}

describe('FairnessEngine - Characterization Tests', () => {
  it('should return 100 for all dimensions when no personnel exist', () => {
    const engine = new FairnessEngine();
    const result = engine.calculate({
      assignments: null as any,
      personnel: [],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.overallScore).toBe(100);
    expect(result.nightScore).toBe(100);
    expect(result.weekendScore).toBe(100);
    expect(result.holidayScore).toBe(100);
    expect(result.workloadScore).toBe(100);
  });

  it('should use canonical weights: night=0.25, weekend=0.20, holiday=0.15, workload=0.40', () => {
    const engine = new FairnessEngine();
    const input: FairnessInput = {
      assignments: null as any,
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    };
    const result = engine.calculate(input);
    const expected =
      result.nightScore * 0.25 +
      result.weekendScore * 0.2 +
      result.holidayScore * 0.15 +
      result.workloadScore * 0.4;
    expect(result.overallScore).toBe(Math.round(expected * 10) / 10);
  });

  it('should score 100 when all personnel have identical distributions', () => {
    const engine = new FairnessEngine();
    const input: FairnessInput = {
      assignments: null as any,
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    };
    const result = engine.calculate(input);
    expect(result.nightScore).toBe(100);
    expect(result.weekendScore).toBe(100);
    expect(result.holidayScore).toBe(100);
  });

  it('should never return negative scores', () => {
    const engine = new FairnessEngine();
    const result = engine.calculate({
      assignments: null as any,
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.nightScore).toBeGreaterThanOrEqual(0);
    expect(result.weekendScore).toBeGreaterThanOrEqual(0);
    expect(result.holidayScore).toBeGreaterThanOrEqual(0);
    expect(result.workloadScore).toBeGreaterThanOrEqual(0);
  });
});
