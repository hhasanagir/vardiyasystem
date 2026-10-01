import { describe, it, expect } from 'vitest';
import {
  FatigueEngine,
  DEFAULT_FATIGUE_COEFFICIENTS,
  WORKLOAD_LIMITS,
} from '../domain/models/fatigue-engine';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

const emptyAssignments = new AssignmentCollection();

describe('FatigueEngine - Characterization Tests', () => {
  const engine = new FatigueEngine();

  it('should return score=100 and riskLevel=low with no history', () => {
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
    expect(result.factors).toHaveLength(0);
  });

  it('should penalize weekend shifts', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-04',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.factors.some((f) => f.type === 'weekend_work')).toBe(true);
  });

  it('should penalize holiday shifts', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.factors.some((f) => f.type === 'holiday_work')).toBe(true);
  });

  it('should use canonical REQUIRED_REST_HOURS for short rest detection', () => {
    expect(WORKLOAD_LIMITS.minRecoveryHoursLegal).toBe(11);
  });

  it('should use canonical MAX_CONSECUTIVE_NIGHTS', () => {
    expect(DEFAULT_FATIGUE_COEFFICIENTS.consecutiveNightPenalty).toBe(0.15);
  });

  it('should never return negative scores', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'night',
      candidateStartTime: '22:00',
      candidateEndTime: '06:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('should never exceed 100', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(),
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('riskLevel should be one of: low, medium, high, critical', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(),
    });
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
  });

  it('should allow custom coefficients', () => {
    const custom = new FatigueEngine({ consecutiveNightPenalty: 0.5 });
    const result = custom.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: emptyAssignments,
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });
});
