export interface Personnel {
  id: string;
  name: string;
  role: string;
  unitId: string;
  groupId: string | null;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  employmentStatus: string;
  offDays: number[];
  maxWeeklyHours: number;
  isActive: boolean;
}

export interface Device {
  id: string;
  code: string;
  name: string;
  unitId: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
  isMaster: boolean;
  isActive: boolean;
}

export interface ShiftTemplate {
  id: string;
  unitId: string;
  personnelGroupId: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export interface PersonnelGroup {
  id: string;
  code: string;
  name: string;
  unitId: string | null;
  isActive: boolean;
  personnelCount?: number;
}
