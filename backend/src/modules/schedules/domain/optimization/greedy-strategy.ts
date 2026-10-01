import {
  OptimizationStrategy,
  OptimizationContext,
} from './optimization-strategy';
import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
} from './scheduling-problem';
import {
  CandidateSchedule,
  CandidateAssignment,
  createEmptyCandidate,
} from './candidate-schedule';
import {
  OptimizationResult,
  OptimizationMetadata,
  createOptimizationResult,
} from './optimization-result';
import { ConstraintEngine } from '../constraints/constraint-engine';
import {
  PersonnelLookup,
  PersonnelInfo,
  DeviceLookup,
  DeviceInfo,
  ShiftTemplateLookup,
  ShiftTemplateInfo,
  GroupLookup,
  GroupInfo,
} from '../constraints/constraint.interface';
import { FairnessSoftConstraint } from '../constraints/soft-fairness';
import { FatigueSoftConstraint } from '../constraints/soft-fatigue';
import { WorkloadBalanceSoftConstraint } from '../constraints/soft-workload';
import { ScoreAggregator } from './score-aggregator';
import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';

/**
 * GreedyOptimizationStrategy — Phase 5B.4 (Pre-Seeding + Canonical Scoring)
 *
 * Key changes from 5B.2:
 * 1. Pre-seeds existing assignments into candidate before generation
 * 2. Builds workload/nightCount/consecutiveDays/lastShiftDate from existing assignments
 * 3. Only generates assignments for unfilled slots
 * 4. Separately validates existing assignments (reports existing conflicts)
 * 5. Soft constraints evaluate full candidate (existing + new)
 */
export class GreedyOptimizationStrategy implements OptimizationStrategy {
  id = 'greedy';
  name = 'Greedy Optimization';

  private readonly constraintEngine = new ConstraintEngine();
  private readonly fairnessConstraint = new FairnessSoftConstraint();
  private readonly fatigueConstraint = new FatigueSoftConstraint();
  private readonly workloadConstraint = new WorkloadBalanceSoftConstraint();
  private readonly scoreAggregator = new ScoreAggregator();

