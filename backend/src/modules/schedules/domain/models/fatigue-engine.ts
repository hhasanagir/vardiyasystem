import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { PersonnelId } from '../value-objects/personnel-id.value-object';
import {
  MIN_REST_HOURS,
  REQUIRED_REST_HOURS,
  NIGHT_TO_DAY_REST_HOURS,
  MAX_CONSECUTIVE_NIGHTS,
} from '../constants';

export interface FatigueCoefficients {
  consecutiveNightPenalty: number;
  weekendShiftPenalty: number;
  holidayShiftPenalty: number;
  shortRestPenalty: number;
  overtimePenalty: number;
  consecutiveDaysPenalty: number;
}

export const DEFAULT_FATIGUE_COEFFICIENTS: FatigueCoefficients = {
  consecutiveNightPenalty: 0.15,
  weekendShiftPenalty: 0.08,
  holidayShiftPenalty: 0.12,
  shortRestPenalty: 0.2,
  overtimePenalty: 0.1,
  consecutiveDaysPenalty: 0.05,
};

export const WORKLOAD_LIMITS = {
  maxWeeklyShifts: 6,
  maxNightShiftsPerWeek: 3,
  maxConsecutiveDays: 6,
  minRecoveryHoursAfterNight: 24,
  minRecoveryHoursLegal: REQUIRED_REST_HOURS,
};

export interface FatigueInput {
  candidateDate: string;
  candidateShiftType: string;
  candidateStartTime: string;
  candidateEndTime: string;
  personnelId: string;
  existingAssignments: AssignmentCollection;
  holidays: Set<string>;
}

export interface FatigueResult {
  score: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: FatigueFactor[];
}

export interface FatigueFactor {
  type: string;
  contribution: number;
  description: string;
}

export class FatigueEngine {
  private readonly coefficients: FatigueCoefficients;

  constructor(coefficients?: Partial<FatigueCoefficients>) {
    this.coefficients = { ...DEFAULT_FATIGUE_COEFFICIENTS, ...coefficients };
  }

  evaluate(input: FatigueInput): FatigueResult {
    const factors: FatigueFactor[] = [];
    let totalPenalty = 0;

    if (!input.existingAssignments) {
      return { score: 100, riskLevel: 'low', factors: [] };
    }

    const consecutiveNights = this.countConsecutiveNights(
      input.existingAssignments,
      input.personnelId,
      input.candidateDate,
    );
    if (consecutiveNights > 0) {
      const penalty =
        consecutiveNights * this.coefficients.consecutiveNightPenalty;
      factors.push({
        type: 'consecutive_nights',
        contribution: penalty,
        description: `${consecutiveNights} consecutive night shifts`,
      });
      totalPenalty += penalty;
    }

    const isWeekend = this.isWeekend(input.candidateDate);
    if (isWeekend) {
      const weekendShifts = this.countWeekendShifts(
        input.existingAssignments,
        input.personnelId,
        input.candidateDate,
      );
      const penalty =
        this.coefficients.weekendShiftPenalty * (weekendShifts + 1);
      factors.push({
        type: 'weekend_work',
        contribution: penalty,
        description: `Weekend shift on ${input.candidateDate}`,
      });
      totalPenalty += penalty;
    }

    const isHoliday = input.holidays.has(input.candidateDate);
    if (isHoliday) {
      const penalty = this.coefficients.holidayShiftPenalty;
      factors.push({
        type: 'holiday_work',
        contribution: penalty,
        description: `Holiday shift on ${input.candidateDate}`,
      });
      totalPenalty += penalty;
    }

    const shortRestHours = this.getLastRestHours(
      input.existingAssignments,
      input.personnelId,
      input.candidateDate,
      input.candidateStartTime,
    );
    if (shortRestHours < WORKLOAD_LIMITS.minRecoveryHoursAfterNight) {
      const penalty =
        shortRestHours < REQUIRED_REST_HOURS
          ? this.coefficients.shortRestPenalty
          : this.coefficients.shortRestPenalty * 0.5;
      factors.push({
        type: 'short_rest',
        contribution: penalty,
        description: `Insufficient rest (${shortRestHours.toFixed(1)}h)`,
      });
      totalPenalty += penalty;
    }

    const consecutiveDays = this.countConsecutiveWorkDays(
      input.existingAssignments,
      input.personnelId,
      input.candidateDate,
    );
    if (consecutiveDays > WORKLOAD_LIMITS.maxConsecutiveDays) {
      const penalty =
        this.coefficients.consecutiveDaysPenalty *
        (consecutiveDays - WORKLOAD_LIMITS.maxConsecutiveDays);
      factors.push({
        type: 'consecutive_days',
        contribution: penalty,
        description: `${consecutiveDays} consecutive work days`,
      });
      totalPenalty += penalty;
    }

    const weeklyHours = this.calculateWeeklyHours(
      input.existingAssignments,
      input.personnelId,
      input.candidateDate,
    );
    if (weeklyHours > 40) {
      const overtimeHours = weeklyHours - 40;
      const penalty = Math.min(
        overtimeHours * this.coefficients.overtimePenalty,
        0.2,
      );
      factors.push({
        type: 'overtime',
        contribution: penalty,
        description: `${weeklyHours.toFixed(0)}h weekly (${overtimeHours.toFixed(0)}h overtime)`,
      });
      totalPenalty += penalty;
    }

    const score = Math.max(0, Math.min(100, 100 - totalPenalty * 100));
    const riskLevel = this.getRiskLevel(score, factors);

    return { score, riskLevel, factors };
  }

