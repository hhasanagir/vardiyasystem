import { Injectable } from '@angular/core';
import type { Schedule, ShiftAssignment, Personnel, FairnessMetrics } from '../../domain';
import type { UnitType } from '../../domain/enums';
import { FatigueEngineService } from './fatigue-engine.service';
import { ComprehensiveConstraintValidatorService } from './comprehensive-constraint-validator.service';

export interface RebalanceScore {
  overall: number;
  fairness: number;
  fatigueSafety: number;
  coverage: number;
  preferenceMatch: number;
  breakdown: ScoreBreakdown;
}

export interface ScoreBreakdown {
  nightDistribution: number;
  weekendDistribution: number;
  holidayDistribution: number;
  consecutiveNightRisk: number;
  shortRestRisk: number;
  overtimeRisk: number;
  uncoveredShifts: number;
  preferenceCompliance: number;
}

export interface RebalanceResult {
  success: boolean;
  originalScore: RebalanceScore;
  optimizedScore: RebalanceScore;
  schedule: Schedule;
  changes: RebalanceChange[];
  iterations: number;
  improvementPercent: number;
}

export interface RebalanceChange {
  type: 'swap' | 'replace' | 'remove';
  assignmentId: string;
  from: { personnelId: string; name: string };
  to?: { personnelId: string; name: string };
  reason: string;
  scoreImpact: number;
}

export interface SwapCandidate {
  assignment1: ShiftAssignment;
  assignment2: ShiftAssignment;
  scoreImprovement: number;
  reasons: string[];
}

@Injectable({ providedIn: 'root' })
export class RebalanceEngineService {
  constructor(
    private fatigueEngine: FatigueEngineService,
    private constraintValidator: ComprehensiveConstraintValidatorService,
  ) {}

  rebalance(schedule: Schedule, personnel: Personnel[]): RebalanceResult {
    let currentSchedule = JSON.parse(JSON.stringify(schedule)) as Schedule;
    let currentScore = this.calculateScore(currentSchedule, personnel);
    const changes: RebalanceChange[] = [];
    let iterations = 0;
    const maxIterations = 100;
    const minImprovementThreshold = 0.5;

    while (iterations < maxIterations) {
      iterations++;
      const bestMove = this.findBestImprovement(currentSchedule, personnel);

      if (!bestMove || bestMove.scoreImprovement < minImprovementThreshold) {
        break;
      }

      currentSchedule = this.applyChange(currentSchedule, bestMove, personnel);
      changes.push(this.createChangeRecord(bestMove, personnel));
      currentScore = this.calculateScore(currentSchedule, personnel);
    }

    const improvementPercent =
      currentScore.overall > 0
        ? ((currentScore.overall - currentScore.overall) / currentScore.overall) * 100
        : 0;

    return {
      success: changes.length > 0,
      originalScore: currentScore,
      optimizedScore: currentScore,
      schedule: currentSchedule,
      changes,
      iterations,
      improvementPercent,
    };
  }

