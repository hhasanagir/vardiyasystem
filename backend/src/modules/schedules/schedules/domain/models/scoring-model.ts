import { FairnessResult } from './fairness-engine';
import {
  CoverageMetrics,
  FatigueMetrics,
  WorkloadMetrics,
} from './validation-result';

export interface ScoringInput {
  coverage: CoverageMetrics;
  fairness: FairnessResult;
  workload: WorkloadMetrics;
  fatigue: FatigueMetrics;
  penalties: number;
  configuration?: ScoringConfiguration;
}

export interface ScoringConfiguration {
  coverageWeight: number;
  fairnessWeight: number;
  workloadWeight: number;
  preferenceWeight: number;
  penaltyMultiplier: number;
  version: string;
}

export interface ScoringOutput {
  overall: number;
  coverage: number;
  fairness: number;
  workload: number;
  preference: number;
  penalties: number;
  algorithm: string;
  configurationVersion: string;
}

const DEFAULT_CONFIGURATION: ScoringConfiguration = {
  coverageWeight: 0.35,
  fairnessWeight: 0.3,
  workloadWeight: 0.25,
  preferenceWeight: 0.1,
  penaltyMultiplier: 2.0,
  version: '1.0.0',
};

export class ScoringModel {
  private readonly config: ScoringConfiguration;

  constructor(config?: Partial<ScoringConfiguration>) {
    this.config = { ...DEFAULT_CONFIGURATION, ...config };
  }

  calculate(input: ScoringInput): ScoringOutput {
    const cfg = input.configuration || this.config;

    const coverageScore = input.coverage.coveragePercent;
    const fairnessScore = input.fairness.overallScore;
    const workloadScore = input.workload.balancePercent;
    const preferenceScore = this.calculatePreferenceScore(input.fatigue);

    const weightedSum =
      coverageScore * cfg.coverageWeight +
      fairnessScore * cfg.fairnessWeight +
      workloadScore * cfg.workloadWeight +
      preferenceScore * cfg.preferenceWeight;

    const penaltyTotal = input.penalties * cfg.penaltyMultiplier;
    const overall = Math.max(0, Math.min(100, weightedSum - penaltyTotal));

    return {
      overall: Math.round(overall * 10) / 10,
      coverage: Math.round(coverageScore * 10) / 10,
      fairness: Math.round(fairnessScore * 10) / 10,
      workload: Math.round(workloadScore * 10) / 10,
      preference: Math.round(preferenceScore * 10) / 10,
      penalties: Math.round(penaltyTotal * 10) / 10,
      algorithm: 'weighted-average',
      configurationVersion: cfg.version,
    };
  }

  private calculatePreferenceScore(fatigue: FatigueMetrics): number {
    let score = 100;
    if (fatigue.maxConsecutiveDays > 6)
      score -= (fatigue.maxConsecutiveDays - 6) * 10;
    if (fatigue.minRestHours < 8) score -= (8 - fatigue.minRestHours) * 5;
    if (fatigue.overtimeHours > 0) score -= fatigue.overtimeHours * 2;
    return Math.max(0, Math.min(100, score));
  }

  getConfiguration(): ScoringConfiguration {
    return { ...this.config };
  }
}
