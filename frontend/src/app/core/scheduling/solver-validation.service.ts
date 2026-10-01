import { Injectable } from '@angular/core';
import type { Schedule, ShiftAssignment, Personnel, Device } from '../../domain';
import type { UnitType, ShiftType } from '../../domain/enums';
import { ShiftTypeEnum, DeviceModeEnum, UnitTypeEnum } from '../../domain/enums';
import { ConstraintSolverService } from './constraint-solver.service';
import { RebalanceEngineService, RebalanceScore } from './rebalance-engine.service';
import { RecommendationEngineService } from './recommendation-engine.service';
import { FatigueEngineService } from './fatigue-engine.service';

export interface TestScenario {
  id: string;
  name: string;
  description: string;
  type: ScenarioType;
  initialConditions: InitialConditions;
  expectedOutcomes: ExpectedOutcomes;
  stressLevel: 'low' | 'medium' | 'high' | 'critical';
}

export type ScenarioType =
  | 'normal_week'
  | 'staff_shortage'
  | 'bayram_week'
  | 'device_failure'
  | 'sick_leaves'
  | 'high_demand';

export interface InitialConditions {
  unavailablePersonnel?: string[];
  unavailableDevices?: string[];
  additionalDemands?: Array<{ date: string; deviceId: string; shiftType: ShiftType }>;
  holidays?: string[];
}

export interface ExpectedOutcomes {
  minFairnessScore: number;
  maxFatigueIncrease: number;
  minCoveragePercent: number;
  maxConstraintViolations: number;
}

export interface SimulationResult {
  scenario: TestScenario;
  before: SimulationMetrics;
  after: SimulationMetrics;
  score: number;
  passed: boolean;
  violations: ViolationReport[];
  optimizationGain: OptimizationGain;
  executionTime: number;
  timestamp: Date;
}

export interface SimulationMetrics {
  fairnessScore: number;
  fatigueScore: number;
  coveragePercent: number;
  constraintViolations: number;
  nightDistributionVariance: number;
  weekendDistributionVariance: number;
  consecutiveNightRisk: number;
  averageRestHours: number;
}

export interface ViolationReport {
  ruleId: string;
  ruleName: string;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affectedPersonnel: string[];
  date?: string;
}

export interface OptimizationGain {
  fairnessImprovement: number;
  fatigueReduction: number;
  coverageImprovement: number;
  violationReduction: number;
  overallScoreImprovement: number;
}

export interface SolverPerformanceReport {
  testSuite: string;
  executedAt: Date;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  passRate: number;
  results: SimulationResult[];
  aggregateMetrics: AggregateMetrics;
  productionReadinessScore: number;
  recommendations: string[];
}

export interface AggregateMetrics {
  averageFairnessScore: number;
  averageFatigueScore: number;
  averageCoveragePercent: number;
  averageConstraintSatisfaction: number;
  averageOptimizationGain: number;
  worstCaseScenario: string;
  bestCaseScenario: string;
  constraintSatisfactionRate: number;
  nightShiftVarianceAverage: number;
}

@Injectable({ providedIn: 'root' })
export class SolverValidationService {
  constructor(
    private constraintSolver: ConstraintSolverService,
    private rebalanceEngine: RebalanceEngineService,
    private recommendationEngine: RecommendationEngineService,
    private fatigueEngine: FatigueEngineService,
  ) {}

  getTestScenarios(): TestScenario[] {
    return [
      this.createNormalWeekScenario(),
      this.createStaffShortageScenario(),
      this.createBayramWeekScenario(),
      this.createDeviceFailureScenario(),
      this.createSickLeavesScenario(),
      this.createHighDemandScenario(),
    ];
  }

  private createNormalWeekScenario(): TestScenario {
    return {
      id: 'normal-week',
      name: 'Normal Week',
      description: 'Full staff, standard operations',
      type: 'normal_week',
      initialConditions: {},
      expectedOutcomes: {
        minFairnessScore: 80,
        maxFatigueIncrease: 5,
        minCoveragePercent: 95,
        maxConstraintViolations: 0,
      },
      stressLevel: 'low',
    };
  }

  private createStaffShortageScenario(): TestScenario {
    return {
      id: 'staff-shortage',
      name: 'Staff Shortage',
      description: '20% of staff unavailable',
      type: 'staff_shortage',
      initialConditions: {
        unavailablePersonnel: [],
      },
      expectedOutcomes: {
        minFairnessScore: 70,
        maxFatigueIncrease: 15,
        minCoveragePercent: 90,
        maxConstraintViolations: 2,
      },
      stressLevel: 'medium',
    };
  }

