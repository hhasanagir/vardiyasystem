import { Injectable } from '@angular/core';
import type { Schedule, ShiftAssignment, Personnel, Device } from '../../domain';
import type { UnitType } from '../../domain/enums';
import { FatigueEngineService } from './fatigue-engine.service';
import { RebalanceEngineService, RebalanceScore } from './rebalance-engine.service';

export interface Recommendation {
  id: string;
  type: RecommendationType;
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: RecommendationImpact;
  action: RecommendedAction;
  rationale: string[];
  ruleReferences: string[];
  createdAt: Date;
}

export type RecommendationType =
  | 'swap'
  | 'coverage'
  | 'fairness'
  | 'fatigue'
  | 'dose'
  | 'compliance'
  | 'rotation';

export interface RecommendationImpact {
  fatigueReduction: number;
  fairnessImprovement: number;
  coverageImprovement: number;
  overallScoreChange: number;
}

export interface RecommendedAction {
  type: 'swap' | 'replace' | 'remove' | 'add' | 'adjust';
  assignmentId?: string;
  targetAssignmentId?: string;
  fromPersonnelId?: string;
  toPersonnelId?: string;
  newValue?: Record<string, unknown>;
}

export interface SwapRecommendation extends Recommendation {
  currentAssignment: {
    personnelId: string;
    personnelName: string;
    date: string;
    shiftType: string;
    fatigueScore: number;
  };
  suggestedAssignment: {
    personnelId: string;
    personnelName: string;
    fatigueScore: number;
    reason: string;
  };
  comparison: {
    fatigueChange: number;
    fairnessChange: number;
    coveredByRule: string;
  };
}

export interface CoverageRecommendation extends Recommendation {
  gap: {
    date: string;
    deviceId: string;
    deviceName: string;
    shiftType: string;
  };
  alternatives: CoverageAlternative[];
}

export interface CoverageAlternative {
  personnelId: string;
  personnelName: string;
  qualificationScore: number;
  currentWorkload: number;
  fatigueScore: number;
  availability: 'full' | 'partial' | 'limited';
}

export interface FairnessInsight {
  metric: string;
  currentValue: number;
  targetValue: number;
  gap: number;
  affectedPersonnel: PersonnelImpact[];
}

export interface PersonnelImpact {
  personnelId: string;
  personnelName: string;
  current: number;
  recommended: number;
  change: number;
}

export interface DoseWarning {
  personnelId: string;
  personnelName: string;
  currentMonthlyDose: number;
  threshold: number;
  remainingBudget: number;
  riskLevel: 'safe' | 'warning' | 'critical';
  affectedAssignments: string[];
}

@Injectable({ providedIn: 'root' })
export class RecommendationEngineService {
  constructor(
    private fatigueEngine: FatigueEngineService,
    private rebalanceEngine: RebalanceEngineService,
  ) {}

