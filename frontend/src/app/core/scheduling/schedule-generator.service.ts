import { Injectable } from '@angular/core';
import type {
  Schedule,
  ShiftAssignment,
  Personnel,
  Device,
  ScheduleGenerationOptions,
  ValidationResult,
  ShiftType,
} from '../../domain';
import { CONSTRAINT_LIMITS, SHIFT_TIMES, TURKISH_HOLIDAYS_2026, UNIT_CONFIG } from '../../domain';
import { ShiftTypeEnum, DeviceModeEnum, UnitTypeEnum } from '../../domain/enums';
import { ConstraintValidatorService } from './constraint-validator.service';
import { FairnessBalancerService } from './fairness-balancer.service';

@Injectable({ providedIn: 'root' })
export class ScheduleGeneratorService {
  constructor(
    private constraintValidator: ConstraintValidatorService,
    private fairnessBalancer: FairnessBalancerService,
  ) {}

  generateSchedule(
    unit: string,
    month: number,
    year: number,
    personnel: Personnel[],
    devices: Device[],
    options: ScheduleGenerationOptions = {},
  ): Schedule {
    const daysInMonth = new Date(year, month, 0).getDate();
    const assignments: ShiftAssignment[] = [];

    const unitDevices = devices.filter((d) => d.unit === (unit as any));
    const unitPersonnel = personnel.filter((p) => p.unit === (unit as any));

    const deviceWorkloads = new Map<string, number>();
    const personnelWorkloads = new Map<string, number>();

    for (const device of unitDevices) {
      deviceWorkloads.set(device.id, 0);
    }
    for (const person of unitPersonnel) {
      personnelWorkloads.set(person.id, 0);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const date = new Date(dateStr);
      const dayOfWeek = date.getDay();

      if (unit === UnitTypeEnum.NUKLEER && dayOfWeek === 0) {
        continue;
      }

      for (const device of unitDevices) {
        if (!this.isWorkDay(device.workDays, dayOfWeek)) {
          continue;
        }

        const isHoliday = TURKISH_HOLIDAYS_2026.some((h) => h.date === dateStr);
        if (device.mode === DeviceModeEnum.POLYCLINIC && isHoliday) {
          continue;
        }

        const shiftTypes = this.getShiftTypes(device, dateStr);
        const assignment = this.createAssignment(
          dateStr,
          device,
          unitPersonnel,
          shiftTypes,
          assignments,
          deviceWorkloads,
          personnelWorkloads,
        );

        if (assignment) {
          assignments.push(assignment);
          deviceWorkloads.set(device.id, (deviceWorkloads.get(device.id) || 0) + 1);
          personnelWorkloads.set(
            assignment.personnelId,
            (personnelWorkloads.get(assignment.personnelId) || 0) + 1,
          );
        }
      }
    }

    return {
      id: `schedule-${unit}-${month}-${year}`,
      unit: unit as any,
      month,
      year,
      assignments,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'draft',
    };
  }

  private isWorkDay(workDays: number[], dayOfWeek: number): boolean {
    return workDays.includes(dayOfWeek);
  }

  private getShiftTypes(
    device: Device,
    date: string,
  ): Array<(typeof ShiftTypeEnum)[keyof typeof ShiftTypeEnum]> {
    if (device.mode === DeviceModeEnum.POLYCLINIC) {
      return [ShiftTypeEnum.DAY];
    }

    const isHoliday = TURKISH_HOLIDAYS_2026.some((h) => h.date === date);
    if (isHoliday) {
      return [ShiftTypeEnum.DAY];
    }

    return [ShiftTypeEnum.DAY, ShiftTypeEnum.NIGHT];
  }

  private createAssignment(
    date: string,
    device: Device,
    personnel: Personnel[],
    shiftTypes: (typeof ShiftTypeEnum)[keyof typeof ShiftTypeEnum][],
    existingAssignments: ShiftAssignment[],
    deviceWorkloads: Map<string, number>,
    personnelWorkloads: Map<string, number>,
  ): ShiftAssignment | null {
    const availablePersonnel = this.findAvailablePersonnel(
      personnel,
      shiftTypes[0],
      date,
      existingAssignments,
      personnelWorkloads,
    );

    if (availablePersonnel.length === 0) {
      return null;
    }

    const selectedPerson = availablePersonnel[0];
    const shiftTime = SHIFT_TIMES[shiftTypes[0] as keyof typeof SHIFT_TIMES];

    return {
      id: `assignment-${device.id}-${date}-${Date.now()}`,
      deviceId: device.id,
      personnelId: selectedPerson.id,
      date,
      shiftType: shiftTypes[0] as ShiftType,
      startTime: `${String(shiftTime.start).padStart(2, '0')}:00`,
      endTime: `${String(shiftTime.end).padStart(2, '0')}:00`,
      isConfirmed: false,
    };
  }

  private findAvailablePersonnel(
    personnel: Personnel[],
    shiftType: (typeof ShiftTypeEnum)[keyof typeof ShiftTypeEnum],
    date: string,
    existingAssignments: ShiftAssignment[],
    workloads: Map<string, number>,
  ): Personnel[] {
    return personnel
      .filter((p) => p.isActive)
      .filter((p) => this.hasRequiredSkills(p, shiftType))
      .filter((p) => this.isAvailable(p, date))
      .sort((a, b) => {
        const workloadA = workloads.get(a.id) || 0;
        const workloadB = workloads.get(b.id) || 0;
        return workloadA - workloadB;
      });
  }

  private hasRequiredSkills(
    personnel: Personnel,
    shiftType: (typeof ShiftTypeEnum)[keyof typeof ShiftTypeEnum],
  ): boolean {
    return true;
  }

  private isAvailable(personnel: Personnel, date: string): boolean {
    if (!personnel.preferences?.unavailableDates) {
      return true;
    }
    return !personnel.preferences.unavailableDates.includes(date);
  }

  validateSchedule(schedule: Schedule): ValidationResult {
    return {
      isValid: true,
      errors: [],
      warnings: [],
      score: 100,
    };
  }
}
