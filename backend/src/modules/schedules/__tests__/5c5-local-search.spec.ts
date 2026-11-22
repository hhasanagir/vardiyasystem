import { describe, it, expect } from 'vitest';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import { LocalSearchOptimizationStrategy } from '../domain/optimization/local-search-strategy';
import { SchedulingProblem } from '../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../domain/entities/assignment-collection';

function createTestProblem(overrides?: Partial<SchedulingProblem>): SchedulingProblem {
  return {
    scheduleId: 'test-schedule-1',
    unitId: 'unit-1',
    unitType: 'mr',
    serviceLine: 'IMAGING',
    year: 2026,
    month: 1,
    personnel: [
      { id: 'p1', name: 'Ali', role: 'technician', skills: ['MRI'], deviceSkills: ['MRI'], nightShiftEligible: true, employmentStatus: 'active', offDays: [0], maxWeeklyHours: 40, isActive: true },
      { id: 'p2', name: 'Veli', role: 'technician', skills: ['MRI'], deviceSkills: ['MRI'], nightShiftEligible: true, employmentStatus: 'active', offDays: [6], maxWeeklyHours: 40, isActive: true },
      { id: 'p3', name: 'Ayse', role: 'technician', skills: ['MRI'], deviceSkills: ['MRI'], nightShiftEligible: false, employmentStatus: 'active', offDays: [0, 6], maxWeeklyHours: 40, isActive: true },
    ],
    devices: [
      { id: 'd1', code: 'MRI-1', name: 'MRI Scanner 1', mode: 'continuous', requiredSkills: ['MRI'], workDays: [1, 2, 3, 4, 5], startHour: 8, endHour: 16 },
    ],
    shiftDefinitions: [
      { deviceId: 'd1', shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician' },
    ],
    existingAssignments: new AssignmentCollection(),
    holidays: new Set(['2026-01-01']),
    deviceOffDates: new Set(),
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

describe('ScheduleOptimizerService local-search strategy', () => {
  const optimizer = new ScheduleOptimizerService();

  it('should register the local-search strategy as selectable', () => {
    const strategies = optimizer.getAvailableStrategies();
    expect(strategies.some(s => s.id === 'local-search')).toBe(true);
  });

  it('should optimize a simple problem with local-search', () => {
    const result = optimizer.optimize(createTestProblem(), 'local-search');
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('local-search');
    expect(result.candidate.assignments.length).toBeGreaterThan(0);
    expect(result.summary.totalAssignments).toBeGreaterThan(0);
  });

  it('should be deterministic', () => {
    const problem = createTestProblem();
    const r1 = optimizer.optimize(problem, 'local-search');
    const r2 = optimizer.optimize(problem, 'local-search');
    expect(r1.candidate.assignments.length).toBe(r2.candidate.assignments.length);
    expect(r1.summary.totalScore).toBe(r2.summary.totalScore);
  });

  it('should never produce hard violations for a valid problem', () => {
    const result = optimizer.optimize(createTestProblem(), 'local-search');
    expect(result.success).toBe(true);
    expect(result.candidate.isValid).toBe(true);
    expect(result.summary.hardViolations).toBe(0);
  });

  it('should never worsen the score relative to greedy', () => {
    const problem = createTestProblem();
    const greedy = optimizer.optimize(problem, 'greedy');
    const local = optimizer.optimize(problem, 'local-search');
    expect(local.summary.totalScore).toBeGreaterThanOrEqual(greedy.summary.totalScore);
  });

  it('should produce measurable metadata and mark deterministic', () => {
    const result = optimizer.optimize(createTestProblem(), 'local-search');
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.deterministic).toBe(true);
  });

  it('should produce explanation strings', () => {
    const result = optimizer.optimize(createTestProblem(), 'local-search');
    expect(result.explanations.length).toBeGreaterThan(0);
  });

  it('should respect DEVICE_OFF_DATE blocking (no assignment on off date)', () => {
    const problem = createTestProblem({
      deviceOffDates: new Set(['d1:2026-01-15']),
    });
    const result = optimizer.optimize(problem, 'local-search');
    expect(result.success).toBe(true);
    const onOffDate = result.candidate.assignments.filter(a => a.date === '2026-01-15');
    expect(onOffDate).toHaveLength(0);
  });

  it('should work with empty personnel', () => {
    const result = optimizer.optimize(createTestProblem({ personnel: [] }), 'local-search');
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('should work with empty devices', () => {
    const result = optimizer.optimize(createTestProblem({ devices: [] }), 'local-search');
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });
});

describe('LocalSearchOptimizationStrategy contract', () => {
  const strategy = new LocalSearchOptimizationStrategy();

  it('should have correct id and name', () => {
    expect(strategy.id).toBe('local-search');
    expect(strategy.name).toBe('Local Search Optimization');
  });

  it('should produce a valid candidate for a simple problem', () => {
    const result = strategy.optimize(createTestProblem(), {
      maxIterations: 50,
      timeLimitMs: 5000,
      strategyConfig: {},
    });
    expect(result.success).toBe(true);
    expect(result.strategy).toBe('local-search');
  });
});
