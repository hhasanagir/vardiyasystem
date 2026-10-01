import type { ConflictDTO } from './conflict.models';

export interface ValidationResult {
  valid: boolean;
  hardViolations: HardViolationSummary;
  softViolations: SoftViolationSummary;
  warnings: string[];
  coverage: CoverageMetrics;
  fatigue: FatigueMetrics;
  fairness: FairnessMetricsResult;
  workload: WorkloadMetrics;
  score: ScheduleQualityScore;
  validatedAt: string;
}

export interface HardViolationSummary {
  total: number;
  byCode: Record<string, number>;
  conflicts: ConflictDTO[];
}

export interface SoftViolationSummary {
  total: number;
  byCode: Record<string, number>;
  warnings: ConflictDTO[];
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

export interface FairnessMetricsResult {
  overallScore: number;
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetail[];
}

export interface FairnessDetail {
  personnelId: string;
  personnelName: string;
  nightCount: number;
  weekendCount: number;
  holidayCount: number;
  totalHours: number;
  score: number;
}

export interface WorkloadMetrics {
  avgHoursPerPerson: number;
  maxHoursPerPerson: number;
  minHoursPerPerson: number;
  stdDeviation: number;
  balancePercent: number;
  byPersonnel: Record<string, { totalHours: number; assignments: number }>;
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
