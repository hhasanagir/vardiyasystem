export type GenerationAlgorithm =
  | 'greedy'
  | 'backtracking'
  | 'heuristic'
  | 'constraint-propagation'
  | 'optimization'
  | 'randomized';

export interface GenerationConfiguration {
  algorithm: GenerationAlgorithm;
  seed: number;
  maxIterations: number;
  fairnessMode: 'balanced' | 'night-focused' | 'weekend-focused';
  allowOvertime: boolean;
  maxConsecutiveDays: number;
  minRestHours: number;
  version: string;
}

export interface GenerationInput {
  unitId: string;
  month: number;
  year: number;
  configuration?: Partial<GenerationConfiguration>;
}

export interface GenerationResult {
  scheduleId: string;
  totalAssignments: number;
  hardViolations: number;
  warnings: number;
  coverage: number;
  fairness: number;
  score: number;
  generationTime: number;
  algorithm: GenerationAlgorithm;
}

export interface GenerationPreview {
  assignments: import('./schedule.models').AssignmentDTO[];
  conflicts: import('./conflict.models').ConflictDTO[];
  validation: import('./validation.models').ValidationResult;
  fairness: import('./fairness.models').FairnessResult;
}
