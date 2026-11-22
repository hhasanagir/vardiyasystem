import { OptimizationStrategy, OptimizationContext } from './optimization-strategy';
import { SchedulingProblem } from './scheduling-problem';
import { CandidateSchedule, CandidateAssignment, createEmptyCandidate } from './candidate-schedule';
import { OptimizationResult, OptimizationMetadata, createOptimizationResult } from './optimization-result';
import { GreedyOptimizationStrategy } from './greedy-strategy';
import { ConstraintEngine } from '../constraints/constraint-engine';
import {
  PersonnelLookup, PersonnelInfo,
  DeviceLookup, DeviceInfo,
  ShiftTemplateLookup, ShiftTemplateInfo,
  GroupLookup, GroupInfo,
} from '../constraints/constraint.interface';
import { ConstraintScore } from '../constraints/soft-constraint.interface';
import { FairnessSoftConstraint } from '../constraints/soft-fairness';
import { FatigueSoftConstraint } from '../constraints/soft-fatigue';
import { WorkloadBalanceSoftConstraint } from '../constraints/soft-workload';
import { ScoreAggregator } from './score-aggregator';
import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';

/**
 * LocalSearchOptimizationStrategy — Phase 5C.5
 *
 * Deterministic perturbation-based improvement on top of the greedy baseline.
 * Embodies the "local search — perturbation-based improvement after greedy"
 * direction from the Phase 5B.3->5B.4 readiness roadmap and the Phase 5C+
 * optimization-strategy family (constraint-programming / local search).
 *
 * Guarantees:
 *  - Read-only with respect to persistence; never writes to the database.
 *  - Never weakens or disables any hard constraint. Every candidate move is
 *    revalidated through the ConstraintEngine (which enforces UNIT_CLOSED,
 *    DEVICE_OFF_DATE, overlap, rest, night-eligibility, working days, etc.).
 *  - A move is accepted ONLY if the resulting candidate is fully hard-constraint
 *    valid AND its aggregated soft-constraint score is strictly higher.
 *  - Deterministic: fixed neighborhood iteration order, no randomness, so the
 *    produced schedule is reproducible for a given input.
 *
 * Neighborhood: for each pair of generated (non-pre-seeded) assignments sharing
 * the same date and the same shift type, try swapping their assigned personnel.
 * Both resulting assignments are revalidated; the whole candidate is rescored.
 */
export class LocalSearchOptimizationStrategy implements OptimizationStrategy {
  id = 'local-search';
  name = 'Local Search Optimization';

  private readonly greedy = new GreedyOptimizationStrategy();
  private readonly constraintEngine = new ConstraintEngine();
  private readonly fairnessConstraint = new FairnessSoftConstraint();
  private readonly fatigueConstraint = new FatigueSoftConstraint();
  private readonly workloadConstraint = new WorkloadBalanceSoftConstraint();
  private readonly scoreAggregator = new ScoreAggregator();

