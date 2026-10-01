export enum ConflictCode {
  PERSON_OVERLAP = 'PERSON_OVERLAP',
  DEVICE_OVERLAP = 'DEVICE_OVERLAP',
  REST_VIOLATION = 'REST_VIOLATION',
  QUALIFICATION_MISSING = 'QUALIFICATION_MISSING',
  LEAVE_CONFLICT = 'LEAVE_CONFLICT',
  AVAILABILITY_CONFLICT = 'AVAILABILITY_CONFLICT',
  COVERAGE_MISSING = 'COVERAGE_MISSING',
  MAX_WORK_EXCEEDED = 'MAX_WORK_EXCEEDED',
  RULE_VIOLATION = 'RULE_VIOLATION',
  OFF_DAY_CONFLICT = 'OFF_DAY_CONFLICT',
}

export enum ConflictSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL',
}

export interface ConflictContext {
  personnelId?: string;
  personnelName?: string;
  deviceId?: string;
  deviceName?: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  conflictingPersonnelId?: string;
  conflictingPersonnelName?: string;
  conflictingDeviceId?: string;
  conflictingDeviceName?: string;
  conflictingShiftType?: string;
  conflictingStartTime?: string;
  conflictingEndTime?: string;
  unitId?: string;
  unitName?: string;
  restHours?: number;
  minRestHours?: number;
  maxHours?: number;
  actualHours?: number;
  qualificationRequired?: string;
  qualificationHave?: string;
}

export interface Conflict {
  id: string;
  code: ConflictCode;
  severity: ConflictSeverity;
  message: string;
  context: ConflictContext;
  isHardConstraint: boolean;
  isOverridable: boolean;
  overrideRequiredRole?: string;
  detectedAt: Date;
}

export function createConflict(params: {
  code: ConflictCode;
  severity: ConflictSeverity;
  message: string;
  context: ConflictContext;
  isHardConstraint?: boolean;
  isOverridable?: boolean;
  overrideRequiredRole?: string;
}): Conflict {
  return {
    id: `conflict-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    code: params.code,
    severity: params.severity,
    message: params.message,
    context: params.context,
    isHardConstraint: params.isHardConstraint ?? true,
    isOverridable: params.isOverridable ?? false,
    overrideRequiredRole: params.overrideRequiredRole,
    detectedAt: new Date(),
  };
}

export function isHardConflict(conflict: Conflict): boolean {
  return (
    conflict.severity === ConflictSeverity.ERROR ||
    conflict.severity === ConflictSeverity.CRITICAL
  );
}

export function isSoftConflict(conflict: Conflict): boolean {
  return (
    conflict.severity === ConflictSeverity.WARNING ||
    conflict.severity === ConflictSeverity.INFO
  );
}

export function conflictSeverityWeight(severity: ConflictSeverity): number {
  const weights: Record<ConflictSeverity, number> = {
    [ConflictSeverity.INFO]: 1,
    [ConflictSeverity.WARNING]: 3,
    [ConflictSeverity.ERROR]: 7,
    [ConflictSeverity.CRITICAL]: 10,
  };
  return weights[severity];
}

export function conflictCodeLabel(code: ConflictCode): string {
  const labels: Record<ConflictCode, string> = {
    [ConflictCode.PERSON_OVERLAP]: 'Personel Çakışması',
    [ConflictCode.DEVICE_OVERLAP]: 'Cihaz Çakışması',
    [ConflictCode.REST_VIOLATION]: 'Dinlenme İhlali',
    [ConflictCode.QUALIFICATION_MISSING]: 'Yetersiz Yeterlilik',
    [ConflictCode.LEAVE_CONFLICT]: 'İzin Çakışması',
    [ConflictCode.AVAILABILITY_CONFLICT]: 'Uygunluk Çakışması',
    [ConflictCode.COVERAGE_MISSING]: 'Eksik Kadro',
    [ConflictCode.MAX_WORK_EXCEEDED]: 'Maksimum Çalışma Aşımı',
    [ConflictCode.RULE_VIOLATION]: 'Kural İhlali',
    [ConflictCode.OFF_DAY_CONFLICT]: 'İzin Günü Çakışması',
  };
  return labels[code] || code;
}
