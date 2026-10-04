export const UnitTypeEnum = {
  MR: 'mr',
  BT: 'bt',
  RONTGEN: 'rontgen',
  NUKLEER: 'nukleer',
  ONKOLOJI: 'onkoloji',
  SUPERVIZOR: 'supervizor',
} as const;
export type UnitType = (typeof UnitTypeEnum)[keyof typeof UnitTypeEnum];

export const ShiftTypeEnum = {
  DAY: 'day',
  EVENING: 'evening',
  NIGHT: 'night',
  MORNING: 'morning',
  OFF: 'off',
  LEAVE: 'leave',
  SICK: 'sick',
  TRAINING: 'training',
  BACKUP: 'backup',
} as const;
export type ShiftType = (typeof ShiftTypeEnum)[keyof typeof ShiftTypeEnum];

export function normalizeShiftType(type: string): ShiftType {
  const lower = type.toLowerCase();
  if (lower.includes('gündüz') || lower.includes('gunduz') || lower === 'day')
    return ShiftTypeEnum.DAY;
  if (lower.includes('akşam') || lower.includes('aksam') || lower === 'evening')
    return ShiftTypeEnum.EVENING;
  if (lower.includes('gece') || lower === 'night') return ShiftTypeEnum.NIGHT;
  if (lower.includes('sabah') || lower === 'morning') return ShiftTypeEnum.MORNING;
  if (lower.includes('izin') || lower === 'off') return ShiftTypeEnum.OFF;
  if (lower.includes('rapor') || lower === 'leave') return ShiftTypeEnum.LEAVE;
  if (lower.includes('hasta') || lower === 'sick') return ShiftTypeEnum.SICK;
  if (lower.includes('eğitim') || lower.includes('egitim') || lower === 'training')
    return ShiftTypeEnum.TRAINING;
  if (lower.includes('yedek') || lower === 'backup') return ShiftTypeEnum.BACKUP;
  return ShiftTypeEnum.DAY;
}

export function getShiftTypeLabel(type: ShiftType | string): string {
  const map: Record<string, string> = {
    day: 'Gündüz',
    evening: 'Akşam',
    night: 'Gece',
    morning: 'Sabah',
    off: 'İzin (Off)',
    leave: 'Raporlu İzin',
    sick: 'Hasta',
    training: 'Eğitim',
    backup: 'Yedek Süpervizör',
  };
  return map[type] || type;
}

export function getShiftTypeColor(type: ShiftType | string): string {
  const map: Record<string, string> = {
    day: '#fbbf24',
    evening: '#f97316',
    night: '#6366f1',
    morning: '#22d3ee',
    off: '#94a3b8',
    leave: '#a78bfa',
    sick: '#f87171',
    training: '#34d399',
    backup: '#8b5cf6',
  };
  return map[type] || '#64748b';
}

export const DeviceModeEnum = {
  VARDIYA: 'vardiya',
  POLYCLINIC: 'polyclinic',
} as const;
export type DeviceMode = (typeof DeviceModeEnum)[keyof typeof DeviceModeEnum];

export const ScheduleStatusEnum = {
  DRAFT: 'draft',
  UNDER_REVIEW: 'under_review',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  ARCHIVED: 'archived',
  REJECTED: 'rejected',
} as const;
export type ScheduleStatus = (typeof ScheduleStatusEnum)[keyof typeof ScheduleStatusEnum];

export function isScheduleEditable(status: ScheduleStatus): boolean {
  return status === ScheduleStatusEnum.DRAFT || status === ScheduleStatusEnum.UNDER_REVIEW;
}

export function isSchedulePublished(status: ScheduleStatus): boolean {
  return status === ScheduleStatusEnum.PUBLISHED || status === ScheduleStatusEnum.ARCHIVED;
}

export function normalizeScheduleStatus(status: string): ScheduleStatus {
  const normalized = status.toLowerCase() as ScheduleStatus;
  const validStatuses: ScheduleStatus[] = [
    'draft',
    'under_review',
    'approved',
    'published',
    'archived',
    'rejected',
  ];
  return validStatuses.includes(normalized) ? normalized : 'draft';
}

export const GenerationStatusEnum = {
  IDLE: 'idle',
  GENERATING: 'generating',
  OPTIMIZING: 'optimizing',
  SAVING: 'saving',
  ERROR: 'error',
} as const;
export type GenerationStatus = (typeof GenerationStatusEnum)[keyof typeof GenerationStatusEnum];

export const ConflictTypeEnum = {
  REST_VIOLATION: 'rest_violation',
  DOUBLE_ASSIGNMENT: 'double_assignment',
  SKILL_GAP: 'skill_gap',
  COVERAGE_GAP: 'coverage_gap',
  LEAVE_CONFLICT: 'leave_conflict',
} as const;
export type ConflictType = (typeof ConflictTypeEnum)[keyof typeof ConflictTypeEnum];

export const ConstraintTypeEnum = {
  MIN_REST: 'min_rest',
  NO_NIGHT_TO_DAY: 'no_night_to_day',
  MAX_WEEKLY_SHIFTS: 'max_weekly_shifts',
  LEAVE_BLOCK: 'leave_block',
  SKILL_COMPATIBILITY: 'skill_compatibility',
  DEVICE_COVERAGE: 'device_coverage',
  DOUBLE_ASSIGNMENT: 'double_assignment',
} as const;
export type ConstraintType = (typeof ConstraintTypeEnum)[keyof typeof ConstraintTypeEnum];

export const ConstraintSeverityEnum = {
  ERROR: 'error',
  WARNING: 'warning',
} as const;
export type ConstraintSeverity =
  (typeof ConstraintSeverityEnum)[keyof typeof ConstraintSeverityEnum];

export const ConflictSeverityEnum = {
  CRITICAL: 'critical',
  HIGH: 'high',
  MEDIUM: 'medium',
  LOW: 'low',
} as const;
export type ConflictSeverity = (typeof ConflictSeverityEnum)[keyof typeof ConflictSeverityEnum];

export const HolidayTypeEnum = {
  NATIONAL: 'national',
  RELIGIOUS: 'religious',
} as const;
export type HolidayType = (typeof HolidayTypeEnum)[keyof typeof HolidayTypeEnum];

export const PersonnelTypeEnum = {
  TECHNICIAN: 'technician',
  ASSISTANT_TECHNICIAN: 'assistant_technician',
} as const;
export type PersonnelType = (typeof PersonnelTypeEnum)[keyof typeof PersonnelTypeEnum];

export function getPersonnelTypeLabel(type: PersonnelType): string {
  switch (type) {
    case PersonnelTypeEnum.ASSISTANT_TECHNICIAN:
      return 'Yardımcı Tekniker';
    case PersonnelTypeEnum.TECHNICIAN:
      return 'Tekniker';
    default:
      return type;
  }
}

export const UserRoleEnum = {
  SYSTEM_ADMIN: 'system_admin',
  HOSPITAL_ADMIN: 'hospital_admin',
  IMAGING_DIRECTOR: 'imaging_director',
  SUPERVISOR: 'supervisor',
  MEDICAL_ENGINEER: 'medical_engineer',
  SENIOR_TECHNICIAN: 'senior_technician',
  TECHNICIAN: 'technician',
  ASSISTANT_TECHNICIAN: 'assistant_technician',
  SECRETARY: 'secretary',
  GUEST: 'guest',
} as const;
export type UserRole = (typeof UserRoleEnum)[keyof typeof UserRoleEnum];

export const SwapRequestStatusEnum = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected',
} as const;
export type SwapRequestStatus = (typeof SwapRequestStatusEnum)[keyof typeof SwapRequestStatusEnum];

export function normalizeSwapRequestStatus(status: string): SwapRequestStatus {
  const normalized = status.toUpperCase() as keyof typeof SwapRequestStatusEnum;
  switch (normalized) {
    case 'PENDING':
      return SwapRequestStatusEnum.PENDING;
    case 'APPROVED':
      return SwapRequestStatusEnum.APPROVED;
    case 'REJECTED':
      return SwapRequestStatusEnum.REJECTED;
    default:
      const lower = status.toLowerCase() as SwapRequestStatus;
      if (['pending', 'approved', 'rejected'].includes(lower)) {
        return lower;
      }
      return SwapRequestStatusEnum.PENDING;
  }
}

export const OrganizationPlanEnum = {
  FREE: 'free',
  BASIC: 'basic',
  PREMIUM: 'premium',
} as const;
export type OrganizationPlan = (typeof OrganizationPlanEnum)[keyof typeof OrganizationPlanEnum];

export const AnalyticsWarningTypeEnum = {
  OVERWORK: 'overwork',
  UNDERWORK: 'underwork',
  IMBALANCE: 'imbalance',
  EMPTY: 'empty',
} as const;
export type AnalyticsWarningType =
  (typeof AnalyticsWarningTypeEnum)[keyof typeof AnalyticsWarningTypeEnum];