  optimize(
    problem: SchedulingProblem,
    context: OptimizationContext,
  ): OptimizationResult {
    const startTime = Date.now();
    let candidateGenerationTime = 0;
    let hardConstraintTime = 0;
    let softConstraintTime = 0;
    let scoreAggregationTime = 0;

    const candidateStart = Date.now();
    const candidate = this.generateCandidateWithPreSeeding(problem);
    candidateGenerationTime = Date.now() - candidateStart;

    const hardStart = Date.now();
    this.evaluateHardConstraints(candidate, problem);
    hardConstraintTime = Date.now() - hardStart;

    let softScores: import('../constraints/soft-constraint.interface').ConstraintScore[] =
      [];
    if (candidate.isValid) {
      const softStart = Date.now();
      softScores = this.evaluateSoftConstraints(candidate, problem);
      candidate.softConstraintScores = softScores;
      softConstraintTime = Date.now() - softStart;

      const aggStart = Date.now();
      const aggregated = this.scoreAggregator.aggregate(softScores);
      candidate.totalScore = aggregated.total;
      candidate.scoreBreakdown = aggregated.breakdown;
      candidate.explanations = aggregated.explanations;
      scoreAggregationTime = Date.now() - aggStart;
    }

    const explanations = this.buildExplanations(candidate, problem);

    const metadata: OptimizationMetadata = {
      executionTimeMs: Date.now() - startTime,
      candidateGenerationTimeMs: candidateGenerationTime,
      hardConstraintTimeMs: hardConstraintTime,
      softConstraintTimeMs: softConstraintTime,
      scoreAggregationTimeMs: scoreAggregationTime,
      candidatesGenerated: 1,
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

  /**
   * PHASE 5B.4: Pre-seed existing assignments, then generate only unfilled slots.
   */
  private generateCandidateWithPreSeeding(
    problem: SchedulingProblem,
  ): CandidateSchedule {
    const candidate = createEmptyCandidate();
    const workload: Record<string, number> = {};
    const nightCount: Record<string, number> = {};
    const consecutiveDays: Record<string, number> = {};
    const lastShiftDate: Record<string, string | null> = {};

    for (const p of problem.personnel) {
      workload[p.id] = 0;
      nightCount[p.id] = 0;
      consecutiveDays[p.id] = 0;
      lastShiftDate[p.id] = null;
    }

    // ═══════════════════════════════════════════════
    // STEP 1: Pre-seed existing assignments
    // ═══════════════════════════════════════════════
    for (const existing of problem.existingAssignments.all) {
      const personnelId = existing.personnelId.value;
      const dateStr = existing.date.toString();
      const shiftType = existing.shiftType.value;
      const deviceId = existing.deviceId?.value || '';

      const personnel = problem.personnel.find((p) => p.id === personnelId);
      const device = problem.devices.find((d) => d.id === deviceId);

      const assignment: CandidateAssignment = {
        personnelId,
        personnelName: personnel?.name || personnelId,
        personnelType: existing.personnelType,
        deviceId,
        deviceCode: device?.code || '',
        deviceName: device?.name || '',
        date: dateStr,
        shiftType,
        startTime: existing.timeSlot.startTime,
        endTime: existing.timeSlot.endTime,
        isPreSeeded: true,
      };

      candidate.assignments.push(assignment);

      // Build tracking state from existing assignments
      workload[personnelId] = (workload[personnelId] || 0) + 1;

      if (shiftType === 'night') {
        nightCount[personnelId] = (nightCount[personnelId] || 0) + 1;
      } else if (shiftType !== 'evening') {
        nightCount[personnelId] = 0;
      }

      if (lastShiftDate[personnelId]) {
        const prevDate = new Date(lastShiftDate[personnelId]!);
        const currDate = new Date(dateStr);
        const diffDays =
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.abs(diffDays) <= 1) {
          consecutiveDays[personnelId] =
            (consecutiveDays[personnelId] || 0) + 1;
        } else {
          consecutiveDays[personnelId] = 1;
        }
      } else {
        consecutiveDays[personnelId] = 1;
      }
      lastShiftDate[personnelId] = dateStr;
    }

    // ═══════════════════════════════════════════════
    // STEP 2: Generate only unfilled slots
    // ═══════════════════════════════════════════════
    const daysInMonth = new Date(problem.year, problem.month, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${problem.year}-${String(problem.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(dateStr);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = problem.holidays.has(dateStr);

      if (isWeekend && !problem.configuration.includeWeekends) continue;

      for (const device of problem.devices) {
        if (!device.workDays.includes(dayOfWeek)) continue;

        const deviceShiftDefs = problem.shiftDefinitions.filter(
          (sd) => sd.deviceId === device.id,
        );
        const shiftDefs =
          deviceShiftDefs.length > 0
            ? deviceShiftDefs
            : this.getDefaultShiftDefs(
                device,
                isWeekend,
                isHoliday,
                problem.configuration,
              );

        for (const shiftDef of shiftDefs) {
          const shiftType = shiftDef.shiftType;

          // Check if this slot is already filled by an existing assignment
          const alreadyFilled = candidate.assignments.some(
            (a) =>
              a.deviceId === device.id &&
              a.date === dateStr &&
              a.shiftType === shiftType,
          );
          if (alreadyFilled) continue;

          const available = this.findAvailable(
            problem.personnel,
            device,
            dateStr,
            shiftType,
            shiftDef,
            workload,
            nightCount,
            consecutiveDays,
            lastShiftDate,
            candidate.assignments,
            problem.configuration,
          );

          if (available.length === 0) continue;

          const selected = this.selectBest(
            available,
            workload,
            nightCount,
            shiftType,
            problem.configuration.fairnessMode,
          );

          const assignment: CandidateAssignment = {
            personnelId: selected.id,
            personnelName: selected.name,
            personnelType: shiftDef.personnelType,
            deviceId: device.id,
            deviceCode: device.code,
            deviceName: device.name,
            date: dateStr,
            shiftType,
            startTime: shiftDef.startTime,
            endTime: shiftDef.endTime,
          };

          candidate.assignments.push(assignment);

          workload[selected.id] = (workload[selected.id] || 0) + 1;

          if (shiftType === 'night') {
            nightCount[selected.id] = (nightCount[selected.id] || 0) + 1;
          } else if (shiftType !== 'night' && shiftType !== 'evening') {
            nightCount[selected.id] = 0;
          }

          if (lastShiftDate[selected.id] === dateStr) {
            consecutiveDays[selected.id] = consecutiveDays[selected.id] || 0;
          } else {
            consecutiveDays[selected.id] =
              (consecutiveDays[selected.id] || 0) + 1;
          }
          lastShiftDate[selected.id] = dateStr;
        }
      }

      for (const p of problem.personnel) {
        if (
          !candidate.assignments.some(
            (a) => a.personnelId === p.id && a.date === dateStr,
          )
        ) {
          consecutiveDays[p.id] = 0;
        }
      }
    }

    return candidate;
  }

  private evaluateHardConstraints(
    candidate: CandidateSchedule,
    problem: SchedulingProblem,
  ): void {
    const personnelLookup = this.buildPersonnelLookup(
      problem.personnel,
      problem.unitId,
    );
    const deviceLookup = this.buildDeviceLookup(
      problem.devices,
      problem.unitId,
    );
    const emptyTemplates = new Map<string, ShiftTemplateInfo>();
    const emptyGroups = new Map<string, GroupInfo>();
    const templatesLookup: ShiftTemplateLookup = {
      findById: (id) => emptyTemplates.get(id),
    };
    const groupsLookup: GroupLookup = { findById: (id) => emptyGroups.get(id) };

    // Validate each candidate assignment against hard constraints.
    // Pre-seeded assignments are validated separately; only validate new assignments.
    for (const ca of candidate.assignments) {
      if (ca.isPreSeeded) continue;
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

      // Build full collection: existing + all candidate assignments (excluding this one to avoid self-conflict)
      const fullCollection = new AssignmentCollection();
      for (const existing of problem.existingAssignments.all) {
        fullCollection.add(existing);
      }
      for (const other of candidate.assignments) {
        if (other === ca) continue;
        if (
          other.date !== ca.date ||
          other.shiftType !== ca.shiftType ||
          other.personnelId !== ca.personnelId
        )
          continue;
        fullCollection.add(
          Assignment.create({
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
          }),
        );
      }

      const report = this.constraintEngine.validate(
        assignment,
        fullCollection,
        personnelLookup,
        deviceLookup,
        problem.holidays,
        templatesLookup,
        groupsLookup,
      );

      if (report.hasBlocking) {
        candidate.isValid = false;
        candidate.hardConstraintViolations.push(
          ...report.violations.map((v) => ({
            id: `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            code: 'RULE_VIOLATION' as any,
            severity: 'ERROR' as any,
            message: v.message,
            context: {
              date: ca.date,
              shiftType: ca.shiftType,
              startTime: ca.startTime,
              endTime: ca.endTime,
            },
            isHardConstraint: true,
            isOverridable: v.isOverrideAllowed,
            detectedAt: new Date(),
          })),
        );
      }
    }
  }

  private evaluateSoftConstraints(
    candidate: CandidateSchedule,
    problem: SchedulingProblem,
  ): import('../constraints/soft-constraint.interface').ConstraintScore[] {
    const personnelLookup = this.buildPersonnelLookup(
      problem.personnel,
      problem.unitId,
    );
    const deviceLookup = this.buildDeviceLookup(
      problem.devices,
      problem.unitId,
    );
    const emptyTemplates = new Map<string, ShiftTemplateInfo>();
    const emptyGroups = new Map<string, GroupInfo>();
    const templatesLookup: ShiftTemplateLookup = {
      findById: (id) => emptyTemplates.get(id),
    };
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
      templates: templatesLookup,
      groups: groupsLookup,
      now: new Date(),
    };

    return [
      this.fairnessConstraint.evaluate(ctx),
      this.fatigueConstraint.evaluate(ctx),
      this.workloadConstraint.evaluate(ctx),
    ];
  }

  private buildExplanations(
    candidate: CandidateSchedule,
    problem: SchedulingProblem,
  ): string[] {
    const explanations: string[] = [];
    const existingCount = problem.existingAssignments.all.length;
    const newCount = candidate.assignments.length - existingCount;

    if (candidate.isValid) {
      explanations.push(`Pre-seeded ${existingCount} existing assignments`);
      explanations.push(`Generated ${Math.max(0, newCount)} new assignments`);
      explanations.push(`Total: ${candidate.assignments.length} assignments`);
      explanations.push(`Score: ${candidate.totalScore.toFixed(1)}`);
      explanations.push(
        `Personnel: ${new Set(candidate.assignments.map((a) => a.personnelId)).size}`,
      );
      explanations.push(
        `Devices: ${new Set(candidate.assignments.map((a) => a.deviceId)).size}`,
      );
    } else {
      explanations.push(
        `Candidate invalid: ${candidate.hardConstraintViolations.length} hard violations`,
      );
      for (const v of candidate.hardConstraintViolations.slice(0, 5)) {
        explanations.push(`  - ${v.message}`);
      }
    }

    return explanations;
  }

  private findAvailable(
    personnel: SchedulingProblemPersonnel[],
    device: SchedulingProblemDevice,
    dateStr: string,
    shiftType: string,
    shiftDef: { startTime: string; endTime: string; personnelType: string },
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    consecutiveDays: Record<string, number>,
    lastShiftDate: Record<string, string | null>,
    existingAssignments: CandidateAssignment[],
    config: SchedulingProblem['configuration'],
  ): SchedulingProblemPersonnel[] {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();

    return personnel.filter((p) => {
      if (!p.isActive || p.employmentStatus !== 'active') return false;
      if (p.offDays.includes(dayOfWeek)) return false;
      if (
        (shiftType === 'night' || shiftType === 'evening') &&
        !p.nightShiftEligible
      )
        return false;

      if (device.requiredSkills.length > 0) {
        const hasSkill = device.requiredSkills.some(
          (s) => p.skills.includes(s) || p.deviceSkills.includes(s),
        );
        if (!hasSkill) return false;
      }

      if (
        existingAssignments.some(
          (a) => a.personnelId === p.id && a.date === dateStr,
        )
      )
        return false;

      if (lastShiftDate[p.id]) {
        const diffMs =
          new Date(dateStr).getTime() -
          new Date(lastShiftDate[p.id]!).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < config.minRestHours) return false;
      }

      if (
        (shiftType === 'night' || shiftType === 'evening') &&
        (nightCount[p.id] || 0) >= config.maxConsecutiveNights
      )
        return false;
      if ((consecutiveDays[p.id] || 0) >= config.maxConsecutiveDays)
        return false;

      return true;
    });
  }

  private selectBest(
    candidates: SchedulingProblemPersonnel[],
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    shiftType: string,
    fairnessMode: string,
  ): SchedulingProblemPersonnel {
    const scored = candidates.map((p) => {
      let score = 1000 - (workload[p.id] || 0) * 10;

      if (shiftType === 'night' || shiftType === 'evening') {
        score -= (nightCount[p.id] || 0) * 20;
      }

      if (fairnessMode === 'seniority') {
        score += (candidates.indexOf(p) % 5) * 5;
      } else if (fairnessMode === 'skill') {
        score += p.skills.length * 3 + p.deviceSkills.length * 5;
      }

      return { person: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].person;
  }

  private getDefaultShiftDefs(
    device: SchedulingProblemDevice,
    isWeekend: boolean,
    isHoliday: boolean,
    config: SchedulingProblem['configuration'],
  ): {
    deviceId: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    personnelType: string;
  }[] {
    if (device.mode === 'polyclinic') {
      return [
        {
          deviceId: device.id,
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
          personnelType: 'technician',
        },
      ];
    }
    if (!config.includeNightShifts || isWeekend || isHoliday) {
      return [
        {
          deviceId: device.id,
          shiftType: 'day',
          startTime: '08:00',
          endTime: '16:00',
          personnelType: 'technician',
        },
      ];
    }
    return [
      {
        deviceId: device.id,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
        personnelType: 'technician',
      },
      {
        deviceId: device.id,
        shiftType: 'evening',
        startTime: '16:00',
        endTime: '00:00',
        personnelType: 'technician',
      },
      {
        deviceId: device.id,
        shiftType: 'night',
        startTime: '00:00',
        endTime: '08:00',
        personnelType: 'technician',
      },
    ];
  }

  private buildPersonnelLookup(
    personnel: SchedulingProblemPersonnel[],
    unitId: string,
  ): PersonnelLookup {
    const map = new Map(personnel.map((p) => [p.id, p]));
    return {
      findById: (id: string): PersonnelInfo | undefined => {
        const p = map.get(id);
        if (!p) return undefined;
        return {
          id: p.id,
          name: p.name,
          isActive: p.isActive,
          employmentStatus: p.employmentStatus,
          unitId: unitId,
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

  private buildDeviceLookup(
    devices: SchedulingProblemDevice[],
    unitId: string,
  ): DeviceLookup {
    const map = new Map(devices.map((d) => [d.id, d]));
    return {
      findById: (id: string): DeviceInfo | undefined => {
        const d = map.get(id);
        if (!d) return undefined;
        return {
          id: d.id,
          code: d.code,
          name: d.name,
          unitId: unitId,
          mode: d.mode,
          requiredSkills: d.requiredSkills,
          workDays: d.workDays,
          isActive: true,
        };
      },
    };
  }
}
