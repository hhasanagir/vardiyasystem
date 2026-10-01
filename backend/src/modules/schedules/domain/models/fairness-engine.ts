import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { PersonnelId } from '../value-objects/personnel-id.value-object';

export interface FairnessInput {
  assignments: AssignmentCollection;
  personnel: FairnessPersonnelInfo[];
  holidays: Set<string>;
  monthDays: number;
}

export interface FairnessPersonnelInfo {
  id: string;
  name: string;
  nightShiftEligible: boolean;
  maxWeeklyHours: number;
}

export interface FairnessDetail {
  personnelId: string;
  personnelName: string;
  nightCount: number;
  weekendCount: number;
  holidayCount: number;
  totalHours: number;
  score: number;
}

export interface FairnessResult {
  overallScore: number;
  nightScore: number;
  weekendScore: number;
  holidayScore: number;
  workloadScore: number;
  details: FairnessDetail[];
}

export class FairnessEngine {
  calculate(input: FairnessInput): FairnessResult {
    const { assignments, personnel, holidays, monthDays } = input;

    if (!assignments) {
      return {
        overallScore: 100,
        nightScore: 100,
        weekendScore: 100,
        holidayScore: 100,
        workloadScore: 100,
        details: personnel.map((p) => ({
          personnelId: p.id,
          personnelName: p.name,
          nightCount: 0,
          weekendCount: 0,
          holidayCount: 0,
          totalHours: 0,
          score: 100,
        })),
      };
    }

    const details: FairnessDetail[] = personnel.map((p) => {
      const pid = PersonnelId.create(p.id);
      const personAssignments = assignments.findByPersonnel(pid);
      const nightCount = personAssignments.filter(
        (a) => a.shiftType.isNightShift,
      ).length;
      const weekendCount = personAssignments.filter(
        (a) => a.date.isWeekend && a.shiftType.isWorking,
      ).length;
      const holidayCount = personAssignments.filter(
        (a) => holidays.has(a.date.value) && a.shiftType.isWorking,
      ).length;
      const totalHours = personAssignments
        .filter((a) => a.shiftType.isWorking)
        .reduce((sum, a) => sum + a.durationHours, 0);

      return {
        personnelId: p.id,
        personnelName: p.name,
        nightCount,
        weekendCount,
        holidayCount,
        totalHours,
        score: 0,
      };
    });

    const nightScore = this.calculateDimensionScore(
      details.map((d) => d.nightCount),
    );
    const weekendScore = this.calculateDimensionScore(
      details.map((d) => d.weekendCount),
    );
    const holidayScore = this.calculateDimensionScore(
      details.map((d) => d.holidayCount),
    );
    const workloadScore = this.calculateWorkloadScore(details);

    for (const d of details) {
      d.score =
        nightScore * 0.25 +
        weekendScore * 0.2 +
        holidayScore * 0.15 +
        workloadScore * 0.4;
    }

    const overallScore =
      nightScore * 0.25 +
      weekendScore * 0.2 +
      holidayScore * 0.15 +
      workloadScore * 0.4;

    return {
      overallScore: Math.round(overallScore * 10) / 10,
      nightScore: Math.round(nightScore * 10) / 10,
      weekendScore: Math.round(weekendScore * 10) / 10,
      holidayScore: Math.round(holidayScore * 10) / 10,
      workloadScore: Math.round(workloadScore * 10) / 10,
      details,
    };
  }

  private calculateDimensionScore(values: number[]): number {
    if (values.length === 0) return 100;

    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    if (avg === 0) return 100;

    const variance =
      values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;

    const score = Math.max(0, 100 - cv * 100);
    return Math.round(score * 10) / 10;
  }

  private calculateWorkloadScore(details: FairnessDetail[]): number {
    if (details.length === 0) return 100;

    const hours = details.map((d) => d.totalHours);
    const avg = hours.reduce((s, v) => s + v, 0) / hours.length;
    if (avg === 0) return 100;

    const variance =
      hours.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / hours.length;
    const stdDev = Math.sqrt(variance);
    const cv = avg > 0 ? stdDev / avg : 0;

    const score = Math.max(0, 100 - cv * 80);
    return Math.round(score * 10) / 10;
  }
}
