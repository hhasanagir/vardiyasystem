import { AssignmentCollection } from '../entities/assignment-collection';
import { PersonnelId } from '../value-objects/personnel-id.value-object';

export interface SchedulingProblemPersonnel {
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
}

export interface SchedulingProblemDevice {
  id: string;
  code: string;
  name: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
}

export interface SchedulingProblemShiftDef {
  deviceId: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  personnelType: string;
}

export interface SchedulingProblemConfig {
  fairnessMode: 'balanced' | 'seniority' | 'skill';
  maxOvertime: number;
  includeWeekends: boolean;
  includeNightShifts: boolean;
  minRestHours: number;
  maxConsecutiveDays: number;
  maxConsecutiveNights: number;
}

export interface SchedulingProblem {
  scheduleId: string;
  unitId: string;
  unitType: string;
  serviceLine: string;
  year: number;
  month: number;
  personnel: SchedulingProblemPersonnel[];
  devices: SchedulingProblemDevice[];
  shiftDefinitions: SchedulingProblemShiftDef[];
  existingAssignments: AssignmentCollection;
  holidays: Set<string>;
  configuration: SchedulingProblemConfig;
}
