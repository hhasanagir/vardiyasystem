/**
 * PHASE 5C.26 P1-A1 — CoverageEngine minimum-staffing TYPES and constants.
 *
 * Single authoritative contract consumed by ScheduleCoverageService (Prisma
 * loader), ScheduleValidationService / SchedulesWorkflowService publish gates,
 * the generator proposal evaluation, and the greedy optimizer hard constraint.
 * Pure data — no I/O, no Date.now, no Math.random; deterministic iteration.
 */

export const COVERAGE_TECHNICIAN_PERSONNEL_TYPE = 'technician';
export const COVERAGE_ASSISTANT_PERSONNEL_TYPE = 'assistant_technician';
export const COVERAGE_SUPERVISOR_PERSONNEL_TYPE = 'supervisor';

export interface CoverageDeviceSpec {
  id: string;
  name: string;
  mode: string;
  workDays: number[];
}

export interface CoverageShiftDefSpec {
  id: string;
  deviceId: string;
  shiftType: string;
  startTime?: string;
  endTime?: string;
  personnelType: string;
  blockId?: string | null;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface CoverageAssignmentInput {
  personnelId: string;
  deviceId: string;
  date: string;
  shiftType: string;
  personnelType: string;
}

export interface CoverageInput {
  year: number;
  month: number;
  includeWeekends: boolean;
  includeNightShifts: boolean;
  devices: CoverageDeviceSpec[];
  shiftDefs: CoverageShiftDefSpec[];
  holidays: Set<string>;
  deviceOffDates?: Set<string>;
  shiftDateOverrides?: Set<string>;
  technicianPersonnelCount: number;
  assistantPersonnelCount: number;
  supervisorPersonnelCount: number;
  assignments: CoverageAssignmentInput[];
  blockedPersonnelDates?: Map<string, Set<string>>;
}

export interface CoverageLine {
  key: string;
  date: string;
  shiftType: string;
  personnelType: string;
  deviceId: string;
  deviceName: string;
  required: number;
  assigned: number;
  shortfall: number;
}

export interface CoverageResult {
  lines: CoverageLine[];
  underCoverage: CoverageLine[];
  requiredSlots: number;
  assignedSlots: number;
  coveragePercent: number;
  allCovered: boolean;
  uncoveredDates: string[];
}