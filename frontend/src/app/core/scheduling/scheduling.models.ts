export type UnitType = 'mr' | 'bt' | 'rontgen' | 'nukleer' | 'onkoloji' | 'supervizor';
export type ShiftType =
  | 'day'
  | 'evening'
  | 'night'
  | 'morning'
  | 'off'
  | 'leave'
  | 'sick'
  | 'training'
  | 'backup';
export type DeviceMode = 'vardiya' | 'polyclinic';

export interface Personnel {
  id: string;
  name: string;
  unit: UnitType;
  skills: string[];
  isActive: boolean;
  seniority: number;
  preferences?: {
    preferredShifts?: ShiftType[];
    preferredDevices?: string[];
    unavailableDates?: string[];
  };
}

export interface Device {
  id: string;
  code: string;
  name: string;
  unit: UnitType;
  mode: DeviceMode;
  isActive: boolean;
  requiredSkills: string[];
  workDays: number[];
  startHour?: number;
  endHour?: number;
}

export interface ShiftAssignment {
  id: string;
  deviceId: string;
  personnelId: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  personnelType?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Schedule {
  id: string;
  unit: UnitType;
  month: number;
  year: number;
  assignments: ShiftAssignment[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
  status: 'draft' | 'published' | 'archived';
}

export interface Constraint {
  type:
    | 'min_rest'
    | 'no_night_to_day'
    | 'max_weekly_shifts'
    | 'leave_block'
    | 'skill_compatibility'
    | 'device_coverage';
  message: string;
  severity: 'error' | 'warning';
  affectedAssignments?: string[];
}

export interface FairnessMetrics {
  nightShiftDistribution: number;
  weekendAssignmentRate: number;
  holidayAssignmentRate: number;
  deviceRotationFairness: number;
  overallScore: number;
}

export interface Conflict {
  id: string;
  type: 'rest_violation' | 'double_assignment' | 'skill_gap' | 'coverage_gap' | 'leave_conflict';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  date?: string;
  personnelId?: string;
  deviceId?: string;
  relatedAssignments?: string[];
}

export interface ScheduleGenerationOptions {
  respectExisting?: boolean;
  prioritizeFairness?: boolean;
  allowOvertime?: boolean;
  fillGaps?: boolean;
  minimizeChanges?: boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: Constraint[];
  warnings: Constraint[];
  score: number;
}

export interface RebalanceResult {
  success: boolean;
  schedule: Schedule;
  changes: {
    added: string[];
    removed: string[];
    moved: Array<{ from: string; to: string; assignmentId: string }>;
  };
  fairnessImprovement: number;
}

export interface HolidayInfo {
  date: string;
  name: string;
  type: 'national' | 'religious';
}

export const CONSTRAINT_LIMITS = {
  MIN_REST_HOURS: 11,
  MAX_WEEKLY_SHIFTS: 6,
  MAX_NIGHT_SHIFTS_WEEKLY: 3,
  MAX_CONSECUTIVE_DAYS: 6,
  MAX_WEEKLY_HOURS: 48,
  MIN_ADVANCE_NOTICE_DAYS: 7,
} as const;

export const SHIFT_TIMES = {
  day: { start: 8, end: 20 },
  evening: { start: 16, end: 24 },
  night: { start: 20, end: 8 },
} as const;

export const UNIT_COLORS = {
  mr: '#3b82f6',
  bt: '#14b8a6',
  rontgen: '#f97316',
  nukleer: '#22c55e',
  onkoloji: '#ec4899',
  supervizor: '#8b5cf6',
} as const;

export const TURKISH_HOLIDAYS_2026: HolidayInfo[] = [
  { date: '2026-01-01', name: 'Yılbaşı', type: 'national' },
  { date: '2026-04-23', name: 'Ulusal Egemenlik ve Çocuk Bayramı', type: 'national' },
  { date: '2026-05-01', name: 'Emek ve Dayanışma Günü', type: 'national' },
  { date: '2026-05-19', name: "Atatürk'ü Anma ve Gençlik ve Spor Bayramı", type: 'national' },
  { date: '2026-06-15', name: 'Kurban Bayramı Arifesi', type: 'religious' },
  { date: '2026-06-16', name: 'Kurban Bayramı 1. Gün', type: 'religious' },
  { date: '2026-06-17', name: 'Kurban Bayramı 2. Gün', type: 'religious' },
  { date: '2026-06-18', name: 'Kurban Bayramı 3. Gün', type: 'religious' },
  { date: '2026-06-19', name: 'Kurban Bayramı 4. Gün', type: 'religious' },
  { date: '2026-07-15', name: 'Demokrasi ve Milli Birlik Günü', type: 'national' },
  { date: '2026-08-30', name: 'Zafer Bayramı', type: 'national' },
  { date: '2026-09-06', name: 'Hicri Yılbaşı', type: 'religious' },
  { date: '2026-09-13', name: 'Arefe', type: 'religious' },
  { date: '2026-09-14', name: 'Ramazan Bayramı 1. Gün', type: 'religious' },
  { date: '2026-09-15', name: 'Ramazan Bayramı 2. Gün', type: 'religious' },
  { date: '2026-09-16', name: 'Ramazan Bayramı 3. Gün', type: 'religious' },
  { date: '2026-10-29', name: 'Cumhuriyet Bayramı', type: 'national' },
];
