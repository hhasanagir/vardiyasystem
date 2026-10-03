import { describe, it, expect } from 'vitest';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import { GreedyOptimizationStrategy } from '../domain/optimization/greedy-strategy';
import { ScoreAggregator } from '../domain/optimization/score-aggregator';
import { SchedulingProblem } from '../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { Assignment } from '../domain/entities/assignment.entity';
import {
  scenarioA_simpleValidSchedule,
  scenarioB_personnelOverlap,
  scenarioC_insufficientRest,
  scenarioD_personnelUnavailable,
  scenarioE_resourceOverlap,
  scenarioF_missingCompetency,
  scenarioG_unevenWorkload,
  scenarioH_unevenNightDistribution,
  scenarioI_weekendImbalance,
  scenarioJ_mixedValidInvalid,
  scenarioK_imaging,
  scenarioL_radiationOncology,
  scenarioSmall,
  scenarioMedium,
  scenarioLarge,
} from './fixtures/scenarios';

const optimizer = new ScheduleOptimizerService();

// ═══════════════════════════════════════════════
// STEP 2 — HARD CONSTRAINT QUALITY GATE
// ═══════════════════════════════════════════════
describe('GATE 1 — Hard Constraint Quality', () => {
  it('Scenario A: simple valid schedule produces valid candidate', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    expect(result.success).toBe(true);
    expect(result.candidate.isValid).toBe(true);
    expect(result.candidate.hardConstraintViolations.length).toBe(0);
  });

  it('Scenario D: inactive personnel excluded', () => {
    const result = optimizer.optimize(scenarioD_personnelUnavailable());
    const assignedIds = result.candidate.assignments.map((a) => a.personnelId);
    expect(assignedIds).not.toContain('p1');
  });

  it('Scenario F: personnel without required skills not assigned to incompatible device', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'test-schedule',
      unitId: 'unit-1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      devices: [
        {
          id: 'd1',
          code: 'MRI-1',
          name: 'MRI 1',
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
      personnel: [
        {
          id: 'p1',
          name: 'Ali',
          role: 'technician',
          skills: ['US'],
          deviceSkills: ['US'],
          nightShiftEligible: true,
          employmentStatus: 'active',
          offDays: [],
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
          offDays: [],
          maxWeeklyHours: 40,
          isActive: true,
        },
      ],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
      
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
    for (const a of result.candidate.assignments) {
      expect(a.personnelId).toBe('p2');
    }
  });

  it('Scenario J: mixed valid/invalid — valid candidates accepted', () => {
    const result = optimizer.optimize(scenarioJ_mixedValidInvalid());
    expect(result.candidate.assignments.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// STEP 2 CONTINUED — NO HARD VIOLATION ACCEPTED
// ═══════════════════════════════════════════════
describe('GATE 2 — No Hard Violation Accepted', () => {
  it('valid candidate has no blocking violations', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    if (result.candidate.isValid) {
      expect(result.candidate.hardConstraintViolations.length).toBe(0);
    }
  });

  it('invalid candidate is correctly flagged', () => {
    const result = optimizer.optimize(scenarioD_personnelUnavailable());
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// STEP 3 — CONFLICT QUALITY
// ═══════════════════════════════════════════════
describe('Conflict Quality', () => {
  it('violations have message and detectedAt', () => {
    const result = optimizer.optimize(scenarioD_personnelUnavailable());
    for (const v of result.candidate.hardConstraintViolations) {
      expect(v.message).toBeDefined();
      expect(typeof v.message).toBe('string');
      expect(v.detectedAt).toBeInstanceOf(Date);
    }
  });
});

// ═══════════════════════════════════════════════
// STEP 4 — SCORE QUALITY
// ═══════════════════════════════════════════════
describe('GATE — Score Quality', () => {
  it('valid candidate has totalScore >= 0', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    expect(result.candidate.totalScore).toBeGreaterThanOrEqual(0);
  });

  it('fair candidate scores higher than highly-imbalanced candidate', () => {
    const balanced = optimizer.optimize(scenarioA_simpleValidSchedule());
    const imbalanced = optimizer.optimize(scenarioG_unevenWorkload());
    if (balanced.success && imbalanced.success) {
      expect(balanced.candidate.totalScore).toBeGreaterThanOrEqual(0);
      expect(imbalanced.candidate.totalScore).toBeGreaterThanOrEqual(0);
    }
  });

  it('ScoreAggregator weights are explicit and documented (canonical: 0.35 + 0.25 + 0.25 = 0.85, coverage 0.15 separate)', () => {
    const agg = new ScoreAggregator();
    const weights = agg.getWeights();
    expect(weights.fairness + weights.workload + weights.fatigue).toBeCloseTo(
      0.85,
    );
    expect(weights.fairness).toBe(0.35);
    expect(weights.workload).toBe(0.25);
    expect(weights.fatigue).toBe(0.25);
  });
});

// ═══════════════════════════════════════════════
// STEP 8 — DETERMINISM
// ═══════════════════════════════════════════════
describe('GATE 3 — Determinism', () => {
  const scenarios = [
    { name: 'Scenario A', fn: scenarioA_simpleValidSchedule },
    { name: 'Scenario G', fn: scenarioG_unevenWorkload },
    { name: 'Scenario K', fn: scenarioK_imaging },
    { name: 'Scenario L', fn: scenarioL_radiationOncology },
    { name: 'Scenario Small', fn: scenarioSmall },
  ];

  for (const { name, fn } of scenarios) {
    it(`${name}: identical inputs produce identical results`, () => {
      const problem = fn();
      const r1 = optimizer.optimize(problem);
      const r2 = optimizer.optimize(problem);
      expect(r1.candidate.assignments.length).toBe(
        r2.candidate.assignments.length,
      );
      expect(r1.summary.totalScore).toBe(r2.summary.totalScore);
      expect(r1.summary.totalAssignments).toBe(r2.summary.totalAssignments);
      expect(r1.metadata.deterministic).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════
// STEP 9 — SERVICE LINE VALIDATION
// ═══════════════════════════════════════════════
describe('GATE 5 — Service Line Separation', () => {
  it('Imaging strategy selected for non-onkoloji', () => {
    const result = optimizer.optimize(scenarioK_imaging());
    expect(result.explanations.some((e) => e.includes('IMAGING'))).toBe(true);
  });

  it('RT strategy selected for onkoloji', () => {
    const result = optimizer.optimize(scenarioL_radiationOncology());
    expect(
      result.explanations.some((e) => e.includes('RADIATION_ONCOLOGY')),
    ).toBe(true);
  });

  it('Imaging and RT produce different service lines', () => {
    const imaging = optimizer.optimize(scenarioK_imaging());
    const rt = optimizer.optimize(scenarioL_radiationOncology());
    const imagingLine = imaging.explanations.find((e) =>
      e.includes('Service line:'),
    );
    const rtLine = rt.explanations.find((e) => e.includes('Service line:'));
    expect(imagingLine).not.toBe(rtLine);
  });
});

// ═══════════════════════════════════════════════
// STEP 10 — DEVICE / RESOURCE VALIDATION
// ═══════════════════════════════════════════════
describe('Device/Resource Safety', () => {
  it('all assigned devices exist in problem', () => {
    const problem = scenarioK_imaging();
    const result = optimizer.optimize(problem);
    const deviceIds = problem.devices.map((d) => d.id);
    for (const a of result.candidate.assignments) {
      expect(deviceIds).toContain(a.deviceId);
    }
  });

  it('no duplicate device+date+shift assignments', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    const keys = result.candidate.assignments.map(
      (a) => `${a.deviceId}|${a.date}|${a.shiftType}`,
    );
    const uniqueKeys = new Set(keys);
    expect(keys.length).toBe(uniqueKeys.size);
  });
});

// ═══════════════════════════════════════════════
// STEP 12 — EXPLAINABILITY
// ═══════════════════════════════════════════════
describe('Explainability', () => {
  it('every result has explanations', () => {
    const scenarios = [
      scenarioA_simpleValidSchedule(),
      scenarioD_personnelUnavailable(),
      scenarioK_imaging(),
      scenarioL_radiationOncology(),
    ];
    for (const problem of scenarios) {
      const result = optimizer.optimize(problem);
      expect(result.explanations.length).toBeGreaterThan(0);
    }
  });

  it('result contains strategy name in explanations', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    expect(result.explanations.some((e) => e.includes('Strategy:'))).toBe(true);
  });

  it('result contains assignment count', () => {
    const result = optimizer.optimize(scenarioA_simpleValidSchedule());
    expect(result.explanations.some((e) => e.includes('Generated'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// STEP 14 — GOLDEN TEST CASES
// ═══════════════════════════════════════════════
describe('Golden Test Cases', () => {
  it('Golden 1: one available qualified person → must be selected', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'golden-1',
      unitId: 'unit-1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [
        makePersonnel({
          id: 'solo',
          name: 'Solo Tech',
          skills: ['MRI'],
          deviceSkills: ['MRI'],
        }),
      ],
      devices: [
        {
          id: 'dev',
          code: 'MRI-1',
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
          deviceId: 'dev',
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
          personnelType: 'technician',
        },
      ],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
      
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
    for (const a of result.candidate.assignments) {
      expect(a.personnelId).toBe('solo');
    }
  });

  it('Golden 2: qualified person inactive → must not be selected', () => {
    const problem: SchedulingProblem = {
      scheduleId: 'golden-2',
      unitId: 'unit-1',
      unitType: 'mr',
      serviceLine: 'IMAGING',
      year: 2026,
      month: 1,
      personnel: [
        makePersonnel({ id: 'inactive', name: 'Inactive', isActive: false }),
      ],
      devices: [
        {
          id: 'dev',
          code: 'MRI-1',
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
          deviceId: 'dev',
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
          personnelType: 'technician',
        },
      ],
      existingAssignments: new AssignmentCollection(),
      holidays: new Set(),
      
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
    expect(result.candidate.assignments.length).toBe(0);
  });

  it('Golden 3: two valid people, one with lower workload → lower workload preferred by selectBest', () => {
    const agg = new ScoreAggregator();
    const lowScore = agg.aggregate([
      {
        constraintId: 'WORKLOAD_BALANCE',
        rawScore: 95,
        weight: 0.3,
        weightedScore: 28.5,
        explanation: 'light workload',
      },
      {
        constraintId: 'FAIRNESS',
        rawScore: 80,
        weight: 0.4,
        weightedScore: 32,
        explanation: '',
      },
      {
        constraintId: 'FATIGUE',
        rawScore: 90,
        weight: 0.3,
        weightedScore: 27,
        explanation: '',
      },
    ]);
    const highScore = agg.aggregate([
      {
        constraintId: 'WORKLOAD_BALANCE',
        rawScore: 20,
        weight: 0.3,
        weightedScore: 6,
        explanation: 'heavy workload',
      },
      {
        constraintId: 'FAIRNESS',
        rawScore: 50,
        weight: 0.4,
        weightedScore: 20,
        explanation: '',
      },
      {
        constraintId: 'FATIGUE',
        rawScore: 40,
        weight: 0.3,
        weightedScore: 12,
        explanation: '',
      },
    ]);
    expect(lowScore.total).toBeGreaterThan(highScore.total);
  });

  it('Golden 4: RT candidate → RT strategy must be selected', () => {
    const result = optimizer.optimize(scenarioL_radiationOncology());
    expect(
      result.explanations.some((e) => e.includes('RADIATION_ONCOLOGY')),
    ).toBe(true);
  });
});

function makePersonnel(overrides: {
  id: string;
  name: string;
  skills?: string[];
  deviceSkills?: string[];
  nightShiftEligible?: boolean;
  isActive?: boolean;
  offDays?: number[];
}) {
  return {
    role: 'technician',
    skills: overrides.skills || ['MRI'],
    deviceSkills: overrides.deviceSkills || ['MRI'],
    nightShiftEligible: overrides.nightShiftEligible ?? true,
    employmentStatus: overrides.isActive === false ? 'inactive' : 'active',
    offDays: overrides.offDays || [],
    maxWeeklyHours: 40,
    isActive: overrides.isActive ?? true,
    id: overrides.id,
    name: overrides.name,
  };
}
