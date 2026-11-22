import { OptimizationStrategy, OptimizationContext } from './optimization-strategy';
import { SchedulingProblem, SchedulingProblemPersonnel, SchedulingProblemDevice } from './scheduling-problem';
import { CandidateSchedule, CandidateAssignment, createEmptyCandidate } from './candidate-schedule';
import { OptimizationResult, OptimizationMetadata, createOptimizationResult } from './optimization-result';
import { ConstraintEngine } from '../constraints/constraint-engine';
import {
  PersonnelLookup, PersonnelInfo,
  DeviceLookup, DeviceInfo,
  ShiftTemplateLookup, ShiftTemplateInfo,
  GroupLookup, GroupInfo,
} from '../constraints/constraint.interface';
import { FairnessSoftConstraint } from '../constraints/soft-fairness';
import { FatigueSoftConstraint } from '../constraints/soft-fatigue';
import { WorkloadBalanceSoftConstraint } from '../constraints/soft-workload';
import { ScoreAggregator } from './score-aggregator';
import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { CoverageEngine } from '../coverage/coverage-engine';
import { CoverageInput } from '../coverage/coverage-types';
import { daysBetweenKeys, startOfWeek } from '../value-objects/local-date';
import { ConflictCode, ConflictSeverity } from '../models/conflict';

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

  optimize(problem: SchedulingProblem, context: OptimizationContext): OptimizationResult {
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

    // PHASE 5C.26 P1-A2 — minimum coverage enforced as a hard constraint using
    // the single authoritative CoverageEngine (opt-in via coverageEnabled).
    if (problem.coverageEnabled) {
      this.evaluateCoverage(candidate, problem);
    }

    let softScores: import('../constraints/soft-constraint.interface').ConstraintScore[] = [];
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
  private generateCandidateWithPreSeeding(problem: SchedulingProblem): CandidateSchedule {
    const candidate = createEmptyCandidate();
    const workload: Record<string, number> = {};
    const nightCount: Record<string, number> = {};
    const consecutiveDays: Record<string, number> = {};
    const lastShiftDate: Record<string, string | null> = {};
    // P2-11 — Monday-based weekly hour ledger (shared with the production
    // generator). Hours, not shift counts, are the authoritative cap unit.
    const weeklyHours: Record<string, Record<string, number>> = {};
    // P2-18 — canonical 48h rest is measured from the LAST NIGHT regardless of
    // any daytime/evening shifts in between (RequiredRestConstraintNew).
    const lastNightDate: Record<string, string | null> = {};

    for (const p of problem.personnel) {
      workload[p.id] = 0;
      nightCount[p.id] = 0;
      consecutiveDays[p.id] = 0;
      lastShiftDate[p.id] = null;
      lastNightDate[p.id] = null;
    }

    // ═══════════════════════════════════════════════
    // STEP 1: Pre-seed existing assignments
    // ═══════════════════════════════════════════════
    for (const existing of problem.existingAssignments.all) {
      const personnelId = existing.personnelId.value;
      const dateStr = existing.date.toString();
      const shiftType = existing.shiftType.value;
      const deviceId = existing.deviceId?.value || '';

      const personnel = problem.personnel.find(p => p.id === personnelId);
      const device = problem.devices.find(d => d.id === deviceId);

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
      const week = startOfWeek(dateStr);
      (weeklyHours[week] ??= {})[personnelId] =
        (weeklyHours[week]?.[personnelId] || 0) + existing.durationHours;

      // P2-18 — only `night` participates in the night streak; `evening` is a
      // separate working shift in ShiftTypeVO and the DDD engine.
      if (shiftType === 'night') {
        nightCount[personnelId] = (nightCount[personnelId] || 0) + 1;
        lastNightDate[personnelId] = dateStr;
      } else {
        nightCount[personnelId] = 0;
      }

      if (lastShiftDate[personnelId]) {
        const prevDate = new Date(lastShiftDate[personnelId]!);
        const currDate = new Date(dateStr);
        const diffDays = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24);
        if (Math.abs(diffDays) <= 1) {
          consecutiveDays[personnelId] = (consecutiveDays[personnelId] || 0) + 1;
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
        if (problem.deviceOffDates?.has(`${device.id}:${dateStr}`)) continue;

        const deviceShiftDefs = problem.shiftDefinitions.filter(sd => sd.deviceId === device.id);
        const shiftDefs = deviceShiftDefs.length > 0
          ? deviceShiftDefs
          : this.getDefaultShiftDefs(device, isWeekend, isHoliday, problem.configuration);

        for (const shiftDef of shiftDefs) {
          const shiftType = shiftDef.shiftType;

          // Check if this slot is already filled by an existing assignment
          // (PHASE 5C.26 — the personnelType discriminator is part of the slot
          // identity so technician / technician_2 / technician_3 coexist).
          const alreadyFilled = candidate.assignments.some(
            a => a.deviceId === device.id && a.date === dateStr && a.shiftType === shiftType
              && a.personnelType === shiftDef.personnelType,
          );
          if (alreadyFilled) continue;

          const week = startOfWeek(dateStr);
          const shiftHours = this.shiftDurationHours(shiftDef.startTime, shiftDef.endTime);
          const available = this.findAvailable(
            problem.personnel, device, dateStr, shiftType, shiftDef,
            workload, nightCount, consecutiveDays, lastShiftDate, candidate.assignments,
            problem.configuration, weeklyHours, week, shiftHours, lastNightDate,
          );

          if (available.length === 0) {
            // P2-11 — fail closed: an unfilled slot caused by the hard weekly
            // cap is reported as MAX_WORK_EXCEEDED, never a silent success.
            const capBlocked = problem.personnel.some(
              p => p.isActive && p.employmentStatus === 'active' && p.maxWeeklyHours > 0 &&
                (weeklyHours[week]?.[p.id] || 0) + shiftHours > p.maxWeeklyHours,
            );
            if (capBlocked) {
              candidate.isValid = false;
              candidate.hardConstraintViolations.push({
                id: `max-work-${dateStr}-${device.id}-${shiftType}`,
                code: ConflictCode.MAX_WORK_EXCEEDED,
                severity: ConflictSeverity.ERROR,
                message: `MAX_WORK_EXCEEDED — ${dateStr} ${device.name} ${shiftType}: haftalık saat limiti dolan personel nedeniyle atama yapılamadı`,
                context: {
                  date: dateStr,
                  shiftType,
                  startTime: shiftDef.startTime,
                  endTime: shiftDef.endTime,
                  deviceId: device.id,
                  deviceName: device.name,
                  maxHours: Math.max(...problem.personnel.filter(p => p.maxWeeklyHours > 0).map(p => p.maxWeeklyHours)),
                },
                isHardConstraint: true,
                isOverridable: false,
                detectedAt: new Date(),
              });
            }
            continue;
          }

          const selected = this.selectBest(available, workload, nightCount, shiftType, problem.configuration.fairnessMode);

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
          (weeklyHours[week] ??= {})[selected.id] = (weeklyHours[week]?.[selected.id] || 0) + shiftHours;

          // P2-18 — `evening` is NOT a night shift. Only nights advance the
          // night streak and the canonical 48h anchor.
          if (shiftType === 'night') {
            nightCount[selected.id] = (nightCount[selected.id] || 0) + 1;
            lastNightDate[selected.id] = dateStr;
          } else {
            nightCount[selected.id] = 0;
          }

          if (lastShiftDate[selected.id] === dateStr) {
            consecutiveDays[selected.id] = consecutiveDays[selected.id] || 0;
          } else {
            consecutiveDays[selected.id] = (consecutiveDays[selected.id] || 0) + 1;
          }
          lastShiftDate[selected.id] = dateStr;
        }
      }

      for (const p of problem.personnel) {
        if (!candidate.assignments.some(a => a.personnelId === p.id && a.date === dateStr)) {
          consecutiveDays[p.id] = 0;
        }
      }
    }

    return candidate;
  }

  private evaluateHardConstraints(candidate: CandidateSchedule, problem: SchedulingProblem): void {
    const personnelLookup = this.buildPersonnelLookup(problem.personnel, problem.unitId);
    const deviceLookup = this.buildDeviceLookup(problem.devices, problem.unitId);
    const emptyTemplates = new Map<string, ShiftTemplateInfo>();
    const emptyGroups = new Map<string, GroupInfo>();
    const templatesLookup: ShiftTemplateLookup = { findById: (id) => emptyTemplates.get(id) };
    const groupsLookup: GroupLookup = { findById: (id) => emptyGroups.get(id) };
    const blockedDates = this.buildBlockedDatesMap(problem.personnel);

    // P2-02 (performance) — materialize the full candidate collection once.
    // The previous loop rebuilt every Assignment entity for every slot
    // (O(n²) value-object construction: ~194k create() calls at n=440), which
    // pushed the 200-personnel benchmark past its 3000ms budget once the real
    // roster reached the scoring layer. Self-exclusion is preserved exactly:
    // the assignment under test is removed from the shared collection for the
    // duration of its own validation and restored immediately afterwards.
    // P2-18 — generated night shifts remain visible to RequiredRestConstraintNew.
    const toAssignment = (ca: CandidateAssignment): Assignment => Assignment.create({
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
    for (const existing of problem.existingAssignments.all) {
      fullCollection.add(existing);
    }
    const assignments = candidate.assignments.map(toAssignment);
    for (const assignment of assignments) {
      fullCollection.add(assignment);
    }

    // Validate each candidate assignment against hard constraints.
    // Pre-seeded assignments are validated separately; only validate new assignments.
    for (let i = 0; i < candidate.assignments.length; i += 1) {
      const ca = candidate.assignments[i];
      if (ca.isPreSeeded) continue;
      const assignment = assignments[i];

      fullCollection.remove(assignment.id);
      let report: ReturnType<ConstraintEngine['validate']>;
      try {
        report = this.constraintEngine.validate(
          assignment,
          fullCollection,
          personnelLookup,
          deviceLookup,
          problem.holidays,
          problem.deviceOffDates || new Set(),
          templatesLookup,
          groupsLookup,
          blockedDates,
        );
      } finally {
        fullCollection.add(assignment);
      }

      if (report.hasBlocking) {
        candidate.isValid = false;
        candidate.hardConstraintViolations.push(...report.violations.map(v => ({
          id: `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          code: 'RULE_VIOLATION' as any,
          severity: 'ERROR' as any,
          message: v.message,
          context: { date: ca.date, shiftType: ca.shiftType, startTime: ca.startTime, endTime: ca.endTime },
          isHardConstraint: true,
          isOverridable: v.isOverrideAllowed,
          detectedAt: new Date(),
        })));
      }
    }
  }

  private readonly coverageEngine = new CoverageEngine();

  /**
   * PHASE 5C.26 P1-A2 — schedule-level minimum coverage evaluation reusing the
   * single authoritative CoverageEngine. Under-covered candidates are hard
   * invalid (COVERAGE_MISSING, ERROR, non-overridable).
   */
  private evaluateCoverage(candidate: CandidateSchedule, problem: SchedulingProblem): void {
    const context = problem.coverageContext || { assistantPersonnelCount: 0, supervisorPersonnelCount: 0 };
    const input: CoverageInput = {
      year: problem.year,
      month: problem.month,
      includeWeekends: problem.configuration.includeWeekends,
      includeNightShifts: problem.configuration.includeNightShifts,
      devices: problem.devices.map(d => ({ id: d.id, name: d.name, mode: d.mode, workDays: d.workDays })),
      shiftDefs: problem.shiftDefinitions.map(sd => ({
        id: sd.id || '',
        deviceId: sd.deviceId,
        shiftType: sd.shiftType,
        startTime: sd.startTime,
        endTime: sd.endTime,
        personnelType: sd.personnelType,
        blockId: sd.blockId,
        optionalOnWeekends: sd.optionalOnWeekends,
        optionalOnHolidays: sd.optionalOnHolidays,
      })),
      holidays: problem.holidays,
      deviceOffDates: problem.deviceOffDates,
      shiftDateOverrides: context.shiftDateOverrides,
      technicianPersonnelCount: problem.personnel.filter(
        p => !p.role || p.role === 'technician' || p.role === 'senior_technician' || p.role.startsWith('technician_'),
      ).length,
      assistantPersonnelCount: context.assistantPersonnelCount,
      supervisorPersonnelCount: context.supervisorPersonnelCount,
      assignments: candidate.assignments.map(a => ({
        personnelId: a.personnelId,
        deviceId: a.deviceId,
        date: a.date,
        shiftType: a.shiftType,
        personnelType: a.personnelType,
      })),
      blockedPersonnelDates: this.buildBlockedDatesMap(problem.personnel),
    };

    const result = this.coverageEngine.evaluateCoverage(input);
    if (result.underCoverage.length === 0) return;

    candidate.isValid = false;
    const count = Math.min(result.underCoverage.length, 100);
    for (let i = 0; i < count; i++) {
      const line = result.underCoverage[i];
      candidate.hardConstraintViolations.push({
        id: `coverage-${i}-${line.key}`,
        code: 'COVERAGE_MISSING' as any,
        severity: 'ERROR' as any,
        message: `Minimum kadro karşılanmıyor: ${line.deviceName} ${line.date} ${line.shiftType} (${line.personnelType}) — gerekli ${line.required}, atanmış ${line.assigned}.`,
        context: {
          date: line.date,
          shiftType: line.shiftType,
          startTime: line.shiftType === 'night' ? '00:00' : line.shiftType === 'evening' ? '16:00' : '08:00',
          endTime: line.shiftType === 'night' ? '08:00' : line.shiftType === 'evening' ? '00:00' : '16:00',
          deviceId: line.deviceId,
          deviceName: line.deviceName,
        },
        isHardConstraint: true,
        isOverridable: false,
        detectedAt: new Date(),
      });
    }
  }

  private evaluateSoftConstraints(candidate: CandidateSchedule, problem: SchedulingProblem): import('../constraints/soft-constraint.interface').ConstraintScore[] {
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
      year: problem.year,
      month: problem.month,
    };

    return [
      this.fairnessConstraint.evaluate(ctx),
      this.fatigueConstraint.evaluate(ctx),
      this.workloadConstraint.evaluate(ctx),
    ];
  }

  private buildExplanations(candidate: CandidateSchedule, problem: SchedulingProblem): string[] {
    const explanations: string[] = [];
    const existingCount = problem.existingAssignments.all.length;
    const newCount = candidate.assignments.length - existingCount;

    if (candidate.isValid) {
      explanations.push(`Pre-seeded ${existingCount} existing assignments`);
      explanations.push(`Generated ${Math.max(0, newCount)} new assignments`);
      explanations.push(`Total: ${candidate.assignments.length} assignments`);
      explanations.push(`Score: ${candidate.totalScore.toFixed(1)}`);
      explanations.push(`Personnel: ${new Set(candidate.assignments.map(a => a.personnelId)).size}`);
      explanations.push(`Devices: ${new Set(candidate.assignments.map(a => a.deviceId)).size}`);
    } else {
      explanations.push(`Candidate invalid: ${candidate.hardConstraintViolations.length} hard violations`);
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
    weeklyHours?: Record<string, Record<string, number>>,
    week?: string,
    shiftHours?: number,
    lastNightDate?: Record<string, string | null>,
  ): SchedulingProblemPersonnel[] {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();

    return personnel.filter(p => {
      if (!p.isActive || p.employmentStatus !== 'active') return false;

      // P2-11 — hard per-calendar-week cap, identical unit (hours) and week key
      // (Monday) as the production generator.
      if (week && shiftHours !== undefined && p.maxWeeklyHours > 0 &&
          (weeklyHours?.[week]?.[p.id] || 0) + shiftHours > p.maxWeeklyHours) return false;

      // PHASE 5C.25 — authoritative blockedDates (leave/absence/unsuitable +
      // weekly offDays with AVAILABLE override) replaces the raw offDays filter
      // when provided, so an explicit AVAILABLE row can override an off-day.
      if (p.blockedDates) {
        if (p.blockedDates.includes(dateStr)) return false;
      } else if (p.offDays.includes(dayOfWeek)) {
        return false;
      }

      if ((shiftType === 'night' || shiftType === 'evening') && !p.nightShiftEligible) return false;

      if (device.requiredSkills.length > 0) {
        const hasSkill = device.requiredSkills.some(s => p.skills.includes(s) || p.deviceSkills.includes(s));
        if (!hasSkill) return false;
      }

      if (existingAssignments.some(a => a.personnelId === p.id && a.date === dateStr)) return false;

      if (lastShiftDate[p.id]) {
        const diffMs = new Date(dateStr).getTime() - new Date(lastShiftDate[p.id]!).getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        if (diffHours < config.minRestHours) return false;
      }

      // P2-18 — canonical engine rule: a new night needs >= 2 calendar days
      // from the previous night, irrespective of daytime shifts in between.
      if (shiftType === 'night') {
        const previousNight = lastNightDate?.[p.id];
        if (previousNight && daysBetweenKeys(previousNight, dateStr) < 2) return false;
        if ((nightCount[p.id] || 0) >= config.maxConsecutiveNights) return false;
      }
      if ((consecutiveDays[p.id] || 0) >= config.maxConsecutiveDays) return false;

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
    const scored = candidates.map(p => {
      let score = 1000 - (workload[p.id] || 0) * 10;

      // P2-18 — the night ledger no longer contains evening shifts.
      if (shiftType === 'night') {
        score -= (nightCount[p.id] || 0) * 20;
      }

      if (fairnessMode === 'seniority') {
        // P2-10 — real seniority, not the candidate's array position.
        score += Math.min(Math.max(p.seniority ?? 0, 0), 20);
      } else if (fairnessMode === 'skill') {
        score += p.skills.length * 3 + p.deviceSkills.length * 5;
      }

      return { person: p, score };
    });

    // P2-10 — id tie-break keeps the choice stable across reversed input order.
    scored.sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id));
    return scored[0].person;
  }

  /** P2-11 — local shift-string duration (no UTC conversion), mirrors the generator. */
  private shiftDurationHours(startTime: string, endTime: string): number {
    const toMinutes = (value: string): number => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
      if (!match) return 0;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return 0;
      return hours * 60 + minutes;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === 0 && end === 0) return 0;
    return (end > start ? end - start : end + 24 * 60 - start) / 60;
  }

  private getDefaultShiftDefs(
    device: SchedulingProblemDevice,
    isWeekend: boolean,
    isHoliday: boolean,
    config: SchedulingProblem['configuration'],
  ): { deviceId: string; shiftType: string; startTime: string; endTime: string; personnelType: string }[] {
    if (device.mode === 'polyclinic') {
      return [{ deviceId: device.id, shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician' }];
    }
    if (!config.includeNightShifts || isWeekend || isHoliday) {
      return [{ deviceId: device.id, shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician' }];
    }
    return [
      { deviceId: device.id, shiftType: 'day', startTime: '08:00', endTime: '16:00', personnelType: 'technician' },
      { deviceId: device.id, shiftType: 'evening', startTime: '16:00', endTime: '00:00', personnelType: 'technician' },
      { deviceId: device.id, shiftType: 'night', startTime: '00:00', endTime: '08:00', personnelType: 'technician' },
    ];
  }

  private buildBlockedDatesMap(personnel: SchedulingProblemPersonnel[]): Map<string, Set<string>> {
    const map = new Map<string, Set<string>>();
    for (const p of personnel) {
      if (p.blockedDates && p.blockedDates.length > 0) {
        map.set(p.id, new Set(p.blockedDates));
      }
    }
    return map;
  }

  private buildPersonnelLookup(personnel: SchedulingProblemPersonnel[], unitId: string): PersonnelLookup {
    const map = new Map<string, PersonnelInfo>();
    for (const p of personnel) {
      map.set(p.id, {
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
      });
    }
    return {
      findById: (id: string): PersonnelInfo | undefined => map.get(id),
      all: () => Array.from(map.values()),
    };
  }

  private buildDeviceLookup(devices: SchedulingProblemDevice[], unitId: string): DeviceLookup {
    const map = new Map(devices.map(d => [d.id, d]));
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
