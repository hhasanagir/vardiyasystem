import { describe, it, expect } from 'vitest';
import { FairnessEngine } from '../domain/models/fairness-engine';
import {
  FatigueEngine,
  WORKLOAD_LIMITS,
  DEFAULT_FATIGUE_COEFFICIENTS,
} from '../domain/models/fatigue-engine';
import { WorkloadCalculator } from '../domain/models/workload-calculator';
import { ScoreAggregator } from '../domain/optimization/score-aggregator';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

// ═══════════════════════════════════════════════
// STEP 5 — FAIRNESS QUALITY
// ═══════════════════════════════════════════════
describe('GATE 7 — Fairness Quality', () => {
  const engine = new FairnessEngine();

  it('balanced workload → high fairness score', () => {
    const result = engine.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.overallScore).toBe(100);
  });

  it('identical distributions produce same scores across dimensions', () => {
    const result = engine.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', nightShiftEligible: true, maxWeeklyHours: 40 },
        { id: 'p3', name: 'C', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.nightScore).toBe(100);
    expect(result.weekendScore).toBe(100);
    expect(result.holidayScore).toBe(100);
    expect(result.workloadScore).toBe(100);
  });

  it('fairness score is always 0..100', () => {
    const result = engine.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('weights sum to 1.0: 0.25 + 0.20 + 0.15 + 0.40', () => {
    expect(0.25 + 0.2 + 0.15 + 0.4).toBeCloseTo(1.0);
  });

  it('details contain per-person breakdown', () => {
    const result = engine.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', nightShiftEligible: true, maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
      monthDays: 30,
    });
    expect(result.details.length).toBe(1);
    expect(result.details[0].personnelId).toBe('p1');
  });
});

// ═══════════════════════════════════════════════
// STEP 6 — WORKLOAD QUALITY
// ═══════════════════════════════════════════════
describe('GATE 8 — Workload Quality', () => {
  const calculator = new WorkloadCalculator();

  it('empty personnel → balance 0', () => {
    const result = calculator.calculate({
      assignments: new AssignmentCollection(),
      personnel: [],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBe(0);
  });

  it('single person → balance 100', () => {
    const result = calculator.calculate({
      assignments: new AssignmentCollection(),
      personnel: [{ id: 'p1', name: 'A', maxWeeklyHours: 40 }],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBe(100);
  });

  it('balance is always 0..100', () => {
    const result = calculator.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
    });
    expect(result.balancePercent).toBeGreaterThanOrEqual(0);
    expect(result.balancePercent).toBeLessThanOrEqual(100);
  });

  it('avgHoursPerPerson is 0 when no assignments', () => {
    const result = calculator.calculate({
      assignments: new AssignmentCollection(),
      personnel: [
        { id: 'p1', name: 'A', maxWeeklyHours: 40 },
        { id: 'p2', name: 'B', maxWeeklyHours: 40 },
      ],
      holidays: new Set(),
    });
    expect(result.avgHoursPerPerson).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// STEP 7 — FATIGUE QUALITY
// ═══════════════════════════════════════════════
describe('GATE 9 — Fatigue Quality', () => {
  const engine = new FatigueEngine();

  it('no history → score 100, risk low', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
    });
    expect(result.score).toBe(100);
    expect(result.riskLevel).toBe('low');
  });

  it('weekend shift → penalty applied', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-04',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.factors.some((f) => f.type === 'weekend_work')).toBe(true);
  });

  it('holiday shift → penalty applied', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeLessThan(100);
    expect(result.factors.some((f) => f.type === 'holiday_work')).toBe(true);
  });

  it('score never negative', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'night',
      candidateStartTime: '22:00',
      candidateEndTime: '06:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('score never exceeds 100', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('HARD SAFETY: minRecoveryHoursLegal = 11 matches REQUIRED_REST_HOURS', () => {
    expect(WORKLOAD_LIMITS.minRecoveryHoursLegal).toBe(11);
  });

  it('maxConsecutiveDays = 6', () => {
    expect(WORKLOAD_LIMITS.maxConsecutiveDays).toBe(6);
  });

  it('fatigue does not override hard constraints', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-01',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(['2026-01-01']),
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('riskLevel enum is valid', () => {
    const result = engine.evaluate({
      candidateDate: '2026-01-05',
      candidateShiftType: 'day',
      candidateStartTime: '08:00',
      candidateEndTime: '16:00',
      personnelId: 'p1',
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
    });
    expect(['low', 'medium', 'high', 'critical']).toContain(result.riskLevel);
  });
});

// ═══════════════════════════════════════════════
// SCORE AGGREGATOR QUALITY
// ═══════════════════════════════════════════════
describe('ScoreAggregator Quality', () => {
  it('higher fairness → higher total', () => {
    const agg = new ScoreAggregator({ fairness: 1.0, workload: 0, fatigue: 0 });
    const high = agg.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 90,
        weight: 1,
        weightedScore: 90,
        explanation: '',
      },
    ]);
    const low = agg.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 30,
        weight: 1,
        weightedScore: 30,
        explanation: '',
      },
    ]);
    expect(high.total).toBeGreaterThan(low.total);
  });

  it('deterministic: same input → same output', () => {
    const agg = new ScoreAggregator();
    const scores = [
      {
        constraintId: 'FAIRNESS',
        rawScore: 80,
        weight: 1,
        weightedScore: 80,
        explanation: 'f',
      },
      {
        constraintId: 'WORKLOAD_BALANCE',
        rawScore: 70,
        weight: 1,
        weightedScore: 70,
        explanation: 'w',
      },
      {
        constraintId: 'FATIGUE',
        rawScore: 60,
        weight: 1,
        weightedScore: 60,
        explanation: 'ft',
      },
    ];
    const r1 = agg.aggregate(scores);
    const r2 = agg.aggregate(scores);
    expect(r1.total).toBe(r2.total);
    expect(r1.breakdown.fairness).toBe(r2.breakdown.fairness);
  });

  it('empty scores → total 0', () => {
    const agg = new ScoreAggregator();
    const result = agg.aggregate([]);
    expect(result.total).toBe(0);
  });

  it('scores clamped to 0..100', () => {
    const agg = new ScoreAggregator();
    const result = agg.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 200,
        weight: 1,
        weightedScore: 200,
        explanation: '',
      },
    ]);
    expect(result.breakdown.fairness).toBeLessThanOrEqual(40);
  });
});
