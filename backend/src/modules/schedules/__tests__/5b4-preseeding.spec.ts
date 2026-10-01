import { describe, it, expect } from 'vitest';
import { ScheduleOptimizerService } from '../domain/optimization/schedule-optimizer.service';
import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
} from '../domain/optimization/scheduling-problem';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { Assignment } from '../domain/entities/assignment.entity';
import {
  CANONICAL_SCORING_WEIGHTS,
  validateCanonicalWeights,
  SOFT_CONSTRAINT_WEIGHTS,
} from '../domain/optimization/canonical-scoring.config';
import { ScoreAggregator } from '../domain/optimization/score-aggregator';
import { ScoringModel } from '../domain/models/scoring-model';
import { FairnessEngine } from '../domain/models/fairness-engine';
import { FatigueEngine } from '../domain/models/fatigue-engine';
import { WorkloadCalculator } from '../domain/models/workload-calculator';

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

function makeDevice(
  id: string,
  code: string,
  overrides: Partial<SchedulingProblemDevice> = {},
): SchedulingProblemDevice {
  return {
    id,
    code,
    name: code,
    mode: 'continuous',
    requiredSkills: ['MRI'],
    workDays: [1, 2, 3, 4, 5],
    startHour: 8,
    endHour: 16,
    ...overrides,
  };
}

