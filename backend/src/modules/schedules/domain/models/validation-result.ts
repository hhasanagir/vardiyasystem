import { Conflict, ConflictSeverity } from './conflict';
import { FairnessDetail } from './fairness-engine';

export interface HardViolationSummary {
  total: number;
  byCode: Record<string, number>;
  conflicts: Conflict[];
}

export interface SoftViolationSummary {
  total: number;
  byCode: Record<string, number>;
  warnings: Conflict[];
}

export interface CoverageMetrics {
  totalSlots: number;
  filledSlots: number;
  coveragePercent: number;
  byUnit: Record<string, { total: number; filled: number; percent: number }>;
  uncoveredDates: string[];
}

export interface FatigueMetrics {
  maxConsecutiveDays: number;
  avgRestHours: number;
  minRestHours: number;
  nightShiftsPerPerson: Record<string, number>;
  overtimeHours: number;
  overtimePersonnel: string[];
}

export interface FairnessMetrics {
  overallScore: number;
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetail[];
}

export interface WorkloadMetrics {
  avgHoursPerPerson: number;
  maxHoursPerPerson: number;
  minHoursPerPerson: number;
  stdDeviation: number;
  balancePercent: number;
  byPersonnel: Record<string, { totalHours: number; assignments: number }>;
}

export interface ValidationResult {
  valid: boolean;
  hardViolations: HardViolationSummary;
  softViolations: SoftViolationSummary;
  warnings: string[];
  coverage: CoverageMetrics;
  fatigue: FatigueMetrics;
  fairness: FairnessMetrics;
  workload: WorkloadMetrics;
  score: ScheduleQualityScore;
  validatedAt: Date;
}

export interface ScheduleQualityScore {
  overall: number;
  coverage: number;
  fairness: number;
  workload: number;
  preference: number;
  penalties: number;
  algorithm: string;
  configurationVersion: string;
}

export function createEmptyValidationResult(): ValidationResult {
  return {
    valid: true,
    hardViolations: { total: 0, byCode: {}, conflicts: [] },
    softViolations: { total: 0, byCode: {}, warnings: [] },
    warnings: [],
    coverage: {
      totalSlots: 0,
      filledSlots: 0,
      coveragePercent: 0,
      byUnit: {},
      uncoveredDates: [],
    },
    fatigue: {
      maxConsecutiveDays: 0,
      avgRestHours: 0,
      minRestHours: 0,
      nightShiftsPerPerson: {},
      overtimeHours: 0,
      overtimePersonnel: [],
    },
    fairness: {
      overallScore: 0,
      nightScore: 0,
      weekendScore: 0,
      holidayScore: 0,
      workloadScore: 0,
      details: [],
    },
    workload: {
      avgHoursPerPerson: 0,
      maxHoursPerPerson: 0,
      minHoursPerPerson: 0,
      stdDeviation: 0,
      balancePercent: 0,
      byPersonnel: {},
    },
    score: {
      overall: 0,
      coverage: 0,
      fairness: 0,
      workload: 0,
      preference: 0,
      penalties: 0,
      algorithm: 'unknown',
      configurationVersion: '1.0.0',
    },
    validatedAt: new Date(),
  };
}

export function addHardViolation(
  result: ValidationResult,
  conflict: Conflict,
): void {
  result.hardViolations.total++;
  result.hardViolations.conflicts.push(conflict);
  const count = result.hardViolations.byCode[conflict.code] || 0;
  result.hardViolations.byCode[conflict.code] = count + 1;
  result.valid = false;
}

export function addSoftViolation(
  result: ValidationResult,
  conflict: Conflict,
): void {
  result.softViolations.total++;
  result.softViolations.warnings.push(conflict);
  const count = result.softViolations.byCode[conflict.code] || 0;
  result.softViolations.byCode[conflict.code] = count + 1;
}

export function addWarning(result: ValidationResult, message: string): void {
  result.warnings.push(message);
}

export function finalizeValidation(result: ValidationResult): void {
  result.valid = result.hardViolations.total === 0;
  result.validatedAt = new Date();
}

export function formatScoreReport(result: ValidationResult): string {
  const s = result.score;
  const lines = [
    `Valid: ${result.valid ? 'YES' : 'NO'}`,
    `Hard Violations: ${result.hardViolations.total}`,
    `Warnings: ${result.softViolations.total + result.warnings.length}`,
    '',
    `Coverage: ${result.coverage.coveragePercent.toFixed(1)}%`,
    `Fairness: ${result.fairness.overallScore.toFixed(1)}`,
    `Workload Balance: ${result.workload.balancePercent.toFixed(1)}`,
    `Night Balance: ${result.fairness.nightScore.toFixed(1)}`,
    `Weekend Balance: ${result.fairness.weekendScore.toFixed(1)}`,
    '',
    `Overall Score: ${s.overall.toFixed(1)}`,
  ];
  return lines.join('\n');
}
