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
  /** P2-10 — real seniority from Personnel (used by the seniority tie-break). */
  seniority?: number;
  /** PHASE 5C.25 — authoritative exact-date blocked dates (leave/absence/
   *  unsuitable + weekly offDays resolved with AVAILABLE override). When
   *  present it REPLACES the raw offDays filter (AVAILABLE override honored);
   *  absent falls back to offDays. */
  blockedDates?: string[];
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
  /** PHASE 5C.26 P1-A2 — shift row id, needed for ShiftDateOverride gating. */
  id?: string;
  /** PHASE 5C.26 P1-A2 — shared assistant slot keying. */
  blockId?: string | null;
  /** PHASE 5C.26 P1-A2 — optional-on-weekends assistant defs require an override. */
  optionalOnWeekends?: boolean;
  /** PHASE 5C.26 P1-A2 — optional-on-holidays assistant defs require an override. */
  optionalOnHolidays?: boolean;
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

/** PHASE 5C.26 P1-A2 — production-only coverage context for the optimizer. */
export interface SchedulingCoverageContext {
  shiftDateOverrides?: Set<string>;
  assistantPersonnelCount: number;
  supervisorPersonnelCount: number;
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
  deviceOffDates?: Set<string>;
  configuration: SchedulingProblemConfig;
  /** PHASE 5C.26 P1-A2 — enforces minimum coverage as a hard constraint.
   *  Opt-in so existing optimizer fixtures remain untouched. */
  coverageEnabled?: boolean;
  coverageContext?: SchedulingCoverageContext;
}