  generateRecommendations(
    schedule: Schedule,
    personnel: Personnel[],
    devices: Device[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];

    const swapRecommendations = this.generateSwapRecommendations(schedule, personnel);
    recommendations.push(...swapRecommendations);

    const coverageRecommendations = this.generateCoverageRecommendations(
      schedule,
      personnel,
      devices,
    );
    recommendations.push(...coverageRecommendations);

    const fairnessRecommendations = this.generateFairnessRecommendations(schedule, personnel);
    recommendations.push(...fairnessRecommendations);

    const fatigueRecommendations = this.generateFatigueRecommendations(schedule, personnel);
    recommendations.push(...fatigueRecommendations);

    return recommendations
      .filter((r) => r.impact.overallScoreChange > 0)
      .sort((a, b) => {
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  generateSwapRecommendations(schedule: Schedule, personnel: Personnel[]): SwapRecommendation[] {
    const recommendations: SwapRecommendation[] = [];
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));
    const currentScore = this.rebalanceEngine.calculateScore(schedule, personnel);

    const problematicAssignments = this.findProblematicAssignments(
      schedule,
      personnel,
      personnelMap,
    );

    for (const problem of problematicAssignments) {
      const candidates = this.findBetterCandidates(
        problem.assignment,
        problem.reason,
        schedule,
        personnel,
        personnelMap,
      );

      for (const candidate of candidates) {
        const simulatedSchedule = this.simulateSwap(
          schedule,
          problem.assignment,
          candidate.assignment,
        );
        const newScore = this.rebalanceEngine.calculateScore(simulatedSchedule, personnel);
        const scoreChange = newScore.overall - currentScore.overall;

        if (scoreChange > 1) {
          const fatigueChange = problem.assignmentFatigue - candidate.assignmentFatigue;

          recommendations.push({
            id: `swap-${problem.assignment.id}-${candidate.personnel.id}`,
            type: 'swap',
            priority: scoreChange > 5 ? 'high' : scoreChange > 2 ? 'medium' : 'low',
            title: `${problem.personnel.name} yerine ${candidate.personnel.name} atanabilir`,
            description: this.generateSwapDescription(problem, candidate, fatigueChange),
            impact: {
              fatigueReduction: Math.max(0, fatigueChange),
              fairnessImprovement: newScore.fairness - currentScore.fairness,
              coverageImprovement: 0,
              overallScoreChange: scoreChange,
            },
            action: {
              type: 'swap',
              assignmentId: problem.assignment.id,
              targetAssignmentId: candidate.assignment.id,
              fromPersonnelId: problem.personnel.id,
              toPersonnelId: candidate.personnel.id,
            },
            rationale: this.generateRationale(problem, candidate, fatigueChange),
            ruleReferences: this.getRuleReferences('swap'),
            createdAt: new Date(),
            currentAssignment: {
              personnelId: problem.personnel.id,
              personnelName: problem.personnel.name,
              date: problem.assignment.date,
              shiftType: problem.assignment.shiftType,
              fatigueScore: problem.assignmentFatigue,
            },
            suggestedAssignment: {
              personnelId: candidate.personnel.id,
              personnelName: candidate.personnel.name,
              fatigueScore: candidate.assignmentFatigue,
              reason: candidate.reason,
            },
            comparison: {
              fatigueChange,
              fairnessChange: newScore.fairness - currentScore.fairness,
              coveredByRule: 'SHIFT-002 / Fatigue Optimization',
            },
          });
        }
      }
    }

    return recommendations.sort(
      (a, b) => b.impact.overallScoreChange - a.impact.overallScoreChange,
    );
  }

  private generateCoverageRecommendations(
    schedule: Schedule,
    personnel: Personnel[],
    devices: Device[],
  ): CoverageRecommendation[] {
    const recommendations: CoverageRecommendation[] = [];
    const deviceMap = new Map(devices.map((d) => [d.id, d]));

    const gaps = this.findCoverageGaps(schedule);

    for (const gap of gaps) {
      const alternatives = this.findCoverageAlternatives(gap, schedule, personnel);

      if (alternatives.length > 0) {
        recommendations.push({
          id: `coverage-${gap.date}-${gap.deviceId}`,
          type: 'coverage',
          priority: 'high',
          title: `${deviceMap.get(gap.deviceId)?.name || gap.deviceId} için ${gap.date} tarihinde personel ataması gerekli`,
          description: `${gap.shiftType} vardiyası için ${alternatives.length} uygun personel bulundu`,
          impact: {
            fatigueReduction: 0,
            fairnessImprovement: 0,
            coverageImprovement: 10,
            overallScoreChange: 2,
          },
          action: {
            type: 'add',
            assignmentId: gap.assignmentId,
            newValue: {
              deviceId: gap.deviceId,
              date: gap.date,
              shiftType: gap.shiftType,
            },
          },
          rationale: ["Kapsama boşluğu scheduled coverage'ı düşürüyor"],
          ruleReferences: ['COVERAGE-001'],
          createdAt: new Date(),
          gap: {
            date: gap.date,
            deviceId: gap.deviceId,
            deviceName: deviceMap.get(gap.deviceId)?.name || gap.deviceId,
            shiftType: gap.shiftType,
          },
          alternatives: alternatives.slice(0, 3),
        });
      }
    }

    return recommendations;
  }

  private generateFairnessRecommendations(
    schedule: Schedule,
    personnel: Personnel[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const currentScore = this.rebalanceEngine.calculateScore(schedule, personnel);

    const insights = this.analyzeFairnessInsights(schedule, personnel);

    for (const insight of insights) {
      if (insight.gap > 15) {
        const mostLoaded = insight.affectedPersonnel.filter((p) => p.change < -10);
        const leastLoaded = insight.affectedPersonnel.filter((p) => p.change > 10);

        if (mostLoaded.length > 0 && leastLoaded.length > 0) {
          recommendations.push({
            id: `fairness-${insight.metric}-${Date.now()}`,
            type: 'fairness',
            priority: insight.gap > 25 ? 'high' : 'medium',
            title: `${insight.metric} adaletsizliği tespit edildi`,
            description: `${mostLoaded[0].personnelName} fazla yükleniyor, ${leastLoaded[0].personnelName} eksik yükleniyor`,
            impact: {
              fatigueReduction: 0,
              fairnessImprovement: insight.gap / 10,
              coverageImprovement: 0,
              overallScoreChange: insight.gap / 15,
            },
            action: {
              type: 'adjust',
              newValue: { metric: insight.metric, targetBalance: insight.targetValue },
            },
            rationale: [
              `Mevcut dağılım: ${insight.currentValue.toFixed(1)}%`,
              `Hedef dağılım: ${insight.targetValue.toFixed(1)}%`,
              `Fark: ${insight.gap.toFixed(1)}%`,
            ],
            ruleReferences: ['FAIRNESS-001'],
            createdAt: new Date(),
          });
        }
      }
    }

    return recommendations;
  }

  private generateFatigueRecommendations(
    schedule: Schedule,
    personnel: Personnel[],
  ): Recommendation[] {
    const recommendations: Recommendation[] = [];
    const personnelMap = new Map(personnel.map((p) => [p.id, p]));

    const highFatiguePersonnel = this.identifyHighFatiguePersonnel(schedule, personnel);

    for (const entry of highFatiguePersonnel) {
      const person = personnelMap.get(entry.personnelId);
      if (!person) continue;

      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(
        schedule.assignments.filter((a) => a.personnelId === entry.personnelId),
        person,
      );

      if (profile.currentFatigue > 60) {
        const reductionPotential = this.calculateFatigueReductionPotential(
          entry,
          schedule,
          personnel,
        );

        recommendations.push({
          id: `fatigue-${entry.personnelId}-${Date.now()}`,
          type: 'fatigue',
          priority: profile.currentFatigue > 80 ? 'high' : 'medium',
          title: `${person.name} için yorgunluk riski yüksek`,
          description: `Mevcut fatigue skoru: ${profile.currentFatigue.toFixed(0)}%. ${reductionPotential.toFixed(0)}% azaltılabilir.`,
          impact: {
            fatigueReduction: reductionPotential,
            fairnessImprovement: 0,
            coverageImprovement: 0,
            overallScoreChange: reductionPotential / 10,
          },
          action: {
            type: 'adjust',
            fromPersonnelId: entry.personnelId,
            newValue: { targetFatigue: Math.max(30, profile.currentFatigue - reductionPotential) },
          },
          rationale: profile.riskFlags.map((flag: string) => this.getRiskFlagExplanation(flag)),
          ruleReferences: ['FATIGUE-001', 'WRK-003'],
          createdAt: new Date(),
        });
      }
    }

    return recommendations;
  }

  private findProblematicAssignments(
    schedule: Schedule,
    personnel: Personnel[],
    personnelMap: Map<string, Personnel>,
  ): Array<{
    assignment: ShiftAssignment;
    personnel: Personnel;
    reason: string;
    assignmentFatigue: number;
  }> {
    const problems: Array<{
      assignment: ShiftAssignment;
      personnel: Personnel;
      reason: string;
      assignmentFatigue: number;
    }> = [];

    const nightAssignments = schedule.assignments.filter((a) => a.shiftType === 'night');

    for (const assignment of nightAssignments) {
      const person = personnelMap.get(assignment.personnelId);
      if (!person) continue;

      const allAssignments = schedule.assignments.filter((a) => a.personnelId === person.id);
      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(allAssignments, person);

      if (profile.currentFatigue > 50) {
        const consecutiveNights = this.countConsecutiveNightAssignments(
          allAssignments,
          assignment.date,
        );

        if (consecutiveNights >= 2) {
          problems.push({
            assignment,
            personnel: person,
            reason: `${consecutiveNights} gece üst üste`,
            assignmentFatigue: profile.currentFatigue,
          });
        }
      }
    }

    return problems.sort((a, b) => b.assignmentFatigue - a.assignmentFatigue);
  }

  private findBetterCandidates(
    problemAssignment: ShiftAssignment,
    problemReason: string,
    schedule: Schedule,
    personnel: Personnel[],
    personnelMap: Map<string, Personnel>,
  ): Array<{
    personnel: Personnel;
    assignment: ShiftAssignment;
    assignmentFatigue: number;
    reason: string;
  }> {
    const candidates: Array<{
      personnel: Personnel;
      assignment: ShiftAssignment;
      assignmentFatigue: number;
      reason: string;
    }> = [];

    for (const person of personnel) {
      if (person.id === problemAssignment.personnelId) continue;
      if (!person.isActive) continue;

      const hasConflict = schedule.assignments.some(
        (a) => a.personnelId === person.id && a.date === problemAssignment.date,
      );

      if (hasConflict) continue;

      const personAssignments = schedule.assignments.filter((a) => a.personnelId === person.id);
      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(
        personAssignments,
        person,
      );

      if (profile.currentFatigue < 40) {
        candidates.push({
          personnel: person,
          assignment: { ...problemAssignment, personnelId: person.id },
          assignmentFatigue: profile.currentFatigue,
          reason: 'Düşük fatigue skoru',
        });
      }
    }

    return candidates.sort((a, b) => a.assignmentFatigue - b.assignmentFatigue).slice(0, 3);
  }

  private simulateSwap(
    schedule: Schedule,
    assignment1: ShiftAssignment,
    assignment2: ShiftAssignment,
  ): Schedule {
    const newAssignments = schedule.assignments.map((a) => {
      if (a.id === assignment1.id) {
        return { ...a, personnelId: assignment2.personnelId };
      }
      if (a.id === assignment2.id) {
        return { ...a, personnelId: assignment1.personnelId };
      }
      return a;
    });

    return { ...schedule, assignments: newAssignments };
  }

  private findCoverageGaps(schedule: Schedule): Array<{
    date: string;
    deviceId: string;
    shiftType: string;
    assignmentId: string;
  }> {
    const gaps: Array<{
      date: string;
      deviceId: string;
      shiftType: string;
      assignmentId: string;
    }> = [];

    for (const assignment of schedule.assignments) {
      if (!assignment.personnelId || assignment.personnelId === 'unassigned') {
        gaps.push({
          date: assignment.date,
          deviceId: assignment.deviceId,
          shiftType: assignment.shiftType,
          assignmentId: assignment.id,
        });
      }
    }

    return gaps;
  }

  private findCoverageAlternatives(
    gap: { date: string; deviceId: string; shiftType: string },
    schedule: Schedule,
    personnel: Personnel[],
  ): CoverageAlternative[] {
    const alternatives: CoverageAlternative[] = [];

    for (const person of personnel) {
      if (!person.isActive) continue;

      const hasConflict = schedule.assignments.some(
        (a) => a.personnelId === person.id && a.date === gap.date,
      );

      if (hasConflict) continue;

      const personAssignments = schedule.assignments.filter((a) => a.personnelId === person.id);
      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(
        personAssignments,
        person,
      );

      const totalShifts = schedule.assignments.filter((a) => a.personnelId === person.id).length;

      alternatives.push({
        personnelId: person.id,
        personnelName: person.name,
        qualificationScore: 100 - profile.currentFatigue,
        currentWorkload: totalShifts,
        fatigueScore: profile.currentFatigue,
        availability:
          profile.currentFatigue < 40
            ? 'full'
            : profile.currentFatigue < 70
              ? 'partial'
              : 'limited',
      });
    }

    return alternatives.sort((a, b) => b.qualificationScore - a.qualificationScore);
  }

  private analyzeFairnessInsights(schedule: Schedule, personnel: Personnel[]): FairnessInsight[] {
    const insights: FairnessInsight[] = [];
    const nightAssignments = schedule.assignments.filter((a) => a.shiftType === 'night');

    const nightCounts = new Map<string, number>();
    for (const assignment of nightAssignments) {
      nightCounts.set(assignment.personnelId, (nightCounts.get(assignment.personnelId) || 0) + 1);
    }

    const values = Array.from(nightCounts.values());
    const avg = values.reduce((a, b) => a + b, 0) / (values.length || 1);

    const affectedPersonnel: PersonnelImpact[] = [];
    for (const [personnelId, count] of nightCounts) {
      const person = personnel.find((p) => p.id === personnelId);
      if (person) {
        affectedPersonnel.push({
          personnelId,
          personnelName: person.name,
          current: count,
          recommended: Math.round(avg),
          change: avg - count,
        });
      }
    }

    const variance = values.reduce((sum, v) => sum + Math.abs(v - avg), 0) / (values.length || 1);

    insights.push({
      metric: 'Gece Vardiyası Dağılımı',
      currentValue: avg,
      targetValue: avg,
      gap: variance * 10,
      affectedPersonnel: affectedPersonnel.sort((a, b) => a.change - b.change),
    });

    return insights;
  }

  private identifyHighFatiguePersonnel(
    schedule: Schedule,
    personnel: Personnel[],
  ): Array<{ personnelId: string; fatigueScore: number; assignment: ShiftAssignment }> {
    const results: Array<{
      personnelId: string;
      fatigueScore: number;
      assignment: ShiftAssignment;
    }> = [];

    for (const person of personnel) {
      const assignments = schedule.assignments.filter((a) => a.personnelId === person.id);
      const profile = this.fatigueEngine.calculatePersonnelFatigueProfile(assignments, person);

      if (profile.currentFatigue > 50 && assignments.length > 0) {
        results.push({
          personnelId: person.id,
          fatigueScore: profile.currentFatigue,
          assignment: assignments[0],
        });
      }
    }

    return results.sort((a, b) => b.fatigueScore - a.fatigueScore);
  }

  private calculateFatigueReductionPotential(
    entry: { personnelId: string; assignment: ShiftAssignment },
    schedule: Schedule,
    personnel: Personnel[],
  ): number {
    const otherAssignments = schedule.assignments.filter(
      (a) => a.personnelId === entry.personnelId && a.id !== entry.assignment.id,
    );

    const currentFatigue = this.fatigueEngine.calculatePersonnelFatigueProfile(
      schedule.assignments.filter((a) => a.personnelId === entry.personnelId),
      personnel.find((p) => p.id === entry.personnelId)!,
    ).currentFatigue;

    const potentialFatigue = this.fatigueEngine.calculatePersonnelFatigueProfile(
      otherAssignments,
      personnel.find((p) => p.id === entry.personnelId)!,
    ).currentFatigue;

    return currentFatigue - potentialFatigue;
  }

  private countConsecutiveNightAssignments(
    assignments: ShiftAssignment[],
    targetDate: string,
  ): number {
    const sorted = assignments
      .filter((a) => a.shiftType === 'night')
      .sort((a, b) => b.date.localeCompare(a.date));

    const targetIndex = sorted.findIndex((a) => a.date === targetDate);
    if (targetIndex === -1) return 0;

    let count = 1;
    for (let i = targetIndex + 1; i < sorted.length; i++) {
      const prevDate = new Date(sorted[i - 1].date);
      const currDate = new Date(sorted[i].date);
      const daysDiff = Math.round(
        (prevDate.getTime() - currDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (daysDiff === 1) {
        count++;
      } else {
        break;
      }
    }

    return count;
  }

  private generateSwapDescription(
    problem: {
      assignment: ShiftAssignment;
      personnel: Personnel;
      reason: string;
      assignmentFatigue: number;
    },
    candidate: { personnel: Personnel; reason: string; assignmentFatigue: number },
    fatigueChange: number,
  ): string {
    const improvement = problem.assignmentFatigue - candidate.assignmentFatigue;
    return `${problem.personnel.name} (${problem.assignmentFatigue.toFixed(0)}%) yerine ${candidate.personnel.name} (${candidate.assignmentFatigue.toFixed(0)}%) atanırsa fatigue ${improvement.toFixed(0)}% azalır`;
  }

  private generateRationale(
    problem: { assignment: ShiftAssignment; personnel: Personnel; reason: string },
    candidate: { personnel: Personnel; reason: string },
    fatigueChange: number,
  ): string[] {
    const rationale: string[] = [];

    rationale.push(`Mevcut atama: ${problem.personnel.name}`);
    rationale.push(`Problem: ${problem.reason}`);
    rationale.push(`Alternatif: ${candidate.personnel.name}`);
    rationale.push(`Gerekçe: ${candidate.reason}`);

    if (fatigueChange > 0) {
      rationale.push(`Tahmini iyileşme: ${fatigueChange.toFixed(0)}%`);
    }

    return rationale;
  }

  private getRuleReferences(type: string): string[] {
    const references: Record<string, string[]> = {
      swap: ['SHIFT-002', 'FATIGUE-001', 'WRK-003'],
      coverage: ['COVERAGE-001', 'COVERAGE-002'],
      fairness: ['FAIRNESS-001', 'MR-003'],
      fatigue: ['FATIGUE-001', 'WRK-003', 'NUC-003'],
      dose: ['RAD-001', 'RAD-004'],
    };

    return references[type] || [];
  }

  private getRiskFlagExplanation(flag: string): string {
    const explanations: Record<string, string> = {
      high_consecutive_nights: 'Ardışık gece vardiyası sayısı yüksek',
      short_rest: 'Dinlenme süresi yetersiz',
      weekend_workload: 'Hafta sonu çalışma yoğunluğu yüksek',
      holiday_workload: 'Bayram günü çalışma yükü fazla',
      overtime: 'Fazla mesai limiti aşımı riski',
    };

    return explanations[flag] || flag;
  }
}