  calculateScore(schedule: Schedule, personnel: Personnel[]): RebalanceScore {
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));
    const fairnessMetrics = this.calculateFairnessMetrics(schedule, personnel);
    const fatigueMetrics = this.calculateFatigueMetrics(schedule, personnel, personnelMap);
    const coverageMetrics = this.calculateCoverageMetrics(schedule);
    const preferenceMetrics = this.calculatePreferenceMetrics(schedule, personnelMap);

    const fairness = this.normalizeFairnessScore(fairnessMetrics);
    const fatigueSafety = this.calculateFatigueSafetyScore(fatigueMetrics);
    const coverage = this.normalizeCoverageScore(coverageMetrics);
    const preferenceMatch = preferenceMetrics.score;

    const overall = fairness * 0.35 + fatigueSafety * 0.35 + coverage * 0.2 + preferenceMatch * 0.1;

    return {
      overall,
      fairness,
      fatigueSafety,
      coverage,
      preferenceMatch,
      breakdown: {
        nightDistribution: fairnessMetrics.nightShiftDistribution,
        weekendDistribution: fairnessMetrics.weekendAssignmentRate,
        holidayDistribution: fairnessMetrics.holidayAssignmentRate,
        consecutiveNightRisk: fatigueMetrics.consecutiveNightRisk,
        shortRestRisk: fatigueMetrics.shortRestRisk,
        overtimeRisk: fatigueMetrics.overtimeRisk,
        uncoveredShifts: coverageMetrics.uncoveredCount,
        preferenceCompliance: preferenceMetrics.compliance,
      },
    };
  }

  private calculateFairnessMetrics(schedule: Schedule, personnel: Personnel[]): FairnessMetrics {
    const assignments = schedule.assignments;
    const personnelIds = [...new Set(assignments.map((a) => a.personnelId))];

    const nightShifts = new Map<string, number>();
    const weekendShifts = new Map<string, number>();
    const holidayShifts = new Map<string, number>();
    const totalShifts = new Map<string, number>();

    for (const pid of personnelIds) {
      nightShifts.set(pid, 0);
      weekendShifts.set(pid, 0);
      holidayShifts.set(pid, 0);
      totalShifts.set(pid, 0);
    }

    for (const assignment of assignments) {
      const pid = assignment.personnelId;
      totalShifts.set(pid, (totalShifts.get(pid) || 0) + 1);

      if (assignment.shiftType === 'night') {
        nightShifts.set(pid, (nightShifts.get(pid) || 0) + 1);
      }

      const date = new Date(assignment.date);
      const dayOfWeek = date.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        weekendShifts.set(pid, (weekendShifts.get(pid) || 0) + 1);
      }
    }

    const nightValues = Array.from(nightShifts.values());
    const weekendValues = Array.from(weekendShifts.values());
    const totalValues = Array.from(totalShifts.values());

    const nightDistribution = this.calculateGiniCoefficient(nightValues);
    const weekendDistribution = this.calculateGiniCoefficient(weekendValues);
    const deviceRotationFairness = this.calculateGiniCoefficient(totalValues);

    const totalAssignments = assignments.length;
    const nightTotal = Array.from(nightShifts.values()).reduce((a, b) => a + b, 0);
    const weekendTotal = Array.from(weekendShifts.values()).reduce((a, b) => a + b, 0);

    return {
      nightShiftDistribution: nightDistribution,
      weekendAssignmentRate: totalAssignments > 0 ? 1 - weekendDistribution : 1,
      holidayAssignmentRate: 1,
      deviceRotationFairness: deviceRotationFairness,
      overallScore: (nightDistribution + weekendDistribution + deviceRotationFairness) / 3,
    };
  }

  private calculateFatigueMetrics(
    schedule: Schedule,
    personnel: Personnel[],
    personnelMap: Map<string, Personnel>,
  ): {
    consecutiveNightRisk: number;
    shortRestRisk: number;
    overtimeRisk: number;
    averageFatigue: number;
  } {
    let consecutiveNightRisk = 0;
    let shortRestRisk = 0;
    let overtimeRisk = 0;
    let totalFatigue = 0;

    const personnelIds = [...new Set(schedule.assignments.map((a) => a.personnelId))];

    for (const pid of personnelIds) {
      const assignments = schedule.assignments
        .filter((a) => a.personnelId === pid)
        .sort((a, b) => a.date.localeCompare(b.date));

      for (let i = 1; i < assignments.length; i++) {
        const prev = assignments[i - 1];
        const curr = assignments[i];

        const prevEnd = this.getShiftEndHour(prev);
        const currStart = this.getShiftStartHour(curr);
        const hoursBetween = this.calculateHoursBetween(prevEnd, currStart, prev.date, curr.date);

        if (hoursBetween < 11 && hoursBetween >= 0) {
          shortRestRisk++;
        }

        if (prev.shiftType === 'night' && curr.shiftType === 'night') {
          const prevDate = new Date(prev.date);
          const currDate = new Date(curr.date);
          const daysDiff = Math.round(
            (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24),
          );

          if (daysDiff === 1) {
            consecutiveNightRisk++;
          }
        }
      }

      const personnel = personnelMap.get(pid);
      if (personnel) {
        const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(assignments, personnel);
        totalFatigue += profile.currentFatigue;

        if (profile.riskFlags.includes('high_consecutive_nights')) {
          consecutiveNightRisk += 2;
        }
        if (profile.riskFlags.includes('short_rest')) {
          shortRestRisk += 2;
        }
      }
    }

    const count = personnelIds.length || 1;

    return {
      consecutiveNightRisk: Math.min(consecutiveNightRisk / count, 100),
      shortRestRisk: Math.min(shortRestRisk / count, 100),
      overtimeRisk: Math.min(overtimeRisk / count, 100),
      averageFatigue: totalFatigue / count,
    };
  }

  private calculateCoverageMetrics(schedule: Schedule): {
    coverageRate: number;
    uncoveredCount: number;
    criticalUncovered: number;
  } {
    const totalSlots = schedule.assignments.length;
    const coveredSlots = schedule.assignments.filter((a) => a.personnelId).length;

    return {
      coverageRate: totalSlots > 0 ? (coveredSlots / totalSlots) * 100 : 0,
      uncoveredCount: totalSlots - coveredSlots,
      criticalUncovered: 0,
    };
  }

  private calculatePreferenceMetrics(
    schedule: Schedule,
    personnelMap: Map<string, Personnel>,
  ): {
    score: number;
    compliance: number;
    violations: number;
  } {
    let total = 0;
    let compliant = 0;

    for (const assignment of schedule.assignments) {
      const personnel = personnelMap.get(assignment.personnelId);
      if (!personnel) continue;

      total++;
      const prefs = personnel.preferences;

      if (prefs?.unavailableDates?.includes(assignment.date)) {
        continue;
      }
      compliant++;
    }

    return {
      score: total > 0 ? (compliant / total) * 100 : 100,
      compliance: total > 0 ? compliant / total : 1,
      violations: total - compliant,
    };
  }

  private calculateGiniCoefficient(values: number[]): number {
    if (values.length === 0) return 1;

    const sum = values.reduce((a, b) => a + b, 0);
    if (sum === 0) return 1;

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    let numerator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (2 * (i + 1) - n - 1) * sorted[i];
    }

    const denominator = n * sum;
    return 1 - numerator / denominator;
  }

  private normalizeFairnessScore(metrics: FairnessMetrics): number {
    const nightScore = metrics.nightShiftDistribution;
    const weekendScore = 1 - Math.abs(metrics.weekendAssignmentRate - 0.5) * 2;
    const rotationScore = metrics.deviceRotationFairness;

    return ((nightScore + weekendScore + rotationScore) / 3) * 100;
  }

  private calculateFatigueSafetyScore(metrics: {
    consecutiveNightRisk: number;
    shortRestRisk: number;
    overtimeRisk: number;
    averageFatigue: number;
  }): number {
    const riskPenalty =
      metrics.consecutiveNightRisk * 0.4 +
      metrics.shortRestRisk * 0.35 +
      metrics.overtimeRisk * 0.25;

    const fatiguePenalty = Math.min(metrics.averageFatigue, 100);

    return Math.max(0, 100 - riskPenalty - fatiguePenalty * 0.5);
  }

  private normalizeCoverageScore(metrics: {
    coverageRate: number;
    uncoveredCount: number;
    criticalUncovered: number;
  }): number {
    let score = metrics.coverageRate;

    if (metrics.criticalUncovered > 0) {
      score -= metrics.criticalUncovered * 10;
    }

    return Math.max(0, score);
  }

  private findBestImprovement(schedule: Schedule, personnel: Personnel[]): SwapCandidate | null {
    const candidates: SwapCandidate[] = [];
    const assignments = schedule.assignments.filter((a) => a.personnelId);

    for (let i = 0; i < assignments.length; i++) {
      for (let j = i + 1; j < assignments.length; j++) {
        if (assignments[i].date !== assignments[j].date) {
          continue;
        }

        const candidate = this.evaluateSwap(assignments[i], assignments[j], personnel);
        if (candidate && candidate.scoreImprovement > 0) {
          candidates.push(candidate);
        }
      }
    }

    for (const assignment of assignments) {
      const alternative = this.findBetterReplacement(assignment, personnel, schedule);
      if (alternative) {
        candidates.push(alternative);
      }
    }

    if (candidates.length === 0) {
      return null;
    }

    return candidates.sort((a, b) => b.scoreImprovement - a.scoreImprovement)[0];
  }

  private evaluateSwap(
    assignment1: ShiftAssignment,
    assignment2: ShiftAssignment,
    personnel: Personnel[],
  ): SwapCandidate | null {
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));
    const person1 = personnelMap.get(assignment1.personnelId);
    const person2 = personnelMap.get(assignment2.personnelId);

    if (!person1 || !person2) return null;

    const reasons: string[] = [];

    const originalFatigue1 = this.fatigueEngine.calculatePersonnelFatigueProfile(
      [assignment1],
      person1,
    ).currentFatigue;
    const originalFatigue2 = this.fatigueEngine.calculatePersonnelFatigueProfile(
      [assignment2],
      person2,
    ).currentFatigue;

    const newFatigue1 = this.fatigueEngine.calculatePersonnelFatigueProfile(
      [{ ...assignment1, personnelId: person2.id }],
      person1,
    ).currentFatigue;
    const newFatigue2 = this.fatigueEngine.calculatePersonnelFatigueProfile(
      [{ ...assignment2, personnelId: person1.id }],
      person2,
    ).currentFatigue;

    const fatigueImprovement =
      (originalFatigue1 + originalFatigue2) / 2 - (newFatigue1 + newFatigue2) / 2;

    if (fatigueImprovement > 0) {
      reasons.push(`Fatigue ${Math.round(fatigueImprovement * 10) / 10} points azalır`);
    }

    const scoreImprovement = fatigueImprovement * 0.5;

    return {
      assignment1,
      assignment2,
      scoreImprovement,
      reasons,
    };
  }

  private findBetterReplacement(
    assignment: ShiftAssignment,
    personnel: Personnel[],
    schedule: Schedule,
  ): SwapCandidate | null {
    const currentPersonnel = personnel.find((p) => p.id === assignment.personnelId);
    if (!currentPersonnel) return null;

    const currentProfile = this.fatigueEngine.calculatePersonnelFatigueProfile(
      schedule.assignments.filter((a) => a.personnelId === currentPersonnel.id),
      currentPersonnel,
    );

    let bestCandidate: SwapCandidate | null = null;

    for (const person of personnel) {
      if (person.id === currentPersonnel.id) continue;

      const personAssignments = schedule.assignments.filter((a) => a.personnelId === person.id);
      const personProfile = this.fatigueEngine.calculatePersonnelFatigueProfile(
        personAssignments,
        person,
      );

      if (personProfile.currentFatigue < currentProfile.currentFatigue - 5) {
        const improvement = currentProfile.currentFatigue - personProfile.currentFatigue;

        if (!bestCandidate || improvement > bestCandidate.scoreImprovement) {
          bestCandidate = {
            assignment1: assignment,
            assignment2: { ...assignment, personnelId: person.id } as ShiftAssignment,
            scoreImprovement: improvement * 0.5,
            reasons: [
              `${person.name} atanırsa fatigue ${Math.round(improvement * 10) / 10} puan azalır`,
            ],
          };
        }
      }
    }

    return bestCandidate;
  }

  private applyChange(schedule: Schedule, change: SwapCandidate, personnel: Personnel[]): Schedule {
    const newAssignments = schedule.assignments.map((a) => {
      if (a.id === change.assignment1.id) {
        return { ...a, personnelId: change.assignment2.personnelId };
      }
      if (a.id === change.assignment2.id) {
        return { ...a, personnelId: change.assignment1.personnelId };
      }
      return a;
    });

    return {
      ...schedule,
      assignments: newAssignments,
      updatedAt: new Date(),
      version: schedule.version + 1,
    };
  }

  private createChangeRecord(change: SwapCandidate, personnel: Personnel[]): RebalanceChange {
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));
    const from = personnelMap.get(change.assignment1.personnelId);
    const to = personnelMap.get(change.assignment2.personnelId);

    return {
      type: 'swap',
      assignmentId: change.assignment1.id,
      from: { personnelId: change.assignment1.personnelId, name: from?.name || 'Unknown' },
      to: { personnelId: change.assignment2.personnelId, name: to?.name || 'Unknown' },
      reason: change.reasons.join(', '),
      scoreImpact: change.scoreImprovement,
    };
  }

  private getShiftEndHour(assignment: ShiftAssignment): number {
    const [hours] = assignment.endTime.split(':').map(Number);
    return hours === 0 ? 24 : hours;
  }

  private getShiftStartHour(assignment: ShiftAssignment): number {
    const [hours] = assignment.startTime.split(':').map(Number);
    return hours;
  }

  private calculateHoursBetween(
    endHour: number,
    startHour: number,
    endDate: string,
    startDate: string,
  ): number {
    const end = new Date(endDate);
    const start = new Date(startDate);

    const daysDiff = Math.round((start.getTime() - end.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      return startHour - endHour;
    }

    return 24 - endHour + startHour + (daysDiff - 1) * 24;
  }
}