  private createBayramWeekScenario(): TestScenario {
    return {
      id: 'bayram-week',
      name: 'Bayram Week',
      description: 'Official holiday load balancing',
      type: 'bayram_week',
      initialConditions: {
        holidays: ['2026-04-23', '2026-04-24', '2026-04-25'],
      },
      expectedOutcomes: {
        minFairnessScore: 75,
        maxFatigueIncrease: 10,
        minCoveragePercent: 85,
        maxConstraintViolations: 1,
      },
      stressLevel: 'medium',
    };
  }

  private createDeviceFailureScenario(): TestScenario {
    return {
      id: 'device-failure',
      name: 'Emergency Device Failure',
      description: 'MR device offline, rebalancing required',
      type: 'device_failure',
      initialConditions: {
        unavailableDevices: ['mr-device-1'],
      },
      expectedOutcomes: {
        minFairnessScore: 70,
        maxFatigueIncrease: 12,
        minCoveragePercent: 88,
        maxConstraintViolations: 2,
      },
      stressLevel: 'high',
    };
  }

  private createSickLeavesScenario(): TestScenario {
    return {
      id: 'sick-leaves',
      name: 'Consecutive Sick Leaves',
      description: '3 technicians unavailable for a week',
      type: 'sick_leaves',
      initialConditions: {
        unavailablePersonnel: ['tech-1', 'tech-2', 'tech-3'],
      },
      expectedOutcomes: {
        minFairnessScore: 65,
        maxFatigueIncrease: 20,
        minCoveragePercent: 85,
        maxConstraintViolations: 3,
      },
      stressLevel: 'high',
    };
  }

  private createHighDemandScenario(): TestScenario {
    return {
      id: 'high-demand',
      name: 'High-demand CT Weekend',
      description: 'Emergency cases spike on weekend',
      type: 'high_demand',
      initialConditions: {
        additionalDemands: [
          { date: '2026-05-02', deviceId: 'bt-device-1', shiftType: ShiftTypeEnum.DAY },
          { date: '2026-05-02', deviceId: 'bt-device-2', shiftType: ShiftTypeEnum.DAY },
          { date: '2026-05-03', deviceId: 'bt-device-1', shiftType: ShiftTypeEnum.NIGHT },
        ],
      },
      expectedOutcomes: {
        minFairnessScore: 70,
        maxFatigueIncrease: 15,
        minCoveragePercent: 90,
        maxConstraintViolations: 2,
      },
      stressLevel: 'critical',
    };
  }

  async runScenario(
    scenario: TestScenario,
    personnel: Personnel[],
    devices: Device[],
  ): Promise<SimulationResult> {
    const startTime = performance.now();

    const modifiedPersonnel = this.applyPersonnelConstraints(
      personnel,
      scenario.initialConditions.unavailablePersonnel,
    );

    const modifiedDevices = this.applyDeviceConstraints(
      devices,
      scenario.initialConditions.unavailableDevices,
    );

    const schedule = this.generateTestSchedule(modifiedPersonnel, modifiedDevices, scenario);

    const beforeMetrics = this.calculateMetrics(schedule, modifiedPersonnel);
    const beforeViolations = this.detectViolations(schedule, modifiedPersonnel, scenario);

    const solverResult = this.constraintSolver.solve(schedule, modifiedPersonnel, modifiedDevices);

    const afterMetrics = this.calculateMetrics(solverResult.schedule, modifiedPersonnel);
    const afterViolations = this.detectViolations(
      solverResult.schedule,
      modifiedPersonnel,
      scenario,
    );

    const optimizationGain = this.calculateOptimizationGain(
      beforeMetrics,
      afterMetrics,
      beforeViolations.length,
      afterViolations.length,
    );

    const passed = this.validateResults(afterMetrics, scenario.expectedOutcomes, afterViolations);

    return {
      scenario,
      before: beforeMetrics,
      after: afterMetrics,
      score: this.calculateResultScore(afterMetrics, scenario.expectedOutcomes),
      passed,
      violations: afterViolations,
      optimizationGain,
      executionTime: performance.now() - startTime,
      timestamp: new Date(),
    };
  }