  optimize(problem: SchedulingProblem, context: OptimizationContext): OptimizationResult {
    const startTime = Date.now();

    // Baseline produced by the (already valid, engine-validated) greedy strategy.
    const baseline = this.greedy.optimize(problem, context);
    const candidate = cloneCandidate(baseline.candidate);

    if (!candidate.isValid || candidate.assignments.length === 0) {
      const meta: OptimizationMetadata = {
        executionTimeMs: Date.now() - startTime,
        candidateGenerationTimeMs: 0,
        hardConstraintTimeMs: 0,
        softConstraintTimeMs: 0,
        scoreAggregationTimeMs: 0,
        candidatesGenerated: 1,
        validCandidates: candidate.isValid ? 1 : 0,
        deterministic: true,
      };
      return createOptimizationResult(
        candidate.isValid,
        this.id,
        candidate,
        meta,
        ['LocalSearch: no improvement performed (no valid baseline candidate)'],
        problem.existingAssignments.all.length,
      );
    }

    const personnelLookup = this.buildPersonnelLookup(problem.personnel, problem.unitId);
    const deviceLookup = this.buildDeviceLookup(problem.devices, problem.unitId);
    const emptyTemplates = new Map<string, ShiftTemplateInfo>();
    const emptyGroups = new Map<string, GroupInfo>();
    const templatesLookup: ShiftTemplateLookup = { findById: (id) => emptyTemplates.get(id) };
    const groupsLookup: GroupLookup = { findById: (id) => emptyGroups.get(id) };

    const timeLimitMs = context.timeLimitMs || 30000;
    const iterations = Math.max(0, Math.min(context.maxIterations || 50, 2000));

    let improved = true;
    let rounds = 0;
    let acceptedMoves = 0;

    while (improved && rounds < iterations && Date.now() - startTime < timeLimitMs) {
      improved = false;
      rounds++;

      const generated = candidate.assignments.filter(a => !a.isPreSeeded);

      // Ordered by (date, shiftType, device, personnelId) for determinism.
      generated.sort((a, b) =>
        a.date === b.date
          ? a.shiftType === b.shiftType
            ? a.deviceId === b.deviceId
              ? a.personnelId.localeCompare(b.personnelId)
              : a.deviceId.localeCompare(b.deviceId)
            : a.shiftType.localeCompare(b.shiftType)
          : a.date.localeCompare(b.date),
      );

      for (let i = 0; i < generated.length; i++) {
        for (let j = i + 1; j < generated.length; j++) {
          const a = generated[i];
          const b = generated[j];
          if (a.date !== b.date || a.shiftType !== b.shiftType) continue;
          if (a.personnelId === b.personnelId) continue;
          if (a.deviceId === b.deviceId) continue;

          const improvedCandidate = this.evaluateSwap(
            candidate, a, b, problem, personnelLookup, deviceLookup,
            templatesLookup, groupsLookup,
          );
          if (!improvedCandidate) continue;

          candidate.assignments = improvedCandidate.assignments;
          candidate.softConstraintScores = improvedCandidate.softConstraintScores;
          candidate.totalScore = improvedCandidate.totalScore;
          candidate.scoreBreakdown = improvedCandidate.scoreBreakdown;
          candidate.explanations = improvedCandidate.explanations;
          candidate.explanations.push(
            `LocalSearch: swapped ${a.personnelName} <-> ${b.personnelName} on ${a.date} ${a.shiftType}`,
          );
          improved = true;
          acceptedMoves++;
          break;
        }
        if (improved) break;
      }
    }

    const explanations = this.buildExplanations(candidate, problem, acceptedMoves);

    const metadata: OptimizationMetadata = {
      executionTimeMs: Date.now() - startTime,
      candidateGenerationTimeMs: 0,
      hardConstraintTimeMs: 0,
      softConstraintTimeMs: 0,
      scoreAggregationTimeMs: 0,
      candidatesGenerated: rounds,
      validCandidates: candidate.isValid ? 1 : 0,
      deterministic: true,
    };

    return createOptimizationResult(
      candidate.isValid,
      this.id,
      candidate,
      metadata,
      explanations,
      problem.existingAssignments.all.length,
    );
  }

