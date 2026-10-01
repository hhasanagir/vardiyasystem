import { Injectable } from '@angular/core';
import type { ShiftAssignment, Personnel } from '../../domain';
import type { ShiftType } from '../../domain/enums';
import { ShiftTypeEnum } from '../../domain/enums';
import { TURKISH_HOLIDAYS_2026, FATIGUE_COEFFICIENTS, WORKLOAD_LIMITS } from '../../domain/rules';

export interface FatigueScore {
  overall: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  factors: FatigueFactor[];
  recommendation: string;
}

export interface FatigueFactor {
  type: string;
  contribution: number;
  description: string;
}

export interface PersonnelFatigueProfile {
  personnelId: string;
  currentFatigue: number;
  weeklyFatigue: number;
  monthlyFatigue: number;
  riskFlags: string[];
  recommendedAssignments: AssignmentRecommendation[];
}

export interface AssignmentRecommendation {
  shiftType: ShiftType;
  score: number;
  reason: string;
  priority: number;
}

@Injectable({ providedIn: 'root' })
export class FatigueEngineService {
  calculateFatigueScore(
    assignments: ShiftAssignment[],
    personnel: Personnel,
    targetDate: string,
  ): FatigueScore {
    const factors: FatigueFactor[] = [];
    let totalPenalty = 0;

    const consecutiveNights = this.countConsecutiveNights(assignments, targetDate);
    if (consecutiveNights > 0) {
      const penalty = consecutiveNights * FATIGUE_COEFFICIENTS.consecutiveNightPenalty;
      factors.push({
        type: 'consecutive_nights',
        contribution: penalty,
        description: `${consecutiveNights} ardışık gece vardiyası`,
      });
      totalPenalty += penalty;
    }

    const isWeekend = this.isWeekend(targetDate);
    if (isWeekend) {
      const weekendShifts = this.countWeekendShifts(assignments, targetDate);
      if (weekendShifts > 0) {
        const penalty = FATIGUE_COEFFICIENTS.weekendShiftPenalty * (weekendShifts + 1);
        factors.push({
          type: 'weekend_work',
          contribution: penalty,
          description: `${this.getDayName(targetDate)} günü çalışma`,
        });
        totalPenalty += penalty;
      }
    }

    const isHoliday = this.isHoliday(targetDate);
    if (isHoliday) {
      const holiday = TURKISH_HOLIDAYS_2026.find((h) => h.date === targetDate);
      const penalty = FATIGUE_COEFFICIENTS.holidayShiftPenalty;
      factors.push({
        type: 'holiday_work',
        contribution: penalty,
        description: `${holiday?.name || 'Tatil'} günü çalışma`,
      });
      totalPenalty += penalty;
    }

    const shortRestHours = this.getLastRestHours(assignments, targetDate, personnel.id);
    if (shortRestHours < WORKLOAD_LIMITS.minRecoveryHoursAfterNight) {
      const penalty =
        shortRestHours < 11
          ? FATIGUE_COEFFICIENTS.shortRestPenalty
          : FATIGUE_COEFFICIENTS.shortRestPenalty * 0.5;
      factors.push({
        type: 'short_rest',
        contribution: penalty,
        description: `Yetersiz dinlenme (${shortRestHours.toFixed(1)} saat)`,
      });
      totalPenalty += penalty;
    }

    const consecutiveDays = this.countConsecutiveWorkDays(assignments, targetDate, personnel.id);
    if (consecutiveDays > WORKLOAD_LIMITS.maxConsecutiveDays) {
      const penalty =
        FATIGUE_COEFFICIENTS.consecutiveDaysPenalty *
        (consecutiveDays - WORKLOAD_LIMITS.maxConsecutiveDays);
      factors.push({
        type: 'consecutive_days',
        contribution: penalty,
        description: `${consecutiveDays} ardışık çalışma günü`,
      });
      totalPenalty += penalty;
    }

    const weeklyHours = this.calculateWeeklyHours(assignments, targetDate, personnel.id);
    if (weeklyHours > 40) {
      const overtimeHours = weeklyHours - 40;
      const penalty = Math.min(overtimeHours * FATIGUE_COEFFICIENTS.overtimePenalty, 0.2);
      factors.push({
        type: 'overtime',
        contribution: penalty,
        description: `${weeklyHours.toFixed(0)} saat haftalık çalışma (${overtimeHours.toFixed(0)} saat fazla mesai)`,
      });
      totalPenalty += penalty;
    }

    const overall = Math.max(0, Math.min(100, 100 - totalPenalty * 100));
    const riskLevel = this.getRiskLevel(overall, factors);
    const recommendation = this.getRecommendation(overall, riskLevel, factors);

    return { overall, riskLevel, factors, recommendation };
  }

