import {
  Conflict,
  ConflictCode,
  ConflictSeverity,
  createConflict,
} from './conflict';

export interface MasterDataSnapshot {
  personnel: MasterPersonnelRecord[];
  devices: MasterDeviceRecord[];
  shiftTemplates: MasterShiftTemplateRecord[];
  loadedAt: Date;
}

export interface MasterPersonnelRecord {
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

export interface MasterDeviceRecord {
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

export interface MasterShiftTemplateRecord {
  id: string;
  unitId: string;
  personnelGroupId: string;
  name: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  isActive: boolean;
}

export function validatePersonnelForAssignment(
  personnel: MasterPersonnelRecord,
  date: string,
  shiftType: string,
  dayOfWeek: number,
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!personnel.isActive || personnel.employmentStatus !== 'active') {
    conflicts.push(
      createConflict({
        code: ConflictCode.RULE_VIOLATION,
        severity: ConflictSeverity.ERROR,
        message: `${personnel.name} aktif personel değil (durum: ${personnel.employmentStatus})`,
        context: {
          personnelId: personnel.id,
          personnelName: personnel.name,
          date,
          shiftType,
          startTime: '',
          endTime: '',
        },
        isHardConstraint: true,
      }),
    );
  }

  if (shiftType === 'night' && !personnel.nightShiftEligible) {
    conflicts.push(
      createConflict({
        code: ConflictCode.RULE_VIOLATION,
        severity: ConflictSeverity.ERROR,
        message: `${personnel.name} gece vardiyası için uygun değil`,
        context: {
          personnelId: personnel.id,
          personnelName: personnel.name,
          date,
          shiftType,
          startTime: '',
          endTime: '',
        },
        isHardConstraint: true,
      }),
    );
  }

  if (personnel.offDays.includes(dayOfWeek)) {
    conflicts.push(
      createConflict({
        code: ConflictCode.AVAILABILITY_CONFLICT,
        severity: ConflictSeverity.WARNING,
        message: `${personnel.name} için izin günü (gün: ${dayOfWeek})`,
        context: {
          personnelId: personnel.id,
          personnelName: personnel.name,
          date,
          shiftType,
          startTime: '',
          endTime: '',
        },
        isHardConstraint: false,
        isOverridable: true,
      }),
    );
  }

  return conflicts;
}

export function validateDeviceForAssignment(
  device: MasterDeviceRecord,
  date: string,
  shiftType: string,
  dayOfWeek: number,
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!device.isActive) {
    conflicts.push(
      createConflict({
        code: ConflictCode.RULE_VIOLATION,
        severity: ConflictSeverity.ERROR,
        message: `${device.name} (${device.code}) aktif cihaz değil`,
        context: {
          deviceId: device.id,
          deviceName: device.name,
          date,
          shiftType,
          startTime: '',
          endTime: '',
        },
        isHardConstraint: true,
      }),
    );
  }

  if (device.workDays.length > 0 && !device.workDays.includes(dayOfWeek)) {
    conflicts.push(
      createConflict({
        code: ConflictCode.AVAILABILITY_CONFLICT,
        severity: ConflictSeverity.WARNING,
        message: `${device.name} bu gün için çalışma takviminde değil`,
        context: {
          deviceId: device.id,
          deviceName: device.name,
          date,
          shiftType,
          startTime: '',
          endTime: '',
        },
        isHardConstraint: false,
        isOverridable: true,
      }),
    );
  }

  return conflicts;
}

export function validateShiftTemplateForAssignment(
  template: MasterShiftTemplateRecord,
): Conflict[] {
  const conflicts: Conflict[] = [];

  if (!template.isActive) {
    conflicts.push(
      createConflict({
        code: ConflictCode.RULE_VIOLATION,
        severity: ConflictSeverity.ERROR,
        message: `Vardiya şablonu aktif değil: ${template.name}`,
        context: {
          date: '',
          shiftType: template.shiftType,
          startTime: template.startTime,
          endTime: template.endTime,
        },
        isHardConstraint: true,
      }),
    );
  }

  return conflicts;
}