  async runFullTestSuite(
    personnel: Personnel[],
    devices: Device[],
  ): Promise<SolverPerformanceReport> {
    const scenarios = this.getTestScenarios();
    const results: SimulationResult[] = [];

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario, personnel, devices);
      results.push(result);
    }

    return this.generatePerformanceReport(results);
  }

  private applyPersonnelConstraints(
    personnel: Personnel[],
    unavailableIds?: string[],
  ): Personnel[] {
    if (!unavailableIds || unavailableIds.length === 0) {
      return [...personnel];
    }

    return personnel.map((p) => ({
      ...p,
      isActive: unavailableIds.includes(p.id) ? false : p.isActive,
    }));
  }

  private applyDeviceConstraints(devices: Device[], unavailableIds?: string[]): Device[] {
    if (!unavailableIds || unavailableIds.length === 0) {
      return [...devices];
    }

    return devices.filter((d) => !unavailableIds.includes(d.id));
  }

  private generateTestSchedule(
    personnel: Personnel[],
    devices: Device[],
    scenario: TestScenario,
  ): Schedule {
    const assignments: ShiftAssignment[] = [];
    const startDate = new Date('2026-05-01');
    const endDate = new Date('2026-05-07');

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();

      if (scenario.type === 'bayram_week') {
        if (scenario.initialConditions.holidays?.includes(dateStr)) {
          continue;
        }
      }

      if (scenario.type === 'normal_week' && (dayOfWeek === 0 || dayOfWeek === 6)) {
        continue;
      }

      const unitDevices = devices.filter((dev) => dev.unit === 'mr');

      for (const device of unitDevices) {
        if (!this.isWorkDay(device.workDays, dayOfWeek)) continue;

        const shiftTypes =
          device.mode === DeviceModeEnum.POLYCLINIC
            ? [ShiftTypeEnum.DAY]
            : [ShiftTypeEnum.DAY, ShiftTypeEnum.NIGHT];

        for (const shiftType of shiftTypes) {
          const availablePersonnel = personnel.filter((p) => p.isActive && p.unit === 'mr');

          if (availablePersonnel.length === 0) continue;

          const selected =
            availablePersonnel[Math.floor(Math.random() * availablePersonnel.length)];

          assignments.push({
            id: `test-${dateStr}-${device.id}-${shiftType}`,
            deviceId: device.id,
            personnelId: selected.id,
            date: dateStr,
            shiftType,
            startTime: '08:00',
            endTime: shiftType === 'night' ? '08:00' : '20:00',
            isConfirmed: false,
          });
        }
      }
    }

    return {
      id: `schedule-${scenario.id}`,
      unit: 'mr' as UnitType,
      month: 5,
      year: 2026,
      assignments,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
    };
  }

  private isWorkDay(workDays: number[], dayOfWeek: number): boolean {
    return workDays.includes(dayOfWeek);
  }

  private calculateMetrics(schedule: Schedule, personnel: Personnel[]): SimulationMetrics {
    const score = this.rebalanceEngine.calculateScore(schedule, personnel);

    const nightAssignments = schedule.assignments.filter((a) => a.shiftType === 'night');
    const weekendAssignments = schedule.assignments.filter((a) => {
      const date = new Date(a.date);
      const day = date.getDay();
      return day === 0 || day === 6;
    });

    const nightDistribution = this.calculateDistributionVariance(
      nightAssignments.map((a) => a.personnelId),
    );

    const weekendDistribution = this.calculateDistributionVariance(
      weekendAssignments.map((a) => a.personnelId),
    );

    const restHours = this.calculateAverageRestHours(schedule);
    const consecutiveNightRisk = this.calculateConsecutiveNightRisk(schedule);

    return {
      fairnessScore: score.fairness,
      fatigueScore: score.fatigueSafety,
      coveragePercent: score.coverage,
      constraintViolations: this.countViolations(schedule),
      nightDistributionVariance: nightDistribution,
      weekendDistributionVariance: weekendDistribution,
      consecutiveNightRisk,
      averageRestHours: restHours,
    };
  }

  private calculateDistributionVariance(personnelIds: string[]): number {
    if (personnelIds.length === 0) return 0;

    const counts = new Map<string, number>();
    for (const id of personnelIds) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }

    const values = Array.from(counts.values());
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;

    return Math.sqrt(variance);
  }

  private calculateAverageRestHours(schedule: Schedule): number {
    const byPersonnel = new Map<string, ShiftAssignment[]>();

    for (const assignment of schedule.assignments) {
      const list = byPersonnel.get(assignment.personnelId) || [];
      list.push(assignment);
      byPersonnel.set(assignment.personnelId, list);
    }

    let totalRestHours = 0;
    let restCount = 0;

    for (const [, assignments] of byPersonnel) {
      const sorted = assignments.sort((a, b) => a.date.localeCompare(b.date));

      for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const hoursBetween = this.calculateHoursBetween(prev, curr);

        if (hoursBetween > 0) {
          totalRestHours += hoursBetween;
          restCount++;
        }
      }
    }

    return restCount > 0 ? totalRestHours / restCount : 24;
  }

  private calculateHoursBetween(prev: ShiftAssignment, curr: ShiftAssignment): number {
    const prevEndHour = prev.endTime.includes(':') ? parseInt(prev.endTime.split(':')[0]) : 0;
    const currStartHour = curr.startTime.includes(':') ? parseInt(curr.startTime.split(':')[0]) : 8;

    const prevDate = new Date(prev.date);
    const currDate = new Date(curr.date);
    const daysDiff = Math.round((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 0) {
      return currStartHour - prevEndHour;
    }

    return 24 - prevEndHour + currStartHour + (daysDiff - 1) * 24;
  }

  private calculateConsecutiveNightRisk(schedule: Schedule): number {
    const nightAssignments = schedule.assignments
      .filter((a) => a.shiftType === 'night')
      .sort((a, b) => a.date.localeCompare(b.date));

    let riskCount = 0;
    let consecutiveCount = 1;

    for (let i = 1; i < nightAssignments.length; i++) {
      const prev = new Date(nightAssignments[i - 1].date);
      const curr = new Date(nightAssignments[i].date);
      const daysDiff = Math.round((curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24));

      if (daysDiff === 1) {
        consecutiveCount++;
        if (consecutiveCount >= 3) {
          riskCount += consecutiveCount - 2;
        }
      } else {
        consecutiveCount = 1;
      }
    }

    return riskCount;
  }

  private detectViolations(
    schedule: Schedule,
    personnel: Personnel[],
    scenario: TestScenario,
  ): ViolationReport[] {
    const violations: ViolationReport[] = [];

    const doubleAssignment = this.detectDoubleAssignment(schedule);
    if (doubleAssignment.length > 0) {
      violations.push(...doubleAssignment);
    }

    const restViolations = this.detectRestViolations(schedule);
    if (restViolations.length > 0) {
      violations.push(...restViolations);
    }

    const coverageGaps = this.detectCoverageGaps(schedule);
    if (coverageGaps.length > 0) {
      violations.push(...coverageGaps);
    }

    return violations;
  }

  private detectDoubleAssignment(schedule: Schedule): ViolationReport[] {
    const violations: ViolationReport[] = [];
    const seen = new Map<string, string[]>();

    for (const assignment of schedule.assignments) {
      const key = `${assignment.personnelId}-${assignment.date}`;
      const existing = seen.get(key) || [];

      if (existing.length > 0) {
        violations.push({
          ruleId: 'WRK-005',
          ruleName: 'No Double Shift',
          description: `${assignment.personnelId} aynı günde birden fazla vardiyada atandı`,
          severity: 'critical',
          affectedPersonnel: [assignment.personnelId],
          date: assignment.date,
        });
      }

      seen.set(key, [...existing, assignment.id]);
    }

    return violations;
  }

  private detectRestViolations(schedule: Schedule): ViolationReport[] {
    const violations: ViolationReport[] = [];
    const byPersonnel = new Map<string, ShiftAssignment[]>();

    for (const assignment of schedule.assignments) {
      const list = byPersonnel.get(assignment.personnelId) || [];
      list.push(assignment);
      byPersonnel.set(assignment.personnelId, list);
    }

    for (const [personnelId, assignments] of byPersonnel) {
      const sorted = assignments.sort((a, b) => a.date.localeCompare(b.date));

      for (let i = 1; i < sorted.length; i++) {
        const restHours = this.calculateHoursBetween(sorted[i - 1], sorted[i]);

        if (restHours < 11) {
          violations.push({
            ruleId: 'WRK-003',
            ruleName: 'Minimum 11h Rest',
            description: `${personnelId} için yetersiz dinlenme süresi (${restHours.toFixed(1)} saat)`,
            severity: 'critical',
            affectedPersonnel: [personnelId],
            date: sorted[i].date,
          });
        }
      }
    }

    return violations;
  }

  private detectCoverageGaps(schedule: Schedule): ViolationReport[] {
    const violations: ViolationReport[] = [];

    for (const assignment of schedule.assignments) {
      if (!assignment.personnelId || assignment.personnelId === 'unassigned') {
        violations.push({
          ruleId: 'COVERAGE-001',
          ruleName: 'Device Coverage',
          description: `${assignment.deviceId} için ${assignment.date} tarihinde personel ataması yok`,
          severity: 'high',
          affectedPersonnel: [],
          date: assignment.date,
        });
      }
    }

    return violations;
  }

  private countViolations(schedule: Schedule): number {
    const byPersonnel = new Map<string, ShiftAssignment[]>();

    for (const assignment of schedule.assignments) {
      const list = byPersonnel.get(assignment.personnelId) || [];
      list.push(assignment);
      byPersonnel.set(assignment.personnelId, list);
    }

    let count = 0;

    for (const [, assignments] of byPersonnel) {
      const sorted = assignments.sort((a, b) => a.date.localeCompare(b.date));

      for (let i = 1; i < sorted.length; i++) {
        const restHours = this.calculateHoursBetween(sorted[i - 1], sorted[i]);
        if (restHours < 11) count++;
      }

      for (let i = 1; i < sorted.length; i++) {
        if (
          sorted[i - 1].date === sorted[i].date &&
          sorted[i - 1].personnelId === sorted[i].personnelId
        ) {
          count++;
        }
      }
    }

    return count;
  }

  private calculateOptimizationGain(
    before: SimulationMetrics,
    after: SimulationMetrics,
    beforeViolations: number,
    afterViolations: number,
  ): OptimizationGain {
    return {
      fairnessImprovement: after.fairnessScore - before.fairnessScore,
      fatigueReduction: before.fatigueScore - after.fatigueScore,
      coverageImprovement: after.coveragePercent - before.coveragePercent,
      violationReduction: beforeViolations - afterViolations,
      overallScoreImprovement:
        (after.fairnessScore - before.fairnessScore) * 0.35 +
        (before.fatigueScore - after.fatigueScore) * 0.35 +
        (after.coveragePercent - before.coveragePercent) * 0.2,
    };
  }

  private validateResults(
    metrics: SimulationMetrics,
    expected: ExpectedOutcomes,
    violations: ViolationReport[],
  ): boolean {
    if (metrics.fairnessScore < expected.minFairnessScore) return false;
    if (metrics.coveragePercent < expected.minCoveragePercent) return false;
    if (violations.filter((v) => v.severity === 'critical').length > 0) return false;

    return true;
  }

  private calculateResultScore(metrics: SimulationMetrics, expected: ExpectedOutcomes): number {
    const fairnessScore = Math.min(metrics.fairnessScore / expected.minFairnessScore, 1) * 25;
    const coverageScore = Math.min(metrics.coveragePercent / expected.minCoveragePercent, 1) * 25;
    const fatigueScore = Math.max(0, 25 - metrics.consecutiveNightRisk / 2);
    const restScore = Math.min(metrics.averageRestHours / 11, 1) * 25;

    return fairnessScore + coverageScore + fatigueScore + restScore;
  }

  private generatePerformanceReport(results: SimulationResult[]): SolverPerformanceReport {
    const passedScenarios = results.filter((r) => r.passed).length;
    const failedScenarios = results.length - passedScenarios;
    const passRate = (passedScenarios / results.length) * 100;

    const aggregateMetrics: AggregateMetrics = {
      averageFairnessScore:
        results.reduce((sum, r) => sum + r.after.fairnessScore, 0) / results.length,
      averageFatigueScore:
        results.reduce((sum, r) => sum + r.after.fatigueScore, 0) / results.length,
      averageCoveragePercent:
        results.reduce((sum, r) => sum + r.after.coveragePercent, 0) / results.length,
      averageConstraintSatisfaction:
        results.reduce(
          (sum, r) =>
            sum +
            Math.max(0, 100 - r.violations.filter((v) => v.severity === 'critical').length * 100),
          0,
        ) / results.length,
      averageOptimizationGain:
        results.reduce((sum, r) => sum + r.optimizationGain.overallScoreImprovement, 0) /
        results.length,
      worstCaseScenario: this.findWorstCaseScenario(results)?.scenario.name || 'N/A',
      bestCaseScenario: this.findBestCaseScenario(results)?.scenario.name || 'N/A',
      constraintSatisfactionRate: this.calculateConstraintSatisfactionRate(results),
      nightShiftVarianceAverage:
        results.reduce((sum, r) => sum + r.after.nightDistributionVariance, 0) / results.length,
    };

    const productionReadinessScore = this.calculateProductionReadinessScore(
      aggregateMetrics,
      passRate,
    );

    const recommendations = this.generateRecommendations(
      aggregateMetrics,
      results,
      productionReadinessScore,
    );

    return {
      testSuite: 'VardiyaOS Scheduling Solver Validation Suite',
      executedAt: new Date(),
      totalScenarios: results.length,
      passedScenarios,
      failedScenarios,
      passRate,
      results,
      aggregateMetrics,
      productionReadinessScore,
      recommendations,
    };
  }

  private findWorstCaseScenario(results: SimulationResult[]): SimulationResult | null {
    return results.sort((a, b) => a.score - b.score)[0] || null;
  }

  private findBestCaseScenario(results: SimulationResult[]): SimulationResult | null {
    return results.sort((a, b) => b.score - a.score)[0] || null;
  }

  private calculateConstraintSatisfactionRate(results: SimulationResult[]): number {
    const totalCriticalViolations = results.reduce(
      (sum, r) => sum + r.violations.filter((v) => v.severity === 'critical').length,
      0,
    );

    const maxPossibleViolations = results.length * 5;
    return Math.max(
      0,
      ((maxPossibleViolations - totalCriticalViolations) / maxPossibleViolations) * 100,
    );
  }

  private calculateProductionReadinessScore(metrics: AggregateMetrics, passRate: number): number {
    const constraintScore =
      metrics.constraintSatisfactionRate >= 95
        ? 30
        : metrics.constraintSatisfactionRate >= 90
          ? 20
          : 10;
    const fairnessScore =
      metrics.averageFairnessScore >= 80 ? 25 : metrics.averageFairnessScore >= 70 ? 15 : 5;
    const fatigueScore =
      metrics.averageFatigueScore >= 80 ? 20 : metrics.averageFatigueScore >= 70 ? 15 : 10;
    const varianceScore =
      metrics.nightShiftVarianceAverage < 0.5 ? 15 : metrics.nightShiftVarianceAverage < 1 ? 10 : 5;
    const passRateScore = passRate >= 100 ? 10 : passRate >= 80 ? 7 : passRate >= 60 ? 4 : 0;

    return constraintScore + fairnessScore + fatigueScore + varianceScore + passRateScore;
  }

  private generateRecommendations(
    metrics: AggregateMetrics,
    results: SimulationResult[],
    readinessScore: number,
  ): string[] {
    const recommendations: string[] = [];

    if (metrics.constraintSatisfactionRate < 95) {
      recommendations.push(
        'Constraint satisfaction rate düşük. Kural ihlallerini azaltmak için ek optimizasyon gerekli.',
      );
    }

    if (metrics.averageFatigueScore < 70) {
      recommendations.push(
        'Fatigue skoru kritik seviyede. Dinlenme süreleri ve gece vardiyası dağılımı gözden geçirilmeli.',
      );
    }

    if (metrics.nightShiftVarianceAverage > 1) {
      recommendations.push(
        'Gece vardiyası dağılımı dengesiz. Personel arasında eşit dağılım sağlanmalı.',
      );
    }

    if (readinessScore < 80) {
      recommendations.push(
        'Üretim öncesi iyileştirmeler gerekli. Kritik senaryolar üzerinde ek test yapılmalı.',
      );
    }

    const criticalScenarios = results.filter(
      (r) => r.scenario.stressLevel === 'critical' && !r.passed,
    );
    if (criticalScenarios.length > 0) {
      recommendations.push(
        `Kritik stres senaryolarında ${criticalScenarios.length} başarısızlık tespit edildi. Bu senaryolar öncelikli olarak ele alınmalı.`,
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'Sistem üretim kullanımı için hazır. Tüm validasyon kriterleri karşılandı.',
      );
    }

    return recommendations;
  }

  printReport(report: SolverPerformanceReport): void {}

  private getStressIcon(level: string): string {
    switch (level) {
      case 'low':
        return '🟢';
      case 'medium':
        return '🟡';
      case 'high':
        return '🟠';
      case 'critical':
        return '🔴';
      default:
        return '⚪';
    }
  }

  private wrapText(text: string, maxLength: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      if ((currentLine + ' ' + word).length > maxLength) {
        if (currentLine.length > 0) {
          lines.push(currentLine.trim());
        }
        currentLine = word;
      } else {
        currentLine += (currentLine.length > 0 ? ' ' : '') + word;
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine.trim());
    }

    return lines;
  }
}
