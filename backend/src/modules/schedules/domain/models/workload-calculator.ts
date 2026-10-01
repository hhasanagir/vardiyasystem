import { Assignment } from '../entities/assignment.entity';
import { AssignmentCollection } from '../entities/assignment-collection';
import { PersonnelId } from '../value-objects/personnel-id.value-object';

export interface WorkloadInput {
  assignments: AssignmentCollection;
  personnel: WorkloadPersonnelInfo[];
  holidays: Set<string>;
}

export interface WorkloadPersonnelInfo {
  id: string;
  name: string;
  maxWeeklyHours: number;
}

export interface WorkloadDetail {
  personnelId: string;
  personnelName: string;
  totalShifts: number;
  totalHours: number;
  nightShifts: number;
  weekendShifts: number;
  holidayShifts: number;
  workingDays: number;
}

export interface WorkloadResult {
  details: WorkloadDetail[];
  avgHoursPerPerson: number;
  maxHoursPerPerson: number;
  minHoursPerPerson: number;
  stdDeviation: number;
  balancePercent: number;
}

export class WorkloadCalculator {
  calculate(input: WorkloadInput): WorkloadResult {
    const { assignments, personnel, holidays } = input;

    if (!assignments || personnel.length === 0) {
      return {
        details: personnel.map((p) => ({
          personnelId: p.id,
          personnelName: p.name,
          totalShifts: 0,
          totalHours: 0,
          nightShifts: 0,
          weekendShifts: 0,
          holidayShifts: 0,
          workingDays: 0,
        })),
        avgHoursPerPerson: 0,
        maxHoursPerPerson: 0,
        minHoursPerPerson: 0,
        stdDeviation: 0,
        balancePercent: personnel.length === 0 ? 0 : 100,
      };
    }

    const details: WorkloadDetail[] = personnel.map((p) => {
      const pid = PersonnelId.create(p.id);
      const personAssignments = assignments.findByPersonnel(pid);
      const workingAssignments = personAssignments.filter(
        (a) => a.shiftType.isWorking,
      );

      return {
        personnelId: p.id,
        personnelName: p.name,
        totalShifts: workingAssignments.length,
        totalHours: workingAssignments.reduce(
          (sum, a) => sum + a.durationHours,
          0,
        ),
        nightShifts: personAssignments.filter((a) => a.shiftType.isNightShift)
          .length,
        weekendShifts: workingAssignments.filter((a) => a.date.isWeekend)
          .length,
        holidayShifts: workingAssignments.filter((a) =>
          holidays.has(a.date.value),
        ).length,
        workingDays: new Set(workingAssignments.map((a) => a.date.value)).size,
      };
    });

    const hours = details.map((d) => d.totalHours);
    const avgHoursPerPerson =
      hours.length > 0 ? hours.reduce((s, v) => s + v, 0) / hours.length : 0;
    const maxHoursPerPerson = hours.length > 0 ? Math.max(...hours) : 0;
    const minHoursPerPerson = hours.length > 0 ? Math.min(...hours) : 0;
    const variance =
      hours.length > 0
        ? hours.reduce((s, v) => s + Math.pow(v - avgHoursPerPerson, 2), 0) /
          hours.length
        : 0;
    const stdDeviation = Math.sqrt(variance);
    const cv = avgHoursPerPerson > 0 ? stdDeviation / avgHoursPerPerson : 0;
    const balancePercent = Math.round(Math.max(0, 100 - cv * 100) * 10) / 10;

    return {
      details,
      avgHoursPerPerson: Math.round(avgHoursPerPerson * 10) / 10,
      maxHoursPerPerson,
      minHoursPerPerson,
      stdDeviation: Math.round(stdDeviation * 10) / 10,
      balancePercent,
    };
  }
}
