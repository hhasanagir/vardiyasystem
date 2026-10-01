import { Injectable } from '@angular/core';
import type { ShiftAssignment, Personnel, FairnessMetrics, Schedule } from '../../domain';
import { TURKISH_HOLIDAYS_2026 } from '../../domain';
import { ShiftTypeEnum } from '../../domain/enums';

@Injectable({ providedIn: 'root' })
export class FairnessBalancerService {
  calculateFairnessMetrics(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
  ): FairnessMetrics {
    const nightDistribution = this.calculateNightDistribution(assignments, personnel);
    const weekendRate = this.calculateWeekendRate(assignments, personnel);
    const holidayRate = this.calculateHolidayRate(assignments, personnel);
    const rotationFairness = this.calculateRotationFairness(assignments, personnel);

    const overallScore =
      nightDistribution * 0.3 + weekendRate * 0.25 + holidayRate * 0.2 + rotationFairness * 0.25;

    return {
      nightShiftDistribution: nightDistribution,
      weekendAssignmentRate: weekendRate,
      holidayAssignmentRate: holidayRate,
      deviceRotationFairness: rotationFairness,
      overallScore: Math.round(overallScore * 100) / 100,
    };
  }

  private calculateNightDistribution(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
  ): number {
    const nightAssignments = assignments.filter((a) => a.shiftType === ShiftTypeEnum.NIGHT);

    if (nightAssignments.length === 0) return 1;

    const nightCountByPerson = new Map<string, number>();
    for (const a of nightAssignments) {
      nightCountByPerson.set(a.personnelId, (nightCountByPerson.get(a.personnelId) || 0) + 1);
    }

    const counts = Array.from(nightCountByPerson.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, 1 - stdDev / (mean + 1));
  }

  private calculateWeekendRate(assignments: ShiftAssignment[], personnel: Personnel[]): number {
    const weekendAssignments = assignments.filter((a) => {
      const date = new Date(a.date);
      const day = date.getDay();
      return day === 0 || day === 6;
    });

    if (weekendAssignments.length === 0) return 1;

    const weekendCountByPerson = new Map<string, number>();
    for (const a of weekendAssignments) {
      weekendCountByPerson.set(a.personnelId, (weekendCountByPerson.get(a.personnelId) || 0) + 1);
    }

    const counts = Array.from(weekendCountByPerson.values());
    if (counts.length === 0) return 1;

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, 1 - stdDev / (mean + 1));
  }

  private calculateHolidayRate(assignments: ShiftAssignment[], _personnel: Personnel[]): number {
    const holidayAssignments = assignments.filter((a) =>
      TURKISH_HOLIDAYS_2026.some((h) => h.date === a.date),
    );

    if (holidayAssignments.length === 0) return 1;

    const holidayCountByPerson = new Map<string, number>();
    for (const a of holidayAssignments) {
      holidayCountByPerson.set(a.personnelId, (holidayCountByPerson.get(a.personnelId) || 0) + 1);
    }

    const counts = Array.from(holidayCountByPerson.values());
    if (counts.length === 0) return 1;

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, 1 - stdDev / (mean + 1));
  }

  private calculateRotationFairness(
    assignments: ShiftAssignment[],
    personnel: Personnel[],
  ): number {
    const assignmentCountByPerson = new Map<string, number>();
    for (const a of assignments) {
      assignmentCountByPerson.set(
        a.personnelId,
        (assignmentCountByPerson.get(a.personnelId) || 0) + 1,
      );
    }

    if (assignmentCountByPerson.size === 0) return 1;

    const counts = Array.from(assignmentCountByPerson.values());
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;

    if (mean === 0) return 1;

    const variance = counts.reduce((sum, c) => sum + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.max(0, 1 - stdDev / (mean + 1));
  }

  getPersonnelWorkload(
    assignments: ShiftAssignment[],
    personnelId: string,
  ): { total: number; night: number; weekend: number; holiday: number } {
    const personnelAssignments = assignments.filter((a) => a.personnelId === personnelId);

    return {
      total: personnelAssignments.length,
      night: personnelAssignments.filter((a) => a.shiftType === ShiftTypeEnum.NIGHT).length,
      weekend: personnelAssignments.filter((a) => {
        const date = new Date(a.date);
        const day = date.getDay();
        return day === 0 || day === 6;
      }).length,
      holiday: personnelAssignments.filter((a) =>
        TURKISH_HOLIDAYS_2026.some((h) => h.date === a.date),
      ).length,
    };
  }

  suggestRebalance(assignments: ShiftAssignment[], personnel: Personnel[]): ShiftAssignment[] {
    const metrics = this.calculateFairnessMetrics(assignments, personnel);

    if (metrics.overallScore >= 0.8) {
      return assignments;
    }

    return this.rebalanceAssignments(assignments, personnel);
  }

  private rebalanceAssignments(
    assignments: ShiftAssignment[],
    _personnel: Personnel[],
  ): ShiftAssignment[] {
    return [...assignments];
  }
}