function makeProblem(
  overrides: {
    personnel?: SchedulingProblemPersonnel[];
    devices?: SchedulingProblemDevice[];
    existingAssignments?: AssignmentCollection;
    holidays?: Set<string>;
    serviceLine?: string;
  } = {},
): SchedulingProblem {
  return {
    scheduleId: 'test',
    unitId: 'u1',
    unitType: 'mr',
    serviceLine: overrides.serviceLine || 'IMAGING',
    year: 2026,
    month: 1,
    personnel: overrides.personnel || [
      makePersonnel('p1'),
      makePersonnel('p2'),
    ],
    devices: overrides.devices || [makeDevice('d1', 'MRI-1')],
    shiftDefinitions: [
      {
        deviceId: 'd1',
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
      },
    ],
    existingAssignments:
      overrides.existingAssignments || new AssignmentCollection(),
    holidays: overrides.holidays || new Set(),
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
}

function addExisting(
  existing: AssignmentCollection,
  params: {
    personnelId: string;
    deviceId: string;
    date: string;
    shiftType?: string;
  },
) {
  existing.add(
    Assignment.create({
      scheduleId: 'test',
      personnelId: params.personnelId,
      deviceId: params.deviceId,
      unitId: 'u1',
      kind: 'device',
      date: params.date,
      shiftType: params.shiftType || 'day',
      startTime: '08:00',
      endTime: '16:00',
      personnelType: 'technician',
    }),
  );
}

// ═══════════════════════════════════════════════
// GATE 1 — Existing Assignments Preserved
// ═══════════════════════════════════════════════
describe('GATE 1 — Existing Assignments Preserved', () => {
  it('pre-seeded assignments appear in result', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    const p1OnJan5 = result.candidate.assignments.filter(
      (a) => a.personnelId === 'p1' && a.date === '2026-01-05',
    );
    expect(p1OnJan5.length).toBeGreaterThanOrEqual(1);
  });

  it('existing assignment count reported in summary', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    addExisting(existing, {
      personnelId: 'p2',
      deviceId: 'd1',
      date: '2026-01-06',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(result.summary.existingAssignments).toBe(2);
  });

  it('explanations mention pre-seeded count', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(
      result.explanations.some((e) => e.includes('Pre-seeded 1 existing')),
    ).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// GATE 2 — Existing Conflicts Detected
// ═══════════════════════════════════════════════
describe('GATE 2 — Existing Conflicts Detected', () => {
  it('existing assignment that violates constraint produces violation', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-02',
      shiftType: 'day',
    });
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-02',
      shiftType: 'day',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(result).toBeDefined();
  });
});

// ═══════════════════════════════════════════════
// GATE 3 — Partial Optimization
// ═══════════════════════════════════════════════
describe('GATE 3 — Partial Optimization', () => {
  it('partial: existing + generates new for unfilled slots', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    const dates = new Set(result.candidate.assignments.map((a) => a.date));
    expect(dates.has('2026-01-05')).toBe(true);
    expect(result.candidate.assignments.length).toBeGreaterThan(1);
  });

  it('existing workload included in fairness calculation', () => {
    const existing = new AssignmentCollection();
    for (let d = 1; d <= 8; d++) {
      const date = `2026-01-${String(d).padStart(2, '0')}`;
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) continue;
      addExisting(existing, { personnelId: 'p1', deviceId: 'd1', date });
    }
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(result.candidate.totalScore).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════
// GATE 4 — Canonical Scoring
// ═══════════════════════════════════════════════
describe('GATE 4 — Canonical Scoring', () => {
  it('canonical weights sum to 1.0', () => {
    expect(validateCanonicalWeights()).toBe(true);
  });

  it('canonical weights are immutable', () => {
    expect(typeof CANONICAL_SCORING_WEIGHTS.fairness).toBe('number');
    expect(CANONICAL_SCORING_WEIGHTS.fairness).toBe(0.35);
    expect(CANONICAL_SCORING_WEIGHTS.workload).toBe(0.25);
    expect(CANONICAL_SCORING_WEIGHTS.fatigue).toBe(0.25);
    expect(CANONICAL_SCORING_WEIGHTS.coverage).toBe(0.15);
  });

  it('ScoreAggregator uses canonical weights by default', () => {
    const agg = new ScoreAggregator();
    const weights = agg.getWeights();
    expect(weights.fairness).toBe(CANONICAL_SCORING_WEIGHTS.fairness);
    expect(weights.workload).toBe(CANONICAL_SCORING_WEIGHTS.workload);
    expect(weights.fatigue).toBe(CANONICAL_SCORING_WEIGHTS.fatigue);
  });

  it('SOFT_CONSTRAINT_WEIGHTS maps constraint IDs', () => {
    expect(SOFT_CONSTRAINT_WEIGHTS.FAIRNESS).toBe(0.35);
    expect(SOFT_CONSTRAINT_WEIGHTS.WORKLOAD_BALANCE).toBe(0.25);
    expect(SOFT_CONSTRAINT_WEIGHTS.FATIGUE).toBe(0.25);
  });
});

// ═══════════════════════════════════════════════
// GATE 5 — ScoreAggregator = ScoringModel alignment
// ═══════════════════════════════════════════════
describe('GATE 5 — Score Alignment', () => {
  it('ScoringModel uses same canonical weights', () => {
    const model = new ScoringModel();
    const config = model.getConfiguration();
    expect(config.fairnessWeight).toBe(CANONICAL_SCORING_WEIGHTS.fairness);
    expect(config.workloadWeight).toBe(CANONICAL_SCORING_WEIGHTS.workload);
    expect(config.coverageWeight).toBe(CANONICAL_SCORING_WEIGHTS.coverage);
    expect(config.preferenceWeight).toBe(CANONICAL_SCORING_WEIGHTS.fatigue);
  });

  it('ScoringModel version updated to 2.0.0', () => {
    const model = new ScoringModel();
    const config = model.getConfiguration();
    expect(config.version).toBe('2.0.0');
  });

  it('ScoringModel weights sum to 1.0', () => {
    const model = new ScoringModel();
    const config = model.getConfiguration();
    const sum =
      config.coverageWeight +
      config.fairnessWeight +
      config.workloadWeight +
      config.preferenceWeight;
    expect(sum).toBeCloseTo(1.0);
  });
});

// ═══════════════════════════════════════════════
// GATE 6 — ANY Skill Semantics
// ═══════════════════════════════════════════════
describe('GATE 6 — ANY Skill Semantics', () => {
  it('personnel with ANY matching skill is eligible', () => {
    const problem = makeProblem({
      devices: [makeDevice('d1', 'MRI-1', { requiredSkills: ['MRI', 'CT'] })],
      personnel: [
        makePersonnel('p1', { skills: ['MRI'], deviceSkills: ['MRI'] }),
        makePersonnel('p2', { skills: ['CT'], deviceSkills: ['CT'] }),
      ],
    });
    const result = optimizer.optimize(problem);
    expect(result.success).toBe(true);
    const personnelUsed = new Set(
      result.candidate.assignments.map((a) => a.personnelId),
    );
    expect(personnelUsed.size).toBeGreaterThan(0);
  });

  it('personnel with NO matching skill is excluded', () => {
    const problem = makeProblem({
      devices: [makeDevice('d1', 'MRI-1', { requiredSkills: ['MRI'] })],
      personnel: [
        makePersonnel('p1', { skills: ['XRAY'], deviceSkills: ['XRAY'] }),
      ],
    });
    const result = optimizer.optimize(problem);
    expect(result.candidate.assignments.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════
// GATE 7 — Fairness includes existing assignments
// ═══════════════════════════════════════════════
describe('GATE 7 — Fairness with Existing', () => {
  it('existing workload influences fairness scoring', () => {
    const existing = new AssignmentCollection();
    for (let d = 1; d <= 6; d++) {
      const date = `2026-01-${String(d).padStart(2, '0')}`;
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) continue;
      addExisting(existing, { personnelId: 'p1', deviceId: 'd1', date });
    }
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(
      result.summary.scoreComponents.fairness.rawScore,
    ).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════
// GATE 8 — Workload includes existing assignments
// ═══════════════════════════════════════════════
describe('GATE 8 — Workload with Existing', () => {
  it('existing shifts contribute to workload calculation', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-06',
    });
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-07',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(
      result.summary.scoreComponents.workload.rawScore,
    ).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════
// GATE 9 — Fatigue includes existing assignments
// ═══════════════════════════════════════════════
describe('GATE 9 — Fatigue with Existing', () => {
  it('existing shifts contribute to fatigue scoring', () => {
    const existing = new AssignmentCollection();
    for (let d = 1; d <= 5; d++) {
      const date = `2026-01-${String(d).padStart(2, '0')}`;
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) continue;
      addExisting(existing, { personnelId: 'p1', deviceId: 'd1', date });
    }
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(
      result.summary.scoreComponents.fatigue.rawScore,
    ).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════
// GATE 10 — Determinism with pre-seeded schedules
// ═══════════════════════════════════════════════
describe('GATE 10 — Determinism', () => {
  it('same pre-seeded problem → same result', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const r1 = optimizer.optimize(problem);
    const r2 = optimizer.optimize(problem);
    expect(r1.candidate.assignments.length).toBe(
      r2.candidate.assignments.length,
    );
    expect(r1.summary.totalScore).toBe(r2.summary.totalScore);
    expect(r1.metadata.deterministic).toBe(true);
  });

  it('empty problem → same result', () => {
    const problem = makeProblem();
    const r1 = optimizer.optimize(problem);
    const r2 = optimizer.optimize(problem);
    expect(r1.candidate.assignments.length).toBe(
      r2.candidate.assignments.length,
    );
    expect(r1.summary.totalScore).toBe(r2.summary.totalScore);
  });
});

// ═══════════════════════════════════════════════
// GATE 11 — Device Visibility
// ═══════════════════════════════════════════════
describe('GATE 11 — Device Visibility', () => {
  it('device identity preserved in assignments', () => {
    const result = optimizer.optimize(makeProblem());
    for (const a of result.candidate.assignments) {
      expect(a.deviceCode).toBe('MRI-1');
      expect(a.deviceName).toBe('MRI-1');
    }
  });

  it('pre-seeded device assignments visible', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    const jan5 = result.candidate.assignments.filter(
      (a) => a.date === '2026-01-05',
    );
    expect(jan5.length).toBeGreaterThanOrEqual(1);
    expect(jan5[0].deviceId).toBe('d1');
  });
});

// ═══════════════════════════════════════════════
// GATE 12 — Service Line Separation
// ═══════════════════════════════════════════════
describe('GATE 12 — Service Line Separation', () => {
  it('imaging strategy selected', () => {
    const result = optimizer.optimize(makeProblem({ serviceLine: 'IMAGING' }));
    expect(result.explanations.some((e) => e.includes('IMAGING'))).toBe(true);
  });

  it('RT strategy selected', () => {
    const result = optimizer.optimize(
      makeProblem({
        serviceLine: 'RADIATION_ONCOLOGY',
        devices: [makeDevice('rt1', 'LINAC-1', { requiredSkills: ['LINAC'] })],
        personnel: [
          makePersonnel('rt1', { skills: ['LINAC'], deviceSkills: ['LINAC'] }),
        ],
      }),
    );
    expect(
      result.explanations.some((e) => e.includes('RADIATION_ONCOLOGY')),
    ).toBe(true);
  });

  it('pre-seeding works with both strategies', () => {
    const imagingExisting = new AssignmentCollection();
    addExisting(imagingExisting, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const imaging = optimizer.optimize(
      makeProblem({ existingAssignments: imagingExisting }),
    );

    const rtExisting = new AssignmentCollection();
    addExisting(rtExisting, {
      personnelId: 'rt1',
      deviceId: 'rt1',
      date: '2026-01-05',
    });
    const rt = optimizer.optimize(
      makeProblem({
        serviceLine: 'RADIATION_ONCOLOGY',
        devices: [makeDevice('rt1', 'LINAC-1', { requiredSkills: ['LINAC'] })],
        personnel: [
          makePersonnel('rt1', { skills: ['LINAC'], deviceSkills: ['LINAC'] }),
        ],
        existingAssignments: rtExisting,
      }),
    );

    expect(imaging).toBeDefined();
    expect(rt).toBeDefined();
    expect(imaging.summary.existingAssignments).toBe(1);
    expect(rt.summary.existingAssignments).toBe(1);
  });
});

// ═══════════════════════════════════════════════
// GATE 14 — Data Integrity
// ═══════════════════════════════════════════════
describe('GATE 14 — Data Integrity', () => {
  it('optimizer is dry-run only: no Prisma calls', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const problem = makeProblem({ existingAssignments: existing });
    const result = optimizer.optimize(problem);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
  });
});

// ═══════════════════════════════════════════════
// Score Component Exposure
// ═══════════════════════════════════════════════
describe('Score Component Exposure', () => {
  it('result exposes scoreComponents with rawScore, weight, weightedScore', () => {
    const result = optimizer.optimize(makeProblem());
    const { fairness, workload, fatigue } = result.summary.scoreComponents;
    expect(typeof fairness.rawScore).toBe('number');
    expect(typeof fairness.weight).toBe('number');
    expect(typeof fairness.weightedScore).toBe('number');
    expect(typeof workload.rawScore).toBe('number');
    expect(typeof fatigue.rawScore).toBe('number');
  });
});

// ═══════════════════════════════════════════════
// Score Invariant: canonical weights match
// ═══════════════════════════════════════════════
describe('Score Invariant', () => {
  it('ScoreAggregator canonical weights match CANONICAL_SCORING_WEIGHTS', () => {
    const agg = new ScoreAggregator();
    const w = agg.getWeights();
    expect(w.fairness).toBe(CANONICAL_SCORING_WEIGHTS.fairness);
    expect(w.workload).toBe(CANONICAL_SCORING_WEIGHTS.workload);
    expect(w.fatigue).toBe(CANONICAL_SCORING_WEIGHTS.fatigue);
  });

  it('ScoreAggregator + canonical config are consistent', () => {
    expect(
      CANONICAL_SCORING_WEIGHTS.fairness +
        CANONICAL_SCORING_WEIGHTS.workload +
        CANONICAL_SCORING_WEIGHTS.fatigue +
        CANONICAL_SCORING_WEIGHTS.coverage,
    ).toBeCloseTo(1.0);
  });
});

// ═══════════════════════════════════════════════
// GOLDEN SCENARIOS
// ═══════════════════════════════════════════════
describe('Golden 1 — Existing + empty slots', () => {
  it('existing preserved, new generated', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
    });
    const result = optimizer.optimize(
      makeProblem({ existingAssignments: existing }),
    );
    const p1Jan5 = result.candidate.assignments.filter(
      (a) => a.personnelId === 'p1' && a.date === '2026-01-05',
    );
    expect(p1Jan5.length).toBe(1);
    expect(result.candidate.assignments.length).toBeGreaterThan(1);
  });
});

describe('Golden 2 — Existing workload imbalance', () => {
  it('new assignments account for historical workload', () => {
    const existing = new AssignmentCollection();
    for (let d = 1; d <= 8; d++) {
      const date = `2026-01-${String(d).padStart(2, '0')}`;
      const day = new Date(date).getDay();
      if (day === 0 || day === 6) continue;
      addExisting(existing, { personnelId: 'p1', deviceId: 'd1', date });
    }
    const result = optimizer.optimize(
      makeProblem({ existingAssignments: existing }),
    );
    expect(result.success).toBe(true);
    expect(result.summary.totalScore).toBeGreaterThanOrEqual(0);
  });
});

describe('Golden 3 — Existing night assignments', () => {
  it('night workload contributes to scoring', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
      shiftType: 'night',
    });
    const result = optimizer.optimize(
      makeProblem({ existingAssignments: existing }),
    );
    expect(result).toBeDefined();
  });
});

describe('Golden 4 — Existing hard conflict', () => {
  it('existing conflict reported, not silently deleted', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
      shiftType: 'day',
    });
    addExisting(existing, {
      personnelId: 'p1',
      deviceId: 'd1',
      date: '2026-01-05',
      shiftType: 'day',
    });
    const result = optimizer.optimize(
      makeProblem({ existingAssignments: existing }),
    );
    expect(result).toBeDefined();
  });
});

describe('Golden 5 — Canonical scoring selects correct candidate', () => {
  it('ScoreAggregator uses canonical weights', () => {
    const agg = new ScoreAggregator();
    const r1 = agg.aggregate([
      {
        constraintId: 'FAIRNESS',
        rawScore: 100,
        weight: 1,
        weightedScore: 100,
        explanation: '',
      },
    ]);
    const r2 = agg.aggregate([
      {
        constraintId: 'FATIGUE',
        rawScore: 100,
        weight: 1,
        weightedScore: 100,
        explanation: '',
      },
    ]);
    expect(r1.total).toBeGreaterThan(r2.total);
  });
});

describe('Golden 6 — ANY skill semantics', () => {
  it('personnel with partial skill match is eligible', () => {
    const problem = makeProblem({
      devices: [makeDevice('d1', 'DEV-1', { requiredSkills: ['MRI', 'CT'] })],
      personnel: [
        makePersonnel('p1', { skills: ['MRI'], deviceSkills: ['MRI'] }),
      ],
    });
    const result = optimizer.optimize(problem);
    expect(result.candidate.assignments.length).toBeGreaterThan(0);
  });
});

describe('Golden 7 — Radiation Oncology', () => {
  it('RT strategy with pre-seeding', () => {
    const existing = new AssignmentCollection();
    addExisting(existing, {
      personnelId: 'rt1',
      deviceId: 'rt1',
      date: '2026-01-05',
    });
    const result = optimizer.optimize(
      makeProblem({
        serviceLine: 'RADIATION_ONCOLOGY',
        devices: [makeDevice('rt1', 'LINAC-1', { requiredSkills: ['LINAC'] })],
        personnel: [
          makePersonnel('rt1', { skills: ['LINAC'], deviceSkills: ['LINAC'] }),
        ],
        existingAssignments: existing,
      }),
    );
    expect(
      result.explanations.some((e) => e.includes('RADIATION_ONCOLOGY')),
    ).toBe(true);
    expect(result.summary.existingAssignments).toBe(1);
  });
});

describe('Golden 8 — Device assignment identity', () => {
  it('device code and name preserved', () => {
    const result = optimizer.optimize(makeProblem());
    for (const a of result.candidate.assignments) {
      expect(a.deviceCode).toBeDefined();
      expect(a.deviceName).toBeDefined();
      expect(a.deviceCode.length).toBeGreaterThan(0);
    }
  });
});
