import { Conflict } from '../models/conflict';
import { ConstraintScore } from '../constraints/soft-constraint.interface';

export interface CandidateAssignment {
  personnelId: string;
  personnelName: string;
  personnelType: string;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isPreSeeded?: boolean;
}

export interface CandidateSchedule {
  assignments: CandidateAssignment[];
  isValid: boolean;
  hardConstraintViolations: Conflict[];
  softConstraintScores: ConstraintScore[];
  totalScore: number;
  scoreBreakdown: {
    fairness: number;
    workload: number;
    fatigue: number;
  };
  explanations: string[];
}

export function createEmptyCandidate(): CandidateSchedule {
  return {
    assignments: [],
    isValid: true,
    hardConstraintViolations: [],
    softConstraintScores: [],
    totalScore: 0,
    scoreBreakdown: { fairness: 0, workload: 0, fatigue: 0 },
    explanations: [],
  };
}
