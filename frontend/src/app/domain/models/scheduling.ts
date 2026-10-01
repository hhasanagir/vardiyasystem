import type {
  UnitType,
  ShiftType,
  DeviceMode,
  ScheduleStatus,
  ConflictType,
  ConflictSeverity,
  ConstraintType,
  ConstraintSeverity,
  HolidayType,
  UserRole,
  SwapRequestStatus,
  OrganizationPlan,
  AnalyticsWarningType,
} from '../enums';

export interface Personnel {
  id: string;
  name: string;
  unit: UnitType;
  skills: string[];
  isActive: boolean;
  seniority: number;
  preferences?: PersonnelPreferences;
}

export interface PersonnelPreferences {
  preferredShifts?: ShiftType[];
  preferredDevices?: string[];
  unavailableDates?: string[];
  isPregnant?: boolean;
  monthlyDose?: number;
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
  tripleShift?: boolean;
  shiftTypes?: ShiftType[];
}

export interface ShiftAssignment {
  id: string;
  deviceId: string;
  personnelId: string;
  personnelName?: string;
  deviceCode?: string;
  date: string;
  shiftType: ShiftType;
  startTime: string;
  endTime: string;
  status?: 'planned' | 'confirmed' | 'completed';
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
  status: ScheduleStatus;
}

export interface PersonnelGroup {
  id: string;
  code: string;
  name: string;
  description?: string;
  organizationId?: string | null;
  unitId?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  personnelCount?: number;
  templates?: PersonShiftTemplate[];
}

export interface PersonShiftTemplate {
  id: string;
  name: string;
  shiftType: ShiftType | 'day' | 'evening' | 'night' | 'morning';
  startTime: string;
  endTime: string;
  isActive: boolean;
  unitId?: string;
  personnelGroupId?: string;
}

export interface PersonShiftConfigGroup {
  groupId: string;
  code: string;
  name: string;
  description?: string | null;
  templates: PersonShiftTemplate[];
}

export interface PersonShiftAssignment {
  id: string;
  scheduleId: string;
  personnelId: string;
  personnelName?: string;
  personnelType?: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  unitId: string | null;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  version: number;
}

export interface PersonShiftsResponse {
  unit: string;
  month: number;
  year: number;
  scheduleId: string | null;
  status: string;
  unitId: string;
  groups: Array<{
    id: string;
    code: string;
    name: string;
    description?: string | null;
    personnelCount: number;
    templates: PersonShiftTemplate[];
    assignments: PersonShiftAssignment[];
  }>;
}

export interface PersonShiftReportRow {
  personnelId: string;
  personnelName: string;
  personnelType?: string;
  groupId: string | null;
  groupName: string;
  totalShifts: number;
  totalHours: number;
  dayShifts: number;
  eveningShifts: number;
  nightShifts: number;
  weekendShifts: number;
  dates: Array<{
    date: string;
    shiftType: string;
    startTime: string;
    endTime: string;
    isNight: boolean;
    isWeekend: boolean;
  }>;
}

export interface PersonShiftReportGroupSummary {
  groupId: string;
  groupName: string;
  personnelCount: number;
  assignedPersonnel: number;
  totalShifts: number;
  totalHours: number;
  nightShifts: number;
  weekendShifts: number;
}

export interface PersonShiftReportResponse {
  unit: string;
  month: number;
  year: number;
  scheduleId: string | null;
  unitId: string;
  rows: PersonShiftReportRow[];
  groups: PersonShiftReportGroupSummary[];
  summary: {
    totalAssignments: number;
    totalHours: number;
    nightShifts: number;
    weekendShifts: number;
  };
}
