import { Injectable } from '@angular/core';
import type {
  Constraint,
  ShiftAssignment,
  Personnel,
  Device,
  ValidationResult,
  UnitType,
} from '../../domain';
import {
  CONSTRAINT_RULES,
  SCHEDULING_PRIORITY_MATRIX,
  SHIFT_CONSECUTIVE_NIGHT_LIMITS,
  RADIATION_DOSE_THRESHOLDS,
  FATIGUE_COEFFICIENTS,
  WORKLOAD_LIMITS,
} from '../../domain/rules/scheduling-constraints';
import { ShiftTypeEnum, DeviceModeEnum, UnitTypeEnum } from '../../domain/enums';
import { FatigueEngineService, FatigueScore } from './fatigue-engine.service';

export interface ConstraintViolation {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: 'critical' | 'hard' | 'soft' | 'warning';
  priority: number;
  category: string;
  canOverride: boolean;
  overrideRequiresRole?: string[];
}

export interface AssignmentValidationContext {
  assignment: ShiftAssignment;
  existingAssignments: ShiftAssignment[];
  personnel: Personnel;
  device: Device;
  unit: UnitType;
  date: string;
}

@Injectable({ providedIn: 'root' })
export class ComprehensiveConstraintValidatorService {
  constructor(private fatigueEngine: FatigueEngineService) {}