  calculatePersonnelFatigueProfile(
    assignments: ShiftAssignment[],
    personnel: Personnel,
  ): PersonnelFatigueProfile {
    const today = new Date().toISOString().split('T')[0];
    const currentScore = this.calculateFatigueScore(assignments, personnel, today);

    const weeklyAssignments = this.getWeekAssignments(assignments, today);
    const weeklyScore = this.calculateWeeklyFatigueScore(weeklyAssignments, personnel);

    const monthlyAssignments = this.getMonthAssignments(assignments, today);
    const monthlyScore = this.calculateMonthlyFatigueScore(monthlyAssignments, personnel);

    const riskFlags = this.identifyRiskFlags(assignments, personnel, today);

    const recommendations = this.generateRecommendations(personnel, currentScore);

    return {
      personnelId: personnel.id,
      currentFatigue: currentScore.overall,
      weeklyFatigue: weeklyScore,
      monthlyFatigue: monthlyScore,
      riskFlags,
      recommendedAssignments: recommendations,
    };
  }

  private countConsecutiveNights(assignments: ShiftAssignment[], targetDate: string): number {
    const personAssignments = assignments.filter((a) => a.shiftType === ShiftTypeEnum.NIGHT);
    if (personAssignments.length === 0) return 0;

    const sortedDates = personAssignments
      .map((a) => a.date)
      .sort()
      .reverse();

    const target = new Date(targetDate);
    let consecutive = 0;
    let currentDate = new Date(target);

    for (const dateStr of sortedDates) {
      const date = new Date(dateStr);
      const diffDays = Math.floor((currentDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 0 || diffDays === 1) {
        consecutive++;
        currentDate = date;
      } else {
        break;
      }
    }

    return consecutive;
  }

  private countWeekendShifts(assignments: ShiftAssignment[], currentDate: string): number {
    const weekStart = this.getWeekStart(currentDate);
    const weekEnd = this.addDays(weekStart, 7);

    return assignments.filter((a) => {
      const date = new Date(a.date);
      const day = date.getDay();
      return (day === 0 || day === 6) && a.date >= weekStart && a.date < weekEnd;
    }).length;
  }

  private getLastRestHours(
    assignments: ShiftAssignment[],
    currentDate: string,
    personnelId: string,
  ): number {
    const sortedAssignments = assignments
      .filter((a) => a.personnelId === personnelId && a.date < currentDate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (sortedAssignments.length === 0) return 48;

    const lastAssignment = sortedAssignments[0];
    const lastEndDateTime = new Date(`${lastAssignment.date}T${lastAssignment.endTime}:00`);
    const currentDateTime = new Date(`${currentDate}T08:00:00`);

    const diffMs = currentDateTime.getTime() - lastEndDateTime.getTime();
    return diffMs / (1000 * 60 * 60);
  }

  private countConsecutiveWorkDays(
    assignments: ShiftAssignment[],
    targetDate: string,
    personnelId: string,
  ): number {
    const sortedAssignments = assignments
      .filter((a) => a.personnelId === personnelId && a.date <= targetDate)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (sortedAssignments.length === 0) return 0;

    let consecutive = 1;
    let currentDate = new Date(sortedAssignments[0].date);

    for (let i = 1; i < sortedAssignments.length; i++) {
      const assignmentDate = new Date(sortedAssignments[i].date);
      const diffDays = Math.floor(
        (currentDate.getTime() - assignmentDate.getTime()) / (1000 * 60 * 60 * 24),
      );

      if (diffDays === 1) {
        consecutive++;
        currentDate = assignmentDate;
      } else {
        break;
      }
    }

    return consecutive;
  }

  private calculateWeeklyHours(
    assignments: ShiftAssignment[],
    targetDate: string,
    personnelId: string,
  ): number {
    const weekStart = this.getWeekStart(targetDate);
    const weekEnd = this.addDays(weekStart, 7);

    const weekAssignments = assignments.filter(
      (a) => a.personnelId === personnelId && a.date >= weekStart && a.date < weekEnd,
    );

    return weekAssignments.reduce((total, a) => {
      const startHour = this.parseTime(a.startTime);
      let endHour = this.parseTime(a.endTime);
      if (endHour <= startHour) endHour += 24;
      return total + (endHour - startHour);
    }, 0);
  }

  private calculateWeeklyFatigueScore(
    assignments: ShiftAssignment[],
    personnel: Personnel,
  ): number {
    if (assignments.length === 0) return 100;

    const nightCount = assignments.filter((a) => a.shiftType === ShiftTypeEnum.NIGHT).length;
    const weekendCount = assignments.filter((a) => {
      const date = new Date(a.date);
      return date.getDay() === 0 || date.getDay() === 6;
    }).length;

    const score = 100 - nightCount * 15 - weekendCount * 8;
    return Math.max(0, Math.min(100, score));
  }

  private calculateMonthlyFatigueScore(
    assignments: ShiftAssignment[],
    personnel: Personnel,
  ): number {
    if (assignments.length === 0) return 100;

    const nightCount = assignments.filter((a) => a.shiftType === ShiftTypeEnum.NIGHT).length;
    const holidayCount = assignments.filter((a) =>
      TURKISH_HOLIDAYS_2026.some((h) => h.date === a.date),
    ).length;

    const score = 100 - nightCount * 8 - holidayCount * 10;
    return Math.max(0, Math.min(100, score));
  }

  private identifyRiskFlags(
    assignments: ShiftAssignment[],
    personnel: Personnel,
    currentDate: string,
  ): string[] {
    const flags: string[] = [];

    const consecutiveNights = this.countConsecutiveNights(assignments, currentDate);
    if (consecutiveNights >= 2) {
      flags.push('high_consecutive_nights');
    }

    const weeklyHours = this.calculateWeeklyHours(assignments, currentDate, personnel.id);
    if (weeklyHours > 45) {
      flags.push('overtime_violation');
    }

    const consecutiveDays = this.countConsecutiveWorkDays(assignments, currentDate, personnel.id);
    if (consecutiveDays > 6) {
      flags.push('consecutive_days_exceeded');
    }

    const lastRest = this.getLastRestHours(assignments, currentDate, personnel.id);
    if (lastRest < 11) {
      flags.push('rest_violation');
    }

    return flags;
  }

  private generateRecommendations(
    personnel: Personnel,
    currentScore: FatigueScore,
  ): AssignmentRecommendation[] {
    const recommendations: AssignmentRecommendation[] = [];

    if (currentScore.riskLevel === 'critical' || currentScore.riskLevel === 'high') {
      recommendations.push({
        shiftType: ShiftTypeEnum.DAY,
        score: 10,
        reason: 'Yorgunluk yüksek - gündüz vardiyası önerilir',
        priority: 1,
      });
      recommendations.push({
        shiftType: ShiftTypeEnum.NIGHT,
        score: 0,
        reason: 'Gece vardiyası riskli - uygun değil',
        priority: 1,
      });
    } else if (currentScore.riskLevel === 'medium') {
      recommendations.push({
        shiftType: ShiftTypeEnum.DAY,
        score: 80,
        reason: 'Gündüz vardiyası uygun',
        priority: 1,
      });
      recommendations.push({
        shiftType: ShiftTypeEnum.NIGHT,
        score: 40,
        reason: 'Dikkatli değerlendirme gerekli',
        priority: 2,
      });
    } else {
      recommendations.push({
        shiftType: ShiftTypeEnum.DAY,
        score: 90,
        reason: 'Gündüz vardiyası ideal',
        priority: 1,
      });
      recommendations.push({
        shiftType: ShiftTypeEnum.NIGHT,
        score: 70,
        reason: 'Gece vardiyası uygun',
        priority: 2,
      });
    }

    recommendations.push({
      shiftType: ShiftTypeEnum.EVENING,
      score: 60,
      reason: 'Akşam vardiyası orta riskli',
      priority: 3,
    });

    return recommendations.sort((a, b) => b.score - a.score);
  }

  private getRiskLevel(
    overall: number,
    factors: FatigueFactor[],
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (overall < 30 || factors.some((f) => f.type === 'short_rest')) {
      return 'critical';
    }
    if (
      overall < 50 ||
      factors.some((f) => f.type === 'consecutive_nights' && f.contribution > 0.2)
    ) {
      return 'high';
    }
    if (overall < 70) {
      return 'medium';
    }
    return 'low';
  }

  private getRecommendation(overall: number, riskLevel: string, factors: FatigueFactor[]): string {
    if (riskLevel === 'critical') {
      return 'Kritik yorgunluk! Bu personele atama yapılmamalı. Dinlenme süresi tanımlayın.';
    }
    if (riskLevel === 'high') {
      return 'Yüksek risk! Sadece zorunlu durumlarda atama yapın. Recovery günü planlayın.';
    }
    if (riskLevel === 'medium') {
      return 'Orta risk. Atama yapılabilir ama recovery günü planlayın.';
    }
    return 'Düşük risk. Atama için uygun.';
  }

  private isWeekend(dateStr: string): boolean {
    const date = new Date(dateStr);
    const day = date.getDay();
    return day === 0 || day === 6;
  }

  private isHoliday(dateStr: string): boolean {
    return TURKISH_HOLIDAYS_2026.some((h) => h.date === dateStr);
  }

  private isNationalHoliday(dateStr: string): boolean {
    return TURKISH_HOLIDAYS_2026.some((h) => h.date === dateStr && h.type === 'national');
  }

  private getDayName(dateStr: string): string {
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return days[new Date(dateStr).getDay()];
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

  private getWeekAssignments(
    assignments: ShiftAssignment[],
    currentDate: string,
  ): ShiftAssignment[] {
    const weekStart = this.getWeekStart(currentDate);
    const weekEnd = this.addDays(weekStart, 7);
    return assignments.filter((a) => a.date >= weekStart && a.date < weekEnd);
  }

  private getMonthAssignments(
    assignments: ShiftAssignment[],
    currentDate: string,
  ): ShiftAssignment[] {
    const current = new Date(currentDate);
    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    return assignments.filter((a) => a.date >= monthStart && a.date <= monthEnd);
  }

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours + minutes / 60;
  }
}
