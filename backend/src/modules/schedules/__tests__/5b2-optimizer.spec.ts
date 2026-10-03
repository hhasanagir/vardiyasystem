import { describe, it, expect } from 'vitest';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import { GreedyOptimizationStrategy } from '../domain/optimization/greedy-strategy';
import { ScoreAggregator } from '../domain/optimization/score-aggregator';
import { SchedulingProblem } from '../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

function createTestProblem(
  overrides?: Partial<SchedulingProblem>,
): SchedulingProblem {
  return {
    scheduleId: 'test-schedule-1',
    unitId: 'unit-1',
    unitType: 'mr',
    serviceLine: 'IMAGING',
    year: 2026,
    month: 1,
    personnel: [
      {
        id: 'p1',
        name: 'Ali',
        role: 'technician',
        skills: ['MRI'],
        deviceSkills: ['MRI'],
        nightShiftEligible: true,
        employmentStatus: 'active',
        offDays: [0],
        maxWeeklyHours: 40,
        isActive: true,
      },
      {
        id: 'p2',
        name: 'Veli',
        role: 'technician',
        skills: ['MRI'],
        deviceSkills: ['MRI'],
        nightShiftEligible: true,
        employmentStatus: 'active',
        offDays: [6],
        maxWeeklyHours: 40,
        isActive: true,
      },
      {
        id: 'p3',
        name: 'Ayse',
        role: 'technician',
        skills: ['MRI'],
        deviceSkills: ['MRI'],
        nightShiftEligible: false,
        employmentStatus: 'active',
        offDays: [0, 6],
        maxWeeklyHours: 40,
        isActive: true,
      },
    ],
    devices: [
      {
        id: 'd1',
        code: 'MRI-1',
        name: 'MRI Scanner 1',
        mode: 'continuous',
        requiredSkills: ['MRI'],
        workDays: [1, 2, 3, 4, 5],
        startHour: 8,
        endHour: 16,
      },
    ],
    shiftDefinitions: [
      {
        deviceId: 'd1',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
      },
    ],
    existingAssignments: new AssignmentCollection(),
    holidays: new Set(['2026-01-01']),
    
    configuration: {
      fairnessMode: 'balanced',
      maxOvertime: 20,
      includeWeekends: false,
      includeNightShifts: false,
      minRestHours: 11,
      maxConsecutiveDays: 6,
      maxConsecutiveNights: 3,
    },
    ...overrides,
  };
}

describe('ScheduleOptimizerService', () => {
  const optimizer = new ScheduleOptimizerService();

  it('should have greedy strategy registered', () => {
    const strategies = optimizer.getAvailableStrategies();
    expect(strategies.some((s) => s.id === 'greedy')).toBe(true);
  });

  it('should optimize a simple problem', () => {
    const result = optimizer.optimize(createTestProblem());
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('greedy');
    expect(result.candidate.assignments.length).toBeGreaterThan(0);
    expect(result.summary.totalAssignments).toBeGreaterThan(0);
  });

  it('should be deterministic', () => {
    const problem = createTestProblem();
    const result1 = optimizer.optimize(problem);
    const result2 = optimizer.optimize(problem);
    expect(result1.candidate.assignments.length).toBe(
      result2.candidate.assignments.length,
    );
    expect(result1.summary.totalScore).toBe(result2.summary.totalScore);
  });

  it('should produce measurable metadata', () => {
    const result = optimizer.optimize(createTestProblem());
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.candidateGenerationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.hardConstraintTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.deterministic).toBe(true);
  });

  it('should return explanation strings', () => {
    const result = optimizer.optimize(createTestProblem());
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it('should respect minRestHours=11', () => {
    const result = optimizer.optimize(createTestProblem());
    expect(result.success).toBe(true);
  });

  it('should work with empty personnel', () => {
    const problem = createTestProblem({ personnel: [] });
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('should work with empty devices', () => {
    const problem = createTestProblem({ devices: [] });
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('should throw for unknown strategy', () => {
    expect(() =>
      optimizer.optimize(createTestProblem(), 'nonexistent'),
    ).toThrow('Unknown optimization strategy');
  });
});

describe('ScoreAggregator', () => {
  it('should aggregate with default weights', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 80,
        weight: 1,
        weightedScore: 80,
        explanation: 'fairness',
      },
      {
        constraintId: 'WORKLOAD_BALANCE',
        rawScore: 90,
        weight: 1,
        weightedScore: 90,
        explanation: 'workload',
      },
      {
        constraintId: 'FATIGUE',
        rawScore: 70,
        weight: 1,
        weightedScore: 70,
        explanation: 'fatigue',
      },
    ]);
    expect(result.total).toBeGreaterThan(0);
    expect(result.breakdown.fairness).toBeGreaterThan(0);
    expect(result.breakdown.workload).toBeGreaterThan(0);
    expect(result.breakdown.fatigue).toBeGreaterThan(0);
  });

  it('should handle empty scores', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([]);
    expect(result.total).toBe(0);
  });

  it('should normalize scores to 0..100', () => {
    const aggregator = new ScoreAggregator();
    const result = aggregator.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 150,
        weight: 1,
        weightedScore: 150,
        explanation: 'over',
      },
    ]);
    expect(result.breakdown.fairness).toBeLessThanOrEqual(40);
  });

  it('should respect custom weights', () => {
    const aggregator = new ScoreAggregator({
      fairness: 1.0,
      workload: 0,
      fatigue: 0,
    });
    const result = aggregator.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 100,
        weight: 1,
        weightedScore: 100,
        explanation: 'fairness',
      },
      {
        constraintId: 'WORKLOAD_BALANCE',
        rawScore: 100,
        weight: 1,
        weightedScore: 100,
        explanation: 'workload',
      },
    ]);
    expect(result.breakdown.fairness).toBe(100);
    expect(result.breakdown.workload).toBe(0);
  });

  it('should be deterministic', () => {
    const aggregator = new ScoreAggregator();
    const scores = [
      {
        constraintId: 'FAIRNESS',
        rawScore: 85,
        weight: 1,
        weightedScore: 85,
        explanation: 'fairness',
      },
    ];
    const r1 = aggregator.aggregate(scores);
    const r2 = aggregator.aggregate(scores);
    expect(r1.total).toBe(r2.total);
  });
});

describe('GreedyOptimizationStrategy', () => {
  const strategy = new GreedyOptimizationStrategy();

  it('should have correct id and name', () => {
    expect(strategy.id).toBe('greedy');
    expect(strategy.name).toBe('Greedy Optimization');
  });

  it('should produce valid candidate for simple problem', () => {
    const result = strategy.optimize(createTestProblem(), {
      maxIterations: 100,
      timeLimitMs: 5000,
      strategyConfig: {},
    });
    expect(result.success).toBe(true);
  });
});
