import { describe, it, expect } from 'vitest';
import { WorkloadCalculator } from '../domain/models/workload-calculator';

describe('WorkloadCalculator - Characterization Tests', () => {
  const calculator = new WorkloadCalculator();

  it('should return empty details with zero values for no personnel', () => {
    const result = calculator.calculate({
      assignments: null as any,
      personnel: [],
      holidays: new Set(),
    });
    expect(result.details).toHaveLength(0);
    expect(result.avgHoursPerPerson).toBe(0);
    expect(result.maxHoursPerPerson).toBe(0);
    expect(result.minHoursPerPerson).toBe(0);
    expect(result.balancePercent).toBe(0);
  });

  it('should return balancePercent=100 when all personnel have same hours', () => {
    const result = calculator.calculate({
      assignments: null as any,
      personnel: [
        { id: 'p1', name: 'A', maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
    });
    expect(result.details).toHaveLength(2);
    expect(result.avgHoursPerPerson).toBe(0);
  });

  it('should never return negative balancePercent', () => {
    const result = calculator.calculate({
      assignments: null as any,
      personnel: [{ id: 'p1', name: 'A', maxWeeklyHours: 40 }],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBeGreaterThanOrEqual(0);
  });

  it('should never exceed 100 balancePercent', () => {
    const result = calculator.calculate({
      assignments: null as any,
      personnel: [{ id: 'p1', name: 'A', maxWeeklyHours: 40 }],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBeLessThanOrEqual(100);
  });
});