  validateAssignment(context: AssignmentValidationContext): {
    result: ValidationResult;
    violations: ConstraintViolation[];
    fatigueScore: FatigueScore;
    recommendations: string[];
  } {
    const violations: ConstraintViolation[] = [];
    const recommendations: string[] = [];

    const personnelAssignments = context.existingAssignments.filter(
      (a) => a.personnelId === context.personnel.id,
    );

    const fatigueScore = this.fatigueEngine.calculateFatigueScore(
      [...personnelAssignments, context.assignment],
      context.personnel,
      context.date,
    );

    this.checkWorkLawRules(context, personnelAssignments, violations);

    this.checkShiftRules(context, violations);

    this.checkUnitSpecificRules(context, violations);

    this.checkPersonnelProtectionRules(context, violations);

    this.checkRadiationRules(context, violations);

    const sortedViolations = violations.sort((a, b) => a.priority - b.priority);

    const hardViolations = sortedViolations.filter(
      (v) => v.severity === 'critical' || v.severity === 'hard',
    );
    const softViolations = sortedViolations.filter((v) => v.severity === 'soft');
    const warnings = sortedViolations.filter((v) => v.severity === 'warning');

    if (fatigueScore.riskLevel === 'critical') {
      hardViolations.push({
        ruleId: 'FATIGUE-001',
        ruleName: 'Kritik Yorgunluk',
        message: `Yorgunluk skoru: ${fatigueScore.overall.toFixed(0)}/100 - ${fatigueScore.recommendation}`,
        severity: 'critical',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    } else if (fatigueScore.riskLevel === 'high') {
      softViolations.push({
        ruleId: 'FATIGUE-002',
        ruleName: 'Yüksek Yorgunluk Riski',
        message: `Yorgunluk skoru: ${fatigueScore.overall.toFixed(0)}/100 - ${fatigueScore.recommendation}`,
        severity: 'soft',
        priority: 3,
        category: 'Dinlenme Süresi',
        canOverride: true,
        overrideRequiresRole: ['hospital_admin', 'supervisor'],
      });
    }

    for (const factor of fatigueScore.factors) {
      if (factor.contribution > 0.1) {
        recommendations.push(factor.description);
      }
    }

    const errors: Constraint[] = hardViolations.map((v) => ({
      type: v.ruleId as any,
      message: v.message,
      severity: 'error' as const,
      affectedAssignments: [context.assignment.id],
    }));

    const warningsResult: Constraint[] = [
      ...softViolations.map((v) => ({
        type: v.ruleId as any,
        message: v.message,
        severity: 'warning' as const,
        affectedAssignments: [context.assignment.id],
      })),
      ...warnings.map((v) => ({
        type: v.ruleId as any,
        message: v.message,
        severity: 'warning' as const,
        affectedAssignments: [context.assignment.id],
      })),
    ];

    let score = 100;
    score -= hardViolations.length * 30;
    score -= softViolations.length * 10;
    score -= warnings.length * 5;
    score = Math.max(0, Math.min(100, score));

    return {
      result: {
        isValid: hardViolations.length === 0,
        errors,
        warnings: warningsResult,
        score,
      },
      violations: sortedViolations,
      fatigueScore,
      recommendations,
    };
  }

  private checkWorkLawRules(
    context: AssignmentValidationContext,
    personnelAssignments: ShiftAssignment[],
    violations: ConstraintViolation[],
  ): void {
    const today = new Date().toISOString().split('T')[0];

    const weeklyAssignments = this.getWeekAssignments(personnelAssignments, today);
    const weeklyHours = this.calculateTotalHours(weeklyAssignments);
    const newShiftHours = this.calculateShiftHours(context.assignment);

    if (weeklyHours + newShiftHours > CONSTRAINT_RULES.WORK_LAW.WRK001.maxHours) {
      violations.push({
        ruleId: 'WRK001',
        ruleName: 'Haftalık Çalışma Süresi',
        message: `Haftalık çalışma ${CONSTRAINT_RULES.WORK_LAW.WRK001.maxHours} saat limitini aşacak (mevcut: ${weeklyHours.toFixed(1)}h + yeni: ${newShiftHours.toFixed(1)}h)`,
        severity: 'hard',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }

    const sameDayAssignments = personnelAssignments.filter((a) => a.date === context.date);
    if (sameDayAssignments.length > 0) {
      violations.push({
        ruleId: 'WRK005',
        ruleName: 'Aynı Gün Çift Vardiya',
        message: 'Aynı gün içinde zaten vardiya atanmış. Aynı gün iki vardiyada çalışma yasaktır.',
        severity: 'critical',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }

    const lastAssignment = this.getLastAssignment(personnelAssignments);
    if (lastAssignment) {
      const restHours = this.calculateRestHours(lastAssignment, context.assignment);
      if (restHours < CONSTRAINT_RULES.WORK_LAW.WRK003.minRestHours) {
        violations.push({
          ruleId: 'WRK003',
          ruleName: 'Vardiyalar Arası Dinlenme',
          message: `Vardiyalar arası dinlenme süresi ${CONSTRAINT_RULES.WORK_LAW.WRK003.minRestHours} saatten az (${restHours.toFixed(1)} saat)`,
          severity: 'critical',
          priority: 1,
          category: 'Yasal Uygunluk',
          canOverride: false,
        });
      }
    }
  }

  private checkShiftRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { assignment, existingAssignments, personnel } = context;

    const dayAfter = this.addDays(assignment.date, 1);
    const dayBefore = this.addDays(assignment.date, -1);

    const previousDayNight = existingAssignments.find(
      (a) =>
        a.personnelId === personnel.id &&
        a.date === dayBefore &&
        a.shiftType === ShiftTypeEnum.NIGHT,
    );

    if (assignment.shiftType === ShiftTypeEnum.DAY && previousDayNight) {
      violations.push({
        ruleId: 'SHIFT002',
        ruleName: 'Gece → Aynı Gündüz Kesin Yasak',
        message: 'Gece vardiyası sonrası ertesi gün gündüz çalışma kesinlikle yasaktır.',
        severity: 'critical',
        priority: 2,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    }

    if (assignment.shiftType === ShiftTypeEnum.NIGHT && previousDayNight) {
      violations.push({
        ruleId: 'SHIFT004',
        ruleName: 'Ardışık Gece Uyarısı',
        message: `${this.countConsecutiveNights(existingAssignments, personnel.id, assignment.date)} ardışık gece vardiyası. Önerilen recovery süresi 24 saat.`,
        severity: 'soft',
        priority: 3,
        category: 'Dinlenme Süresi',
        canOverride: true,
        overrideRequiresRole: ['hospital_admin', 'supervisor'],
      });
    }
  }

  private checkUnitSpecificRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { assignment, existingAssignments, personnel, unit } = context;

    switch (unit) {
      case UnitTypeEnum.MR:
        this.checkMRRules(context, violations);
        break;

      case UnitTypeEnum.BT:
      case UnitTypeEnum.RONTGEN:
        this.checkRadiationUnitRules(context, violations);
        break;

      case UnitTypeEnum.NUKLEER:
        this.checkNukleerTipRules(context, violations);
        break;
    }
  }

  private checkMRRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { existingAssignments, personnel, assignment } = context;

    const consecutiveNights = this.countConsecutiveNights(
      existingAssignments,
      personnel.id,
      assignment.date,
    );
    const maxConsecutive = SHIFT_CONSECUTIVE_NIGHT_LIMITS.mr.max;

    if (assignment.shiftType === ShiftTypeEnum.NIGHT && consecutiveNights >= maxConsecutive) {
      violations.push({
        ruleId: 'MR001',
        ruleName: 'MR Max Ardışık Gece',
        message: `MR bölümünde maksimum ${maxConsecutive} ardışık gece vardiyası limiti aşıldı.`,
        severity: 'hard',
        priority: 3,
        category: 'Dinlenme Süresi',
        canOverride: true,
        overrideRequiresRole: ['admin'],
      });
    }

    const weekStart = this.getWeekStart(assignment.date);
    const weekEnd = this.addDays(weekStart, 7);
    const weeklyShifts = existingAssignments.filter(
      (a) => a.personnelId === personnel.id && a.date >= weekStart && a.date < weekEnd,
    ).length;

    if (weeklyShifts >= CONSTRAINT_RULES.MR_UNIT.MR002.maxShiftsPerWeek) {
      violations.push({
        ruleId: 'MR002',
        ruleName: 'MR Haftalık Max Vardiya',
        message: `MR bölümünde haftalık ${CONSTRAINT_RULES.MR_UNIT.MR002.maxShiftsPerWeek} vardiya limitine ulaşıldı.`,
        severity: 'hard',
        priority: 3,
        category: 'Dinlenme Süresi',
        canOverride: true,
        overrideRequiresRole: ['hospital_admin', 'supervisor'],
      });
    }
  }

  private checkRadiationUnitRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { assignment, existingAssignments, personnel } = context;

    if (!personnel.skills.includes('radyasyon_sertifika')) {
      violations.push({
        ruleId: 'RAD001',
        ruleName: 'Dozimetre Taşıma Zorunluluğu',
        message: 'Personelin radyasyon sertifikası bulunmuyor. BT/Röntgen birimlerinde çalışamaz.',
        severity: 'hard',
        priority: 2,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    }

    const consecutiveNights = this.countConsecutiveNights(
      existingAssignments,
      personnel.id,
      assignment.date,
    );
    const maxConsecutive = SHIFT_CONSECUTIVE_NIGHT_LIMITS.bt.max;

    if (assignment.shiftType === ShiftTypeEnum.NIGHT && consecutiveNights >= maxConsecutive) {
      violations.push({
        ruleId: 'RAD006',
        ruleName: 'Ardışık Gece Limit',
        message: `BT/Röntgen için maksimum ${maxConsecutive} ardışık gece limiti aşıldı.`,
        severity: 'hard',
        priority: 3,
        category: 'Radyasyon Güvenliği',
        canOverride: true,
        overrideRequiresRole: ['admin'],
      });
    }
  }

  private checkNukleerTipRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { assignment, existingAssignments, personnel } = context;

    if (
      assignment.shiftType === ShiftTypeEnum.NIGHT ||
      assignment.shiftType === ShiftTypeEnum.EVENING
    ) {
      violations.push({
        ruleId: 'NUC003',
        ruleName: 'Gece Vardiyası Yok',
        message: "Nükleer Tıp'ta gece/akşam vardiyası bulunmaz. Sadece gündüz vardiyası mevcuttur.",
        severity: 'critical',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }

    const consecutiveDays = this.countConsecutiveWorkDays(
      existingAssignments,
      personnel.id,
      assignment.date,
    );
    if (consecutiveDays >= CONSTRAINT_RULES.NUKLEER_TIP.NUC001.maxConsecutiveDays) {
      violations.push({
        ruleId: 'NUC001',
        ruleName: 'Ardışık Çalışma Gün Limiti',
        message: `Nükleer Tıp'ta maksimum ${CONSTRAINT_RULES.NUKLEER_TIP.NUC001.maxConsecutiveDays} ardışık gün çalışma limiti.`,
        severity: 'hard',
        priority: 2,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    }

    const fridayAssignment = existingAssignments.find((a) => {
      const date = new Date(a.date);
      return date.getDay() === 5 && a.personnelId === personnel.id;
    });

    if (fridayAssignment && this.getDayOfWeek(assignment.date) === 0) {
      violations.push({
        ruleId: 'NUC002',
        ruleName: 'Cumartesi-Pazar Kuralı',
        message: 'Cumartesi çalışma sonrası Pazar günü tamamen serbest olmalı.',
        severity: 'hard',
        priority: 2,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    }

    const restHours = this.calculateRestHours(
      this.getLastAssignment(existingAssignments.filter((a) => a.personnelId === personnel.id))!,
      assignment,
    );

    if (restHours < CONSTRAINT_RULES.NUKLEER_TIP.NUC004.minRestHours) {
      violations.push({
        ruleId: 'NUC004',
        ruleName: 'Min Dinlenme Süresi',
        message: `Nükleer Tıp için minimum ${CONSTRAINT_RULES.NUKLEER_TIP.NUC004.minRestHours} saat dinlenme gerekli (mevcut: ${restHours.toFixed(1)} saat)`,
        severity: 'hard',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }

    if (!personnel.skills.includes('nukleer_lisans')) {
      violations.push({
        ruleId: 'NUC006',
        ruleName: 'Radyoaktif Materyal Erişimi',
        message: 'Personelin Nükleer Tıp lisansı bulunmuyor.',
        severity: 'critical',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }
  }

  private checkPersonnelProtectionRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { personnel, unit } = context;

    if (unit !== UnitTypeEnum.MR) {
      if (personnel.preferences?.isPregnant) {
        violations.push({
          ruleId: 'PROT001',
          ruleName: 'Hamile Personel Koruması',
          message: 'Hamile personel radyasyonlu birimlerden çıkarılmalıdır.',
          severity: 'critical',
          priority: 1,
          category: 'Yasal Uygunluk',
          canOverride: false,
        });
      }
    }

    const age = this.calculateAge(personnel.id);
    if (age !== null && age < 18) {
      violations.push({
        ruleId: 'PROT002',
        ruleName: '18 Yaş Altı Yasağı',
        message: '18 yaşından küçük personel radyasyonlu birimlerde çalışamaz.',
        severity: 'critical',
        priority: 1,
        category: 'Yasal Uygunluk',
        canOverride: false,
      });
    }

    if (!personnel.skills.includes('dosimetre_teslim')) {
      violations.push({
        ruleId: 'PROT003',
        ruleName: 'Dozimetre Teslim Zorunluluğu',
        message: 'Dozimetre teslim etmeyen personele atama yapılamaz.',
        severity: 'hard',
        priority: 2,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    }
  }

  private checkRadiationRules(
    context: AssignmentValidationContext,
    violations: ConstraintViolation[],
  ): void {
    const { assignment, personnel, unit } = context;

    if (unit !== UnitTypeEnum.BT && unit !== UnitTypeEnum.RONTGEN) {
      return;
    }

    const monthlyDose = personnel.preferences?.monthlyDose || 0;

    if (monthlyDose >= RADIATION_DOSE_THRESHOLDS.monthly90) {
      violations.push({
        ruleId: 'RAD004',
        ruleName: 'Doz Eşiği - Kritik Uyarı',
        message: `Aylık doz ${RADIATION_DOSE_THRESHOLDS.monthly90}mSv üzerinde. Sadece gündüz vardiyası.`,
        severity: 'critical',
        priority: 1,
        category: 'Radyasyon Güvenliği',
        canOverride: false,
      });
    } else if (monthlyDose >= RADIATION_DOSE_THRESHOLDS.monthly80) {
      if (assignment.shiftType === ShiftTypeEnum.NIGHT) {
        violations.push({
          ruleId: 'RAD003',
          ruleName: 'Doz Eşiği - Vardiya Azaltımı',
          message: `Aylık doz ${RADIATION_DOSE_THRESHOLDS.monthly80}mSv üzerinde. Gece vardiyası riskli.`,
          severity: 'hard',
          priority: 2,
          category: 'Radyasyon Güvenliği',
          canOverride: true,
          overrideRequiresRole: ['hospital_admin', 'supervisor'],
        });
      }
    }
  }

  private getWeekAssignments(
    assignments: ShiftAssignment[],
    currentDate: string,
  ): ShiftAssignment[] {
    const weekStart = this.getWeekStart(currentDate);
    const weekEnd = this.addDays(weekStart, 7);
    return assignments.filter((a) => a.date >= weekStart && a.date < weekEnd);
  }

  private calculateTotalHours(assignments: ShiftAssignment[]): number {
    return assignments.reduce((total, a) => total + this.calculateShiftHours(a), 0);
  }

  private calculateShiftHours(assignment: ShiftAssignment): number {
    const startHour = this.parseTime(assignment.startTime);
    let endHour = this.parseTime(assignment.endTime);
    if (endHour <= startHour) endHour += 24;
    return endHour - startHour;
  }

  private calculateRestHours(
    lastAssignment: ShiftAssignment,
    newAssignment: ShiftAssignment,
  ): number {
    const lastEnd = new Date(`${lastAssignment.date}T${lastAssignment.endTime}:00`);
    const newStart = new Date(`${newAssignment.date}T${newAssignment.startTime}:00`);
    return (newStart.getTime() - lastEnd.getTime()) / (1000 * 60 * 60);
  }

  private getLastAssignment(assignments: ShiftAssignment[]): ShiftAssignment | null {
    if (assignments.length === 0) return null;
    return assignments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }

  private countConsecutiveNights(
    assignments: ShiftAssignment[],
    personnelId: string,
    targetDate: string,
  ): number {
    const nightAssignments = assignments.filter(
      (a) => a.personnelId === personnelId && a.shiftType === ShiftTypeEnum.NIGHT,
    );

    const sortedDates = nightAssignments
      .map((a) => a.date)
      .sort()
      .reverse();

    const target = new Date(targetDate);
    let consecutive = 1;
    let currentDate = new Date(target);

    for (const dateStr of sortedDates) {
      if (dateStr === targetDate) continue;

      const date = new Date(dateStr);
      const diffDays = Math.floor((currentDate.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        consecutive++;
        currentDate = date;
      } else {
        break;
      }
    }

    return consecutive;
  }

  private countConsecutiveWorkDays(
    assignments: ShiftAssignment[],
    personnelId: string,
    targetDate: string,
  ): number {
    const sortedAssignments = assignments
      .filter((a) => a.personnelId === personnelId)
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

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(':').map(Number);
    return hours + minutes / 60;
  }

  private getDayOfWeek(dateStr: string): number {
    return new Date(dateStr).getDay();
  }

  private calculateAge(personnelId: string): number | null {
    return null;
  }
}
