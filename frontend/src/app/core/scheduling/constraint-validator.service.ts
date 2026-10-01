import { Injectable, computed, signal } from '@angular/core';
import type {
  Constraint,
  ConstraintType,
  ConstraintSeverity,
  ShiftAssignment,
  Personnel,
  Device,
  ValidationResult,
} from '../../domain';
import { CONSTRAINT_LIMITS, RESTRICTION_MESSAGES } from '../../domain';
import { ShiftTypeEnum } from '../../domain/enums';

@Injectable({ providedIn: 'root' })
export class ConstraintValidatorService {
  validateAssignment(
    assignment: ShiftAssignment,
    existingAssignments: ShiftAssignment[],
    personnel: Personnel,
    device: Device,
  ): ValidationResult {
    const errors: Constraint[] = [];
    const warnings: Constraint[] = [];
    let score = 100;

    const personnelAssignments = existingAssignments.filter(
      (a) => a.personnelId === assignment.personnelId && a.date === assignment.date,
    );

    const restViolation = this.checkMinRestViolation(assignment, existingAssignments, personnel);
    if (restViolation) {
      errors.push({
        type: 'min_rest',
        message: RESTRICTION_MESSAGES.MIN_REST,
        severity: 'error',
        affectedAssignments: [assignment.id, ...restViolation.relatedIds],
      });
      score -= 30;
    }

    const nightToDayViolation = this.checkNightToDayViolation(assignment, existingAssignments);
    if (nightToDayViolation) {
      errors.push({
        type: 'no_night_to_day',
        message: RESTRICTION_MESSAGES.NO_NIGHT_TO_DAY,
        severity: 'error',
        affectedAssignments: [assignment.id],
      });
      score -= 25;
    }

    const weeklyShiftCount = this.countWeeklyShifts(assignment, existingAssignments);
    if (weeklyShiftCount >= CONSTRAINT_LIMITS.MAX_WEEKLY_SHIFTS) {
      errors.push({
        type: 'max_weekly_shifts',
        message: RESTRICTION_MESSAGES.MAX_WEEKLY_SHIFTS,
        severity: 'error',
        affectedAssignments: [assignment.id],
      });
      score -= 20;
    }

    const skillViolation = this.checkSkillCompatibility(personnel, device);
    if (skillViolation) {
      errors.push({
        type: 'skill_compatibility',
        message: RESTRICTION_MESSAGES.SKILL_GAP,
        severity: 'error',
        affectedAssignments: [assignment.id],
      });
      score -= 40;
    }

    const weeklyNightShifts = this.countWeeklyNightShifts(assignment, existingAssignments);
    if (weeklyNightShifts >= CONSTRAINT_LIMITS.MAX_NIGHT_SHIFTS_WEEKLY) {
      warnings.push({
        type: 'max_weekly_shifts',
        message: RESTRICTION_MESSAGES.MAX_NIGHT_SHIFTS,
        severity: 'warning',
        affectedAssignments: [assignment.id],
      });
      score -= 10;
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score),
    };
  }

  private checkMinRestViolation(
    newAssignment: ShiftAssignment,
    existingAssignments: ShiftAssignment[],
    personnel: Personnel,
  ): { valid: boolean; relatedIds: string[] } | null {
    const relatedIds: string[] = [];

    for (const existing of existingAssignments) {
      if (existing.personnelId === newAssignment.personnelId && existing.id !== newAssignment.id) {
        const hoursBetween = this.calculateHoursBetween(
          existing.endTime,
          newAssignment.startTime,
          existing.date,
          newAssignment.date,
        );

        if (hoursBetween < CONSTRAINT_LIMITS.MIN_REST_HOURS && hoursBetween >= 0) {
          relatedIds.push(existing.id);
        }
      }
    }

    return relatedIds.length > 0 ? { valid: false, relatedIds } : null;
  }

  private checkNightToDayViolation(
    newAssignment: ShiftAssignment,
    existingAssignments: ShiftAssignment[],
  ): boolean {
    if (newAssignment.shiftType !== ShiftTypeEnum.DAY) return false;

    const nextDay = this.addDays(newAssignment.date, 1);
    const prevDay = this.addDays(newAssignment.date, -1);

    for (const existing of existingAssignments) {
      if (existing.personnelId === newAssignment.personnelId && existing.id !== newAssignment.id) {
        if (existing.shiftType === ShiftTypeEnum.NIGHT) {
          if (existing.date === nextDay || existing.date === prevDay) {
            return true;
          }
        }
      }
    }

    return false;
  }

  private countWeeklyShifts(
    newAssignment: ShiftAssignment,
    existingAssignments: ShiftAssignment[],
  ): number {
    const weekStart = this.getWeekStart(newAssignment.date);
    const weekEnd = this.addDays(weekStart, 7);

    return existingAssignments.filter(
      (a) => a.personnelId === newAssignment.personnelId && a.date >= weekStart && a.date < weekEnd,
    ).length;
  }

  private countWeeklyNightShifts(
    newAssignment: ShiftAssignment,
    existingAssignments: ShiftAssignment[],
  ): number {
    const weekStart = this.getWeekStart(newAssignment.date);
    const weekEnd = this.addDays(weekStart, 7);

    return existingAssignments.filter(
      (a) =>
        a.personnelId === newAssignment.personnelId &&
        a.shiftType === ShiftTypeEnum.NIGHT &&
        a.date >= weekStart &&
        a.date < weekEnd,
    ).length;
  }

  private checkSkillCompatibility(personnel: Personnel, device: Device): boolean {
    if (device.requiredSkills.length === 0) return false;
    return !device.requiredSkills.some((skill) => personnel.skills.includes(skill));
  }

  private calculateHoursBetween(
    endTime: string,
    startTime: string,
    endDate: string,
    startDate: string,
  ): number {
    const [endHour, endMin] = endTime.split(':').map(Number);
    const [startHour, startMin] = startTime.split(':').map(Number);

    let endDateTime = new Date(`${endDate}T${endTime}:00`);
    let startDateTime = new Date(`${startDate}T${startTime}:00`);

    if (startDateTime < endDateTime) {
      startDateTime = new Date(startDateTime.getTime() + 24 * 60 * 60 * 1000);
    }

    const diffMs = startDateTime.getTime() - endDateTime.getTime();
    return diffMs / (1000 * 60 * 60);
  }

  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }

  private getWeekStart(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  }
}