  private countConsecutiveNights(
    assignments: AssignmentCollection,
    personnelId: string,
    candidateDate: string,
  ): number {
    const pid = PersonnelId.create(personnelId);
    const nightAssignments = assignments
      .findByPersonnel(pid)
      .filter((a) => a.shiftType.isNightShift)
      .sort((a, b) => b.date.value.localeCompare(a.date.value));

    if (nightAssignments.length === 0) return 0;

    let consecutive = 0;
    let checkDate = new Date(candidateDate);

    for (const a of nightAssignments) {
      const aDate = new Date(a.date.value);
      const diffDays = Math.floor(
        (checkDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 0 || diffDays === 1) {
        consecutive++;
        checkDate = aDate;
      } else {
        break;
      }
    }

    return consecutive;
  }

  private countWeekendShifts(
    assignments: AssignmentCollection,
    personnelId: string,
    candidateDate: string,
  ): number {
    const pid = PersonnelId.create(personnelId);
    const weekStart = this.getWeekStart(candidateDate);
    const weekEnd = this.addDays(weekStart, 7);

    return assignments.findByPersonnel(pid).filter((a) => {
      if (!a.shiftType.isWorking) return false;
      const day = new Date(a.date.value).getDay();
      const isWeekendDay = day === 0 || day === 6;
      return (
        isWeekendDay && a.date.value >= weekStart && a.date.value < weekEnd
      );
    }).length;
  }

  private getLastRestHours(
    assignments: AssignmentCollection,
    personnelId: string,
    candidateDate: string,
    candidateStartTime: string,
  ): number {
    const pid = PersonnelId.create(personnelId);
    const previous = assignments
      .findByPersonnel(pid)
      .filter(
        (a) =>
          a.date.value < candidateDate ||
          (a.date.value === candidateDate && a.endTime <= candidateStartTime),
      )
      .sort(
        (a, b) =>
          b.date.value.localeCompare(a.date.value) ||
          b.endTime.localeCompare(a.endTime),
      );

    if (previous.length === 0) return 48;

    const last = previous[0];
    const lastEnd = new Date(`${last.date.value}T${last.endTime}`);
    const nextStart = new Date(`${candidateDate}T${candidateStartTime}`);

    return (nextStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
  }

  private countConsecutiveWorkDays(
    assignments: AssignmentCollection,
    personnelId: string,
    candidateDate: string,
  ): number {
    const pid = PersonnelId.create(personnelId);
    const sorted = assignments
      .findByPersonnel(pid)
      .filter((a) => a.shiftType.isWorking && a.date.value <= candidateDate)
      .sort((a, b) => b.date.value.localeCompare(a.date.value));

    if (sorted.length === 0) return 0;

    let consecutive = 1;
    let currentDate = new Date(sorted[0].date.value);

    for (let i = 1; i < sorted.length; i++) {
      const aDate = new Date(sorted[i].date.value);
      const diffDays = Math.floor(
        (currentDate.getTime() - aDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diffDays === 1) {
        consecutive++;
        currentDate = aDate;
      } else {
        break;
      }
    }

    return consecutive;
  }

  private calculateWeeklyHours(
    assignments: AssignmentCollection,
    personnelId: string,
    candidateDate: string,
  ): number {
    const pid = PersonnelId.create(personnelId);
    const weekStart = this.getWeekStart(candidateDate);
    const weekEnd = this.addDays(weekStart, 7);

    return assignments
      .findByPersonnel(pid)
      .filter(
        (a) =>
          a.shiftType.isWorking &&
          a.date.value >= weekStart &&
          a.date.value < weekEnd,
      )
      .reduce((total, a) => total + a.durationHours, 0);
  }

  private getRiskLevel(
    score: number,
    factors: FatigueFactor[],
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (score < 30 || factors.some((f) => f.type === 'short_rest'))
      return 'critical';
    if (
      score < 50 ||
      factors.some(
        (f) => f.type === 'consecutive_nights' && f.contribution > 0.2,
      )
    )
      return 'high';
    if (score < 70) return 'medium';
    return 'low';
  }

  private isWeekend(dateStr: string): boolean {
    const day = new Date(dateStr).getDay();
    return day === 0 || day === 6;
  }

  private getWeekStart(dateStr: string): string {
    const date = new Date(dateStr);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    date.setDate(diff);
    return date.toISOString().split('T')[0];
  }

  private addDays(dateStr: string, days: number): string {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
  }
}
