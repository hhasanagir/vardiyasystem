export type ViolationSeverity = 'INFO' | 'WARNING' | 'BLOCKING';

export type ViolationRule =
  | 'PERSONNEL_NOT_FOUND'
  | 'DEVICE_REQUIRED'
  | 'DEVICE_BOOKED'
  | 'PERSON_DEVICE_NOT_ALLOWED'
  | 'PERSON_FIELDS_REQUIRED'
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
  | 'REST_RULE_VIOLATION';

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

export interface AssignmentValidationResult {
  violations: AssignmentViolation[];
  hasBlocking: boolean;
  hasOverridable: boolean;
}

export interface ConflictResponseBody {
  statusCode: 409;
  message: string;
  error: string;
  violations: AssignmentViolation[];
  hasBlocking: boolean;
  canOverride: boolean;
}
