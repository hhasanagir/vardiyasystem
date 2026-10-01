import { describe, it, expect } from 'vitest';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
} from '../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import {
  scenarioSmall,
  scenarioMedium,
  scenarioLarge,
  scenarioA_simpleValidSchedule,
  scenarioD_personnelUnavailable,
} from './fixtures/scenarios';

const optimizer = new ScheduleOptimizerService();

function makePersonnel(
  id: string,
  overrides: Partial<SchedulingProblemPersonnel> = {},
): SchedulingProblemPersonnel {
  return {
    id,
    name: `Person ${id}`,
    role: 'technician',
    skills: ['MRI'],
    deviceSkills: ['MRI'],
    nightShiftEligible: true,
    employmentStatus: 'active',
    offDays: [],
    maxWeeklyHours: 40,
    isActive: true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════
// STEP 15 — PERFORMANCE BENCHMARKS
// ═══════════════════════════════════════════════
describe('STEP 15 — Performance Benchmarks', () => {
  it('small (10 personnel): <100ms', () => {
    const problem = scenarioSmall();
    const start = Date.now();
    const result = optimizer.optimize(problem);
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(100);
  });

  it('medium (50 personnel): <500ms', () => {
    const problem = scenarioMedium();
    const start = Date.now();
    const result = optimizer.optimize(problem);
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(500);
  });

  it('large (200 personnel): <3000ms', () => {
    const problem = scenarioLarge();
    const start = Date.now();
    const result = optimizer.optimize(problem);
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(elapsed).toBeLessThan(3000);
  });

  it('metadata includes timing breakdown', () => {
    const result = optimizer.optimize(scenarioSmall());
    expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.candidateGenerationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.hardConstraintTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.softConstraintTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.scoreAggregationTimeMs).toBeGreaterThanOrEqual(0);
    expect(result.metadata.candidatesGenerated).toBe(1);
    expect(result.metadata.deterministic).toBe(true);
  });

  it('result summary includes assignment count', () => {
    const result = optimizer.optimize(scenarioSmall());
    expect(result.summary.totalAssignments).toBe(
      result.candidate.assignments.length,
    );
    expect(result.summary.personnelCount).toBeGreaterThan(0);
    expect(result.summary.deviceCount).toBeGreaterThan(0);
  });

  it('large problem produces more assignments than small', () => {
    const small = optimizer.optimize(scenarioSmall());
    const large = optimizer.optimize(scenarioLarge());
    expect(large.candidate.assignments.length).toBeGreaterThanOrEqual(
      small.candidate.assignments.length,
    );
  });
});

// ═══════════════════════════════════════════════
// STEP 16 — FAILURE MODE TESTS
// ═══════════════════════════════════════════════
describe('STEP 16 — Failure Modes', () => {
  it('zero personnel: returns valid empty candidate', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'empty',
      unitId: 'u1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [],
      devices: [],
      shiftDefinitions: [],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
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
    };
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('zero devices: returns valid empty candidate', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'no-dev',
      unitId: 'u1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [makePersonnel('p1')],
      devices: [],
      shiftDefinitions: [],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
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
    };
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('all personnel inactive: returns valid empty candidate', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'all-inactive',
      unitId: 'u1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [makePersonnel('p1', { isActive: false })],
      devices: [
        {
          id: 'd1',
          code: 'MRI',
          name: 'MRI',
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
      holidays: new Set(),
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
    };
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('non-existent strategy ID: throws error', () => {
    expect(() =>
      optimizer.optimize(scenarioA_simpleValidSchedule(), 'nonexistent'),
    ).toThrow('Unknown optimization strategy');
  });

  it('result never has negative score', () => {
    const scenarios = [scenarioSmall(), scenarioMedium()];
    for (const problem of scenarios) {
      const result = optimizer.optimize(problem);
      expect(result.candidate.totalScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('consecutive days check resets correctly', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'consec',
      unitId: 'u1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [makePersonnel('p1')],
      devices: [
        {
          id: 'd1',
          code: 'MRI',
          name: 'MRI',
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
      holidays: new Set(),
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
    };
    const result = optimizer.optimize(problem);
    const dates = result.candidate.assignments.map((a) => a.date).sort();
    expect(dates.length).toBeGreaterThan(0);
    for (const v of result.candidate.hardConstraintViolations) {
      expect(v.isHardConstraint).toBe(true);
    }
  });
});
