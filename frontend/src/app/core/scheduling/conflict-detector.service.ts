import { Injectable } from '@angular/core';
import type {
  Conflict,
  ShiftAssignment,
  Personnel,
  Device,
  ConstraintType,
  ConflictType,
} from '../../domain';
import { CONSTRAINT_LIMITS, TURKISH_HOLIDAYS_2026 } from '../../domain';
import { ShiftTypeEnum, ConflictTypeEnum } from '../../domain/enums';

export interface ConflictCheckResult {
  conflicts: Conflict[];
  isValid: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConflictDetectorService {
  detectConflicts(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
    devices: Device[],
  ): ConflictCheckResult {
    const conflicts: Conflict[] = [];

    const restConflicts = this.detectRestViolations(assignments);
    conflicts.push(...restConflicts);

    const doubleConflicts = this.detectDoubleAssignments(assignments);
    conflicts.push(...doubleConflicts);

    const skillGaps = this.detectSkillGaps(assignments, personnel, devices);
    conflicts.push(...skillGaps);

    const coverageGaps = this.detectCoverageGaps(assignments, devices);
    conflicts.push(...coverageGaps);

    return {
      conflicts,
      isValid:
        conflicts.filter((c) => c.severity === 'critical' || c.severity === 'high').length === 0,
    };
  }

  private detectRestViolations(assignments: ShiftAssignment[]): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const assignment of assignments) {
      const prevDay = this.addDays(assignment.date, -1);
      const prevAssignment = assignments.find(
        (a) =>
          a.personnelId === assignment.personnelId &&
          a.date === prevDay &&
          a.shiftType === ShiftTypeEnum.NIGHT,
      );

      if (prevAssignment) {
        const hoursBetween = this.calculateHoursBetween('08:00', '08:00', prevDay, assignment.date);

        if (hoursBetween < CONSTRAINT_LIMITS.MIN_REST_HOURS) {
          conflicts.push({
            id: `rest-${assignment.id}`,
            type: ConflictTypeEnum.REST_VIOLATION,
            severity: 'high',
            message: `${assignment.personnelId} personelinin gece vardiyasından sonra yeterli dinlenme süresi yok`,
            date: assignment.date,
            personnelId: assignment.personnelId,
            relatedAssignments: [assignment.id, prevAssignment.id],
          });
        }
      }
    }

    return conflicts;
  }

  private detectDoubleAssignments(assignments: ShiftAssignment[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const seen = new Map<string, string>();

    for (const assignment of assignments) {
      const key = `${assignment.personnelId}-${assignment.date}-${assignment.shiftType}`;

      if (seen.has(key)) {
        conflicts.push({
          id: `double-${assignment.id}`,
          type: ConflictTypeEnum.DOUBLE_ASSIGNMENT,
          severity: 'critical',
          message: `${assignment.personnelId} aynı tarih ve vardiyada iki kez atanmış`,
          date: assignment.date,
          personnelId: assignment.personnelId,
          relatedAssignments: [seen.get(key)!, assignment.id],
        });
      } else {
        seen.set(key, assignment.id);
      }
    }

    return conflicts;
  }

  private detectSkillGaps(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
    devices: Device[],
  ): Conflict[] {
    const conflicts: Conflict[] = [];

    for (const assignment of assignments) {
      const device = devices.find((d) => d.id === assignment.deviceId);
      const person = personnel.find((p) => p.id === assignment.personnelId);

      if (device && person) {
        const hasSkill = device.requiredSkills.every((skill) => person.skills.includes(skill));

        if (!hasSkill) {
          conflicts.push({
            id: `skill-${assignment.id}`,
            type: ConflictTypeEnum.SKILL_GAP,
            severity: 'medium',
            message: `${person.name} - ${device.name} için gerekli yetkinliklere sahip değil`,
            date: assignment.date,
            personnelId: assignment.personnelId,
            deviceId: assignment.deviceId,
            relatedAssignments: [assignment.id],
          });
        }
      }
    }

    return conflicts;
  }

  private detectCoverageGaps(assignments: ShiftAssignment[], devices: Device[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const dates = [...new Set(assignments.map((a) => a.date))];

    for (const device of devices.filter((d) => d.isActive && d.mode === 'vardiya')) {
      for (const date of dates) {
        const hasAssignment = assignments.some((a) => a.deviceId === device.id && a.date === date);

        if (!hasAssignment) {
          const isHoliday = TURKISH_HOLIDAYS_2026.some((h) => h.date === date);

          conflicts.push({
            id: `coverage-${device.id}-${date}`,
            type: ConflictTypeEnum.COVERAGE_GAP,
            severity: isHoliday ? 'low' : 'medium',
            message: `${device.name} cihazında ${date} tarihinde personel ataması yok`,
            date,
            deviceId: device.id,
            relatedAssignments: [],
          });
        }
      }
    }

    return conflicts;
  }

  private calculateHoursBetween(
    endTime: string,
    startTime: string,
    endDate: string,
    startDate: string,
  ): number {
    const endDateTime = new Date(`${endDate}T${endTime}:00`);
    const startDateTime = new Date(`${startDate}T${startTime}:00`);
    const diffMs = startDateTime.getTime() - endDateTime.getTime();
    return diffMs / (1000 * 60 * 60);
  }

  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}
