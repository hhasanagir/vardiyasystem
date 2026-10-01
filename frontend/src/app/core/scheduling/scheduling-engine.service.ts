import { Injectable, computed, signal, effect } from '@angular/core';
import type {
  Schedule,
  ShiftAssignment,
  Personnel,
  Device,
  Conflict,
  FairnessMetrics,
  UnitType,
  ShiftType,
  ValidationResult,
  ScheduleGenerationOptions,
} from '../../domain';
import { UnitTypeEnum, ShiftTypeEnum } from '../../domain/enums';
import { ConstraintValidatorService } from './constraint-validator.service';
import { ConflictDetectorService } from './conflict-detector.service';
import { FairnessBalancerService } from './fairness-balancer.service';
import { ScheduleGeneratorService } from './schedule-generator.service';

@Injectable({ providedIn: 'root' })
export class SchedulingEngineService {
  private readonly _schedules = signal<Map<string, Schedule>>(new Map());
  private readonly _selectedSchedule = signal<Schedule | null>(null);
  private readonly _conflicts = signal<Conflict[]>([]);
  private readonly _fairnessMetrics = signal<FairnessMetrics | null>(null);
  private readonly _isGenerating = signal(false);
  private readonly _lastValidation = signal<ValidationResult | null>(null);

  readonly schedules = this._schedules.asReadonly();
  readonly selectedSchedule = this._selectedSchedule.asReadonly();
  readonly conflicts = this._conflicts.asReadonly();
  readonly fairnessMetrics = this._fairnessMetrics.asReadonly();
  readonly isGenerating = this._isGenerating.asReadonly();
  readonly lastValidation = this._lastValidation.asReadonly();

  readonly isValid = computed(() => {
    const conflicts = this._conflicts();
    return !conflicts.some((c) => c.severity === 'critical' || c.severity === 'high');
  });

  readonly criticalConflicts = computed(() =>
    this._conflicts().filter((c) => c.severity === 'critical' || c.severity === 'high'),
  );

  readonly warnings = computed(() =>
    this._conflicts().filter((c) => c.severity === 'medium' || c.severity === 'low'),
  );

  constructor(
    private constraintValidator: ConstraintValidatorService,
    private conflictDetector: ConflictDetectorService,
    private fairnessBalancer: FairnessBalancerService,
    private scheduleGenerator: ScheduleGeneratorService,
  ) {}

  loadSchedule(schedule: Schedule): void {
    const schedules = new Map(this._schedules());
    schedules.set(schedule.id, schedule);
    this._schedules.set(schedules);
    this._selectedSchedule.set(schedule);
    this.analyzeSchedule(schedule);
  }

  addAssignment(
    assignment: ShiftAssignment,
    personnel: Personnel[],
    devices: Device[],
  ): ValidationResult {
    const schedule = this._selectedSchedule();
    if (!schedule) {
      return { isValid: false, errors: [], warnings: [], score: 0 };
    }

    const personnelData = personnel.find((p) => p.id === assignment.personnelId);
    const deviceData = devices.find((d) => d.id === assignment.deviceId);

    if (!personnelData || !deviceData) {
      return { isValid: false, errors: [], warnings: [], score: 0 };
    }

    const validation = this.constraintValidator.validateAssignment(
      assignment,
      schedule.assignments,
      personnelData,
      deviceData,
    );

    if (validation.isValid) {
      const updatedSchedule: Schedule = {
        ...schedule,
        assignments: [...schedule.assignments, assignment],
        updatedAt: new Date(),
      };

      this.loadSchedule(updatedSchedule);
    }

    this._lastValidation.set(validation);
    return validation;
  }

  removeAssignment(assignmentId: string): void {
    const schedule = this._selectedSchedule();
    if (!schedule) return;

    const updatedSchedule: Schedule = {
      ...schedule,
      assignments: schedule.assignments.filter((a) => a.id !== assignmentId),
      updatedAt: new Date(),
    };

    this.loadSchedule(updatedSchedule);
  }

  generateSchedule(
    unit: UnitType,
    month: number,
    year: number,
    personnel: Personnel[],
    devices: Device[],
    options: ScheduleGenerationOptions = {},
  ): Schedule {
    this._isGenerating.set(true);

    try {
      const schedule = this.scheduleGenerator.generateSchedule(
        unit,
        month,
        year,
        personnel,
        devices,
        options,
      );

      this.loadSchedule(schedule);
      return schedule;
    } finally {
      this._isGenerating.set(false);
    }
  }

  rebalanceSchedule(): Schedule | null {
    const schedule = this._selectedSchedule();
    if (!schedule) return null;

    const metrics = this._fairnessMetrics();
    if (metrics && metrics.overallScore >= 0.8) {
      return schedule;
    }

    return schedule;
  }

  private analyzeSchedule(schedule: Schedule): void {
    const result = this.conflictDetector.detectConflicts(schedule.assignments, [], []);

    this._conflicts.set(result.conflicts);

    const metrics = this.fairnessBalancer.calculateFairnessMetrics(schedule.assignments, []);

    this._fairnessMetrics.set(metrics);
  }

  getScheduleByUnitMonthYear(unit: UnitType, month: number, year: number): Schedule | undefined {
    const key = `schedule-${unit}-${month}-${year}`;
    return this._schedules().get(key);
  }

  clearSchedules(): void {
    this._schedules.set(new Map());
    this._selectedSchedule.set(null);
    this._conflicts.set([]);
    this._fairnessMetrics.set(null);
  }
}
