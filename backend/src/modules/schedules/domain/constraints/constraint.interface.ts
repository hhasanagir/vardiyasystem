import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';

export type ViolationSeverity = 'INFO' | 'WARNING' | 'BLOCKING';

export type ViolationRule =
  | 'PERSONNEL_NOT_FOUND'
  | 'DEVICE_REQUIRED'
  | 'DEVICE_BOOKED'
  | 'PERSON_DEVICE_NOT_ALLOWED'
  | 'PERSONNEL_NOT_IN_UNIT'
  | 'PERSONNEL_NOT_IN_GROUP'
  | 'GROUP_NOT_FOUND'
  | 'GROUP_NOT_IN_UNIT'
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_NOT_IN_GROUP'
  | 'TEMPLATE_NOT_IN_UNIT'
  | 'TEMPLATE_SHIFT_MISMATCH'
  | 'GROUP_SLOT_OCCUPIED'
  | 'SAME_SLOT'
  | 'TIME_OVERLAP'
  | 'INACTIVE_PERSONNEL'
  | 'NOT_NIGHT_ELIGIBLE'
  | 'OFF_DAY_CONFLICT'
  | 'REST_RULE_VIOLATION'
  | 'REQUIRED_REST_NOT_MET';

export interface AssignmentViolation {
  rule: ViolationRule;
  severity: ViolationSeverity;
  message: string;
  details?: {
    currentShift?: {
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
    };
    newShift?: {
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
    };
    restHours?: number;
    minRestHours?: number;
    dayOfWeek?: string;
    personnelName?: string;
  };
  isOverrideAllowed: boolean;
}

export interface ConstraintContext {
  assignment: Assignment;
  existingAssignments: AssignmentCollection;
  personnelLookup: PersonnelLookup;
  deviceLookup: DeviceLookup;
  holidays: Set<string>;
  templates: ShiftTemplateLookup;
  groups: GroupLookup;
  now: Date;
}

export interface PersonnelLookup {
  findById(id: string): PersonnelInfo | undefined;
}

export interface PersonnelInfo {
  id: string;
  name: string;
  isActive: boolean;
  employmentStatus: string;
  unitId: string;
  groupId: string | null;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  offDays: number[];
  maxWeeklyHours: number;
}

export interface DeviceLookup {
  findById(id: string): DeviceInfo | undefined;
}

export interface DeviceInfo {
  id: string;
  code: string;
  name: string;
  unitId: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  isActive: boolean;
}

export interface ShiftTemplateLookup {
  findById(id: string): ShiftTemplateInfo | undefined;
}

export interface ShiftTemplateInfo {
  id: string;
  unitId: string;
  personnelGroupId: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface GroupLookup {
  findById(id: string): GroupInfo | undefined;
}

export interface GroupInfo {
  id: string;
  unitId: string;
  name: string;
  code: string;
  isActive: boolean;
}

export interface ConstraintResult {
  passed: boolean;
  violations: AssignmentViolation[];
}

export interface HardConstraint {
  code: ViolationRule;
  description: string;
  evaluate(context: ConstraintContext): ConstraintResult;
}