  private evaluateSwap(
    current: CandidateSchedule,
    a: CandidateAssignment,
    b: CandidateAssignment,
    problem: SchedulingProblem,
    personnelLookup: PersonnelLookup,
    deviceLookup: DeviceLookup,
    templatesLookup: ShiftTemplateLookup,
    groupsLookup: GroupLookup,
  ): CandidateSchedule | null {
    // Trial candidate where a.personnelId <-> b.personnelId are swapped.
    const trial = createEmptyCandidate();
    for (const ca of current.assignments) {
      trial.assignments.push({
        ...ca,
        personnelId: ca === a ? b.personnelId : ca === b ? a.personnelId : ca.personnelId,
        personnelName: ca === a ? b.personnelName : ca === b ? a.personnelName : ca.personnelName,
      });
      trial.hardConstraintViolations = current.hardConstraintViolations;
    }

    // Validate both swapped personnel's assignments against the full trial
    // collection. Uses the same self-conflict exclusion as the greedy strategy.
    const changedPersonnel = new Set([a.personnelId, b.personnelId]);
    const violations = [...current.hardConstraintViolations];

    for (const ca of trial.assignments) {
      if (ca.isPreSeeded) continue;
      if (!changedPersonnel.has(ca.personnelId)) continue;

      const assignment = Assignment.create({
        scheduleId: problem.scheduleId,
        personnelId: ca.personnelId,
        deviceId: ca.deviceId,
        unitId: problem.unitId,
        kind: 'device',
        date: ca.date,
        shiftType: ca.shiftType,
        startTime: ca.startTime,
        endTime: ca.endTime,
        personnelType: ca.personnelType,
      });

      const fullCollection = new AssignmentCollection();
      for (const other of trial.assignments) {
        if (other === ca) continue;
        if (other.date !== ca.date || other.shiftType !== ca.shiftType || other.personnelId !== ca.personnelId) continue;
        fullCollection.add(Assignment.create({
          scheduleId: problem.scheduleId,
          personnelId: other.personnelId,
          deviceId: other.deviceId,
          unitId: problem.unitId,
          kind: 'device',
          date: other.date,
          shiftType: other.shiftType,
          startTime: other.startTime,
          endTime: other.endTime,
          personnelType: other.personnelType,
        }));
      }

      const report = this.constraintEngine.validate(
        assignment,
        fullCollection,
        personnelLookup,
        deviceLookup,
        problem.holidays,
        problem.deviceOffDates || new Set(),
        templatesLookup,
        groupsLookup,
        this.buildBlockedDatesMap(problem.personnel),
      );

      if (report.hasBlocking) {
        return null;
      }
    }

    // Score the trial candidate with the same soft constraints + aggregator.
    const softScores = this.evaluateSoftConstraints(trial, problem);
    const aggregated = this.scoreAggregator.aggregate(softScores);

    // Accept only if strictly better than the current state.
    if (aggregated.total <= current.totalScore) return null;

    return {
      assignments: trial.assignments,
      isValid: true,
      hardConstraintViolations: violations,
      softConstraintScores: softScores,
      totalScore: aggregated.total,
      scoreBreakdown: aggregated.breakdown,
      explanations: aggregated.explanations,
    };
  }

  private evaluateSoftConstraints(
    candidate: CandidateSchedule,
    problem: SchedulingProblem,
  ): ConstraintScore[] {
    const personnelLookup = this.buildPersonnelLookup(problem.personnel, problem.unitId);
    const deviceLookup = this.buildDeviceLookup(problem.devices, problem.unitId);
    const emptyTemplates = new Map<string, ShiftTemplateInfo>();
    const emptyGroups = new Map<string, GroupInfo>();
    const templatesLookup: ShiftTemplateLookup = { findById: (id) => emptyTemplates.get(id) };
    const groupsLookup: GroupLookup = { findById: (id) => emptyGroups.get(id) };

    const dummyAssignment = Assignment.create({
      scheduleId: problem.scheduleId,
      personnelId: problem.personnel[0]?.id || 'dummy',
      unitId: problem.unitId,
      kind: 'device',
      date: `${problem.year}-${String(problem.month).padStart(2, '0')}-15`,
      shiftType: 'day',
      startTime: '08:00',
      endTime: '16:00',
      personnelType: 'technician',
    });

    const ctx = {
      assignment: dummyAssignment,
      existingAssignments: candidate.assignments.reduce((col, ca) => {
        const a = Assignment.create({
          scheduleId: problem.scheduleId,
          personnelId: ca.personnelId,
          deviceId: ca.deviceId,
          unitId: problem.unitId,
          kind: 'device',
          date: ca.date,
          shiftType: ca.shiftType,
          startTime: ca.startTime,
          endTime: ca.endTime,
          personnelType: ca.personnelType,
        });
        col.add(a);
        return col;
      }, new AssignmentCollection()),
      personnelLookup,
      deviceLookup,
      holidays: problem.holidays,
      deviceOffDates: problem.deviceOffDates || new Set(),
      templates: templatesLookup,
      groups: groupsLookup,
      personnelBlockedDates: this.buildBlockedDatesMap(problem.personnel),
      now: new Date(),
    };

    return [
      this.fairnessConstraint.evaluate(ctx),
      this.fatigueConstraint.evaluate(ctx),
      this.workloadConstraint.evaluate(ctx),
    ];
  }

