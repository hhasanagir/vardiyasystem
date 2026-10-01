export type ConflictCode =
  | 'PERSON_OVERLAP'
  | 'DEVICE_OVERLAP'
  | 'REST_VIOLATION'
  | 'QUALIFICATION_MISSING'
  | 'LEAVE_CONFLICT'
  | 'AVAILABILITY_CONFLICT'
  | 'COVERAGE_MISSING'
  | 'MAX_WORK_EXCEEDED'
  | 'RULE_VIOLATION'
  | 'OFF_DAY_CONFLICT';

export type ConflictSeverityLevel = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';

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

export interface ConflictDTO {
  id: string;
  code: ConflictCode;
  severity: ConflictSeverityLevel;
  message: string;
  context: ConflictContext;
  isHardConstraint: boolean;
  isOverridable: boolean;
  overrideRequiredRole?: string;
  detectedAt: string;
}

export const CONFLICT_CODE_LABELS: Record<ConflictCode, string> = {
  PERSON_OVERLAP: 'Personel Çakışması',
  DEVICE_OVERLAP: 'Cihaz Çakışması',
  REST_VIOLATION: 'Dinlenme İhlali',
  QUALIFICATION_MISSING: 'Yetersiz Yeterlilik',
  LEAVE_CONFLICT: 'İzin Çakışması',
  AVAILABILITY_CONFLICT: 'Uygunluk Çakışması',
  COVERAGE_MISSING: 'Eksik Kadro',
  MAX_WORK_EXCEEDED: 'Maksimum Çalışma Aşımı',
  RULE_VIOLATION: 'Kural İhlali',
  OFF_DAY_CONFLICT: 'İzin Günü Çakışması',
};

export const CONFLICT_SEVERITY_COLORS: Record<ConflictSeverityLevel, string> = {
  INFO: '#3b82f6',
  WARNING: '#f59e0b',
  ERROR: '#ef4444',
  CRITICAL: '#dc2626',
};

export const CONFLICT_SEVERITY_LABELS: Record<ConflictSeverityLevel, string> = {
  INFO: 'Bilgi',
  WARNING: 'Uyarı',
  ERROR: 'Hata',
  CRITICAL: 'Kritik',
};

export function isHardConflict(severity: ConflictSeverityLevel): boolean {
  return severity === 'ERROR' || severity === 'CRITICAL';
}
