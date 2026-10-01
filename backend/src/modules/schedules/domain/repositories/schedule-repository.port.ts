import { Schedule } from '../aggregates/schedule.aggregate';

export interface ScheduleFilter {
  unitId?: string;
  month?: number;
  year?: number;
  status?: string;
  organizationId?: string;
  take?: number;
  skip?: number;
}

export interface ScheduleRepositoryPort {
  findById(id: string): Promise<Schedule | null>;
  findByUnitMonthYear(
    unitId: string,
    month: number,
    year: number,
  ): Promise<Schedule | null>;
  findAll(filter: ScheduleFilter): Promise<Schedule[]>;
  save(schedule: Schedule, expectedVersion?: number): Promise<void>;
  delete(id: string): Promise<void>;
  count(filter?: ScheduleFilter): Promise<number>;
  findPendingApprovals(): Promise<Schedule[]>;
  getVersionSnapshot(
    scheduleId: string,
    version: number,
  ): Promise<VersionSnapshotRecord | null>;
}

export interface VersionSnapshotRecord {
  id: string;
  scheduleId: string;
  version: number;
  data: { assignments: unknown[] };
  createdById: string | null;
  createdAt: Date;
}

export interface PersonnelRepositoryPort {
  findById(id: string): Promise<PersonnelRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<PersonnelRecord[]>;
}

export interface PersonnelRecord {
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
  seniority: number;
}

export interface DeviceRepositoryPort {
  findById(id: string): Promise<DeviceRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<DeviceRecord[]>;
}

export interface DeviceRecord {
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

export interface ShiftTemplateRepositoryPort {
  findById(id: string): Promise<ShiftTemplateRecord | null>;
  findMany(filter: {
    unitId?: string;
    isActive?: boolean;
  }): Promise<ShiftTemplateRecord[]>;
}

export interface ShiftTemplateRecord {
  id: string;
  unitId: string;
  personnelGroupId: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}