  private buildExplanations(candidate: CandidateSchedule, problem: SchedulingProblem, acceptedMoves: number): string[] {
    const explanations: string[] = [];
    const existingCount = problem.existingAssignments.all.length;
    const newCount = candidate.assignments.length - existingCount;
    if (candidate.isValid) {
      explanations.push(`LocalSearch: ${acceptedMoves} improving swap(s) accepted`);
      explanations.push(`Total: ${candidate.assignments.length} assignments (${existingCount} existing, ${newCount} new)`);
      explanations.push(`Score: ${candidate.totalScore.toFixed(1)}`);
      explanations.push(`Personnel: ${new Set(candidate.assignments.map(a => a.personnelId)).size}`);
      explanations.push(`Devices: ${new Set(candidate.assignments.map(a => a.deviceId)).size}`);
    } else {
      explanations.push(`Candidate invalid: ${candidate.hardConstraintViolations.length} hard violations`);
    }
    return explanations;
  }

  private buildBlockedDatesMap(personnel: SchedulingProblem['personnel']): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const p of personnel) {
      if (p.blockedDates && p.blockedDates.length > 0) {
        map.set(p.id, new Set(p.blockedDates));
      }
    }
    return map;
  }

  private buildPersonnelLookup(personnel: SchedulingProblem['personnel'], unitId: string): PersonnelLookup {
    const map = new Map(personnel.map(p => [p.id, p]));
    return {
      findById: (id: string): PersonnelInfo | undefined => {
        const p = map.get(id);
        if (!p) return undefined;
        return {
          id: p.id,
          name: p.name,
          isActive: p.isActive,
          employmentStatus: p.employmentStatus,
          unitId,
          groupId: null,
          role: p.role,
          skills: p.skills,
          deviceSkills: p.deviceSkills,
          nightShiftEligible: p.nightShiftEligible,
          offDays: p.offDays,
          maxWeeklyHours: p.maxWeeklyHours,
        };
      },
    };
  }

  private buildDeviceLookup(devices: SchedulingProblem['devices'], unitId: string): DeviceLookup {
    const map = new Map(devices.map(d => [d.id, d]));
    return {
      findById: (id: string): DeviceInfo | undefined => {
        const d = map.get(id);
        if (!d) return undefined;
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          unitId,
          mode: d.mode,
          requiredSkills: d.requiredSkills,
          workDays: d.workDays,
          isActive: true,
        };
      },
    };
  }
}

/** Clone a candidate deeply enough that later mutation of .assignments is safe. */
function cloneCandidate(candidate: CandidateSchedule): CandidateSchedule {
  return {
    assignments: candidate.assignments.map(a => ({ ...a })),
    isValid: candidate.isValid,
    hardConstraintViolations: candidate.hardConstraintViolations.map(v => ({ ...v })),
    softConstraintScores: candidate.softConstraintScores.map(s => ({ ...s })),
    totalScore: candidate.totalScore,
    scoreBreakdown: { ...candidate.scoreBreakdown },
    explanations: [...candidate.explanations],
  };
}
