import { CandidateSchedule, CandidateAssignment } from './candidate-schedule';
import { Conflict } from '../models/conflict';
import { ConstraintScore } from '../constraints/soft-constraint.interface';

export interface ScoreComponent {
  rawScore: number;
  weight: number;
  weightedScore: number;
}

export interface OptimizationResult {
  success: boolean;
  strategy: string;
  candidate: CandidateSchedule;
  summary: OptimizationSummary;
  metadata: OptimizationMetadata;
  explanations: string[];
}

export interface OptimizationSummary {
  totalAssignments: number;
  existingAssignments: number;
  newAssignments: number;
  personnelCount: number;
  deviceCount: number;
  hardViolations: number;
  softViolations: number;
  totalScore: number;
  scoreComponents: {
    fairness: ScoreComponent;
    workload: ScoreComponent;
    fatigue: ScoreComponent;
  };
}

export interface OptimizationMetadata {
  executionTimeMs: number;
  candidateGenerationTimeMs: number;
  hardConstraintTimeMs: number;
  softConstraintTimeMs: number;
  scoreAggregationTimeMs: number;
  candidatesGenerated: number;
  validCandidates: number;
  deterministic: boolean;
  seed?: number;
}

export function createOptimizationResult(
  success: boolean,
  strategy: string,
  candidate: CandidateSchedule,
  metadata: OptimizationMetadata,
  explanations: string[] = [],
  existingCount: number = 0,
): OptimizationResult {
  const totalCount = candidate.assignments.length;
  const newCount = Math.max(0, totalCount - existingCount);

  return {
    success,
    strategy,
    candidate,
    summary: {
      totalAssignments: totalCount,
      existingAssignments: existingCount,
      newAssignments: newCount,
      personnelCount: new Set(candidate.assignments.map((a) => a.personnelId))
        .size,
      deviceCount: new Set(candidate.assignments.map((a) => a.deviceId)).size,
      hardViolations: candidate.hardConstraintViolations.length,
      softViolations: candidate.softConstraintScores.filter(
        (s) => s.rawScore < 50,
      ).length,
      totalScore: candidate.totalScore,
      scoreComponents: {
        fairness: extractComponent(
          candidate.softConstraintScores,
          'FAIRNESS',
          candidate.scoreBreakdown.fairness,
        ),
        workload: extractComponent(
          candidate.softConstraintScores,
          'WORKLOAD_BALANCE',
          candidate.scoreBreakdown.workload,
        ),
        fatigue: extractComponent(
          candidate.softConstraintScores,
          'FATIGUE',
          candidate.scoreBreakdown.fatigue,
        ),
      },
    },
    metadata,
    explanations,
  };
}

function extractComponent(
  scores: ConstraintScore[],
  constraintId: string,
  weightedScore: number,
): ScoreComponent {
  const score = scores.find((s) => s.constraintId === constraintId);
  return {
    rawScore: score?.rawScore ?? 0,
    weight: score?.weight ?? 0,
    weightedScore,
  };
}
