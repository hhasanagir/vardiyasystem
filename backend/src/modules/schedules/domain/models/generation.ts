import { Schedule, ScheduleStatus } from '../aggregates/schedule.aggregate';
import { Assignment } from '../entities/assignment.entity';
import { Conflict } from './conflict';
import { ValidationResult } from './validation-result';
import { FairnessResult } from './fairness-engine';

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

export const DEFAULT_GENERATION_CONFIG: GenerationConfiguration = {
  algorithm: 'greedy',
  seed: 42,
  maxIterations: 1000,
  fairnessMode: 'balanced',
  allowOvertime: false,
  maxConsecutiveDays: 6,
  minRestHours: 8,
  version: '1.0.0',
};

export interface ScheduleGenerationResult {
  schedule: Schedule;
  assignments: Assignment[];
  conflicts: Conflict[];
  validation: ValidationResult;
  fairness: FairnessResult;
  score: {
    overall: number;
    coverage: number;
    fairness: number;
    workload: number;
    preference: number;
    penalties: number;
  };
  generationTime: number;
  algorithm: GenerationAlgorithm;
  metadata: GenerationMetadata;
}

export interface GenerationMetadata {
  seed: number;
  totalPersonnel: number;
  totalDevices: number;
  totalDays: number;
  totalSlotsGenerated: number;
  totalConflicts: number;
  totalWarnings: number;
  iterations: number;
  configuration: GenerationConfiguration;
  generatedAt: Date;
}

export interface GenerationInput {
  unitId: string;
  month: number;
  year: number;
  personnel: GenerationPersonnelInfo[];
  devices: GenerationDeviceInfo[];
  holidays: Set<string>;
  configuration?: Partial<GenerationConfiguration>;
}

export interface GenerationPersonnelInfo {
  id: string;
  name: string;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  employmentStatus: string;
  offDays: number[];
  maxWeeklyHours: number;
  isActive: boolean;
  groupId: string | null;
}

export interface GenerationDeviceInfo {
  id: string;
  code: string;
  name: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
  isMaster: boolean;
  isActive: boolean;
}
