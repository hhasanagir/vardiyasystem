import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { Assignment } from './domain/entities/assignment.entity';
import { AssignmentCollection } from './domain/entities/assignment-collection';
import {
  ConstraintEngine,
  ValidationReport,
  PersonnelLookup,
  DeviceLookup,
  ShiftTemplateLookup,
  GroupLookup,
  PersonnelInfo,
  DeviceInfo,
  ShiftTemplateInfo,
  GroupInfo,
} from './domain/constraints';
import { Conflict, ConflictCode, ConflictSeverity, createConflict } from './domain/models/conflict';
import { ValidationResult, createEmptyValidationResult, addHardViolation, addSoftViolation, addWarning, finalizeValidation } from './domain/models/validation-result';
import { ViolationRule } from './domain/constraints/constraint.interface';
import { PersonnelAvailabilityService } from './services/personnel-availability.service';
import { ScheduleCoverageService } from './services/schedule-coverage.service';

const VIOLATION_RULE_TO_CONFLICT_CODE: Record<ViolationRule, ConflictCode> = {
  PERSONNEL_NOT_FOUND: ConflictCode.RULE_VIOLATION,
  DEVICE_REQUIRED: ConflictCode.RULE_VIOLATION,
  DEVICE_BOOKED: ConflictCode.DEVICE_OVERLAP,
  PERSON_DEVICE_NOT_ALLOWED: ConflictCode.RULE_VIOLATION,
  PERSONNEL_NOT_IN_UNIT: ConflictCode.RULE_VIOLATION,
  PERSONNEL_NOT_IN_GROUP: ConflictCode.RULE_VIOLATION,
  GROUP_NOT_FOUND: ConflictCode.RULE_VIOLATION,
  GROUP_NOT_IN_UNIT: ConflictCode.RULE_VIOLATION,
  TEMPLATE_NOT_FOUND: ConflictCode.RULE_VIOLATION,
  TEMPLATE_NOT_IN_GROUP: ConflictCode.RULE_VIOLATION,
  TEMPLATE_NOT_IN_UNIT: ConflictCode.RULE_VIOLATION,
  TEMPLATE_SHIFT_MISMATCH: ConflictCode.RULE_VIOLATION,
  GROUP_SLOT_OCCUPIED: ConflictCode.DEVICE_OVERLAP,
  SAME_SLOT: ConflictCode.PERSON_OVERLAP,
  TIME_OVERLAP: ConflictCode.PERSON_OVERLAP,
  INACTIVE_PERSONNEL: ConflictCode.RULE_VIOLATION,
  NOT_NIGHT_ELIGIBLE: ConflictCode.RULE_VIOLATION,
  OFF_DAY_CONFLICT: ConflictCode.OFF_DAY_CONFLICT,
  REST_RULE_VIOLATION: ConflictCode.REST_VIOLATION,
  REQUIRED_REST_NOT_MET: ConflictCode.REST_VIOLATION,
  DEVICE_OFF_DATE: ConflictCode.RULE_VIOLATION,
  UNIT_CLOSED: ConflictCode.RULE_VIOLATION,
  PERSONNEL_AVAILABILITY_CONFLICT: ConflictCode.AVAILABILITY_CONFLICT,
  HOLIDAY_CONFLICT: ConflictCode.RULE_VIOLATION,
  MAX_WORK_EXCEEDED: ConflictCode.MAX_WORK_EXCEEDED,
};

/** Narrow Prisma projection used when rebuilding the working assignment set. */
interface ExistingAssignmentRecord {
  id: string;
  scheduleId: string;
  personnelId: string;
  deviceId: string | null;
  unitId: string | null;
  personnelGroupId: string | null;
  shiftTemplateId: string | null;
  kind: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
  personnelType: string;
}

@Injectable()
export class ScheduleValidationService {
  private readonly engine = new ConstraintEngine();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService?: PersonnelAvailabilityService,
    private readonly coverageService?: ScheduleCoverageService,
  ) {}

  async validateAssignment(
    scheduleId: string,
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    excludeAssignmentId?: string,
  ): Promise<ValidationReport> {
    const assignment = Assignment.create({
      scheduleId,
      personnelId: params.personnelId,
      deviceId: params.deviceId,
      unitId: params.unitId,
      personnelGroupId: params.personnelGroupId,
      shiftTemplateId: params.shiftTemplateId,
      kind: (params.kind as 'device' | 'person') || 'device',
      date: params.date,
      shiftType: params.shiftType,
      startTime: params.startTime,
      endTime: params.endTime,
      personnelType: params.personnelType || 'technician',
    });

    const existingRecords = await this.prisma.assignment.findMany({
      where: {
        scheduleId,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });

    const existingAssignments = new AssignmentCollection(
      existingRecords.map(r =>
        Assignment.create({
          id: r.id,
          scheduleId: r.scheduleId,
          personnelId: r.personnelId,
          deviceId: r.deviceId,
          unitId: r.unitId,
          personnelGroupId: r.personnelGroupId,
          shiftTemplateId: r.shiftTemplateId,
          kind: r.kind as 'device' | 'person',
          date: r.date,
          shiftType: r.shiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          personnelType: r.personnelType,
        }),
      ),
    );

    const personnelLookup = await this.buildPersonnelLookup(params.unitId);
    const deviceLookup = await this.buildDeviceLookup(params.unitId);
    const templates = await this.buildTemplateLookup(params.unitId);
    const groups = await this.buildGroupLookup(params.unitId);
    const holidays = await this.loadHolidays(parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));
    const deviceOffDates = await this.loadDeviceOffDates(params.unitId || '', parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));
    const personnelBlockedDates = await this.loadPersonnelBlockedDates(params.unitId, parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));

    return this.engine.validate(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      deviceOffDates,
      templates,
      groups,
      personnelBlockedDates,
    );
  }

  /**
   * P2-15 — validate an entire apply proposal with a single context load.
   *
   * The legacy path called validateAssignment() once per row, reloading the
   * schedule, personnel, devices, templates, groups, holidays, off-dates and
   * availability each time (~8 queries × N candidates). This method loads each
   * context exactly once and validates candidates in order against the
   * persisted assignments plus already-accepted candidates from the same batch.
   * A blocking violation anywhere still rejects the whole apply; no rule is
   * weakened and the sequential conflict-skip semantics are preserved.
   */
  async validateAssignmentsBatch(
    scheduleId: string,
    candidates: Array<{
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    }>,
    context: { unitId: string; year: number; month: number },
  ): Promise<ValidationReport[]> {
    if (candidates.length === 0) return [];

    const existingRecords = await this.prisma.assignment.findMany({
      where: { scheduleId },
    }) as ExistingAssignmentRecord[];
    const working = new AssignmentCollection(
      existingRecords.map(r =>
        Assignment.create({
          id: r.id,
          scheduleId: r.scheduleId,
          personnelId: r.personnelId,
          deviceId: r.deviceId,
          unitId: r.unitId,
          personnelGroupId: r.personnelGroupId,
          shiftTemplateId: r.shiftTemplateId,
          kind: r.kind as 'device' | 'person',
          date: r.date,
          shiftType: r.shiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          personnelType: r.personnelType,
        }),
      ),
    );

    const personnelLookup = await this.buildPersonnelLookup(context.unitId);
    const deviceLookup = await this.buildDeviceLookup(context.unitId);
    const templates = await this.buildTemplateLookup(context.unitId);
    const groups = await this.buildGroupLookup(context.unitId);
    const holidays = await this.loadHolidays(context.year, context.month);
    const deviceOffDates = await this.loadDeviceOffDates(context.unitId, context.year, context.month);
    const personnelBlockedDates = await this.loadPersonnelBlockedDates(context.unitId, context.year, context.month);

    const reports: ValidationReport[] = [];
    for (let index = 0; index < candidates.length; index++) {
      const params = candidates[index];
      const candidate = Assignment.create({
        id: `batch-${index}`,
        scheduleId,
        personnelId: params.personnelId,
        deviceId: params.deviceId,
        unitId: params.unitId ?? context.unitId,
        personnelGroupId: params.personnelGroupId,
        shiftTemplateId: params.shiftTemplateId,
        kind: (params.kind as 'device' | 'person') || 'device',
        date: params.date,
        shiftType: params.shiftType,
        startTime: params.startTime,
        endTime: params.endTime,
        personnelType: params.personnelType || 'technician',
      });

      const report = this.engine.validate(
        candidate,
        working,
        personnelLookup,
        deviceLookup,
        holidays,
        deviceOffDates,
        templates,
        groups,
        personnelBlockedDates,
      );
      reports.push(report);

      // Only clean candidates join the working set, mirroring apply()'s
      // conflict-skip behaviour while making later rows see earlier ones.
      if (!report.hasBlocking) working.add(candidate);
    }

    return reports;
  }

  async validateWithOverride(
    scheduleId: string,
    params: {
      personnelId: string;
      deviceId?: string | null;
      unitId?: string | null;
      personnelGroupId?: string | null;
      shiftTemplateId?: string | null;
      kind?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
    },
    overrideRules: string[],
    excludeAssignmentId?: string,
  ): Promise<ValidationReport> {
    const assignment = Assignment.create({
      scheduleId,
      personnelId: params.personnelId,
      deviceId: params.deviceId,
      unitId: params.unitId,
      personnelGroupId: params.personnelGroupId,
      shiftTemplateId: params.shiftTemplateId,
      kind: (params.kind as 'device' | 'person') || 'device',
      date: params.date,
      shiftType: params.shiftType,
      startTime: params.startTime,
      endTime: params.endTime,
      personnelType: params.personnelType || 'technician',
    });

    const existingRecords = await this.prisma.assignment.findMany({
      where: {
        scheduleId,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });

    const existingAssignments = new AssignmentCollection(
      existingRecords.map(r =>
        Assignment.create({
          id: r.id,
          scheduleId: r.scheduleId,
          personnelId: r.personnelId,
          deviceId: r.deviceId,
          unitId: r.unitId,
          personnelGroupId: r.personnelGroupId,
          shiftTemplateId: r.shiftTemplateId,
          kind: r.kind as 'device' | 'person',
          date: r.date,
          shiftType: r.shiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          personnelType: r.personnelType,
        }),
      ),
    );

    const personnelLookup = await this.buildPersonnelLookup(params.unitId);
    const deviceLookup = await this.buildDeviceLookup(params.unitId);
    const templates = await this.buildTemplateLookup(params.unitId);
    const groups = await this.buildGroupLookup(params.unitId);
    const holidays = await this.loadHolidays(parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));
    const deviceOffDates = await this.loadDeviceOffDates(params.unitId || '', parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));
    const personnelBlockedDates = await this.loadPersonnelBlockedDates(params.unitId, parseInt(params.date.substring(0, 4)), parseInt(params.date.substring(5, 7)));

    return this.engine.validateWithOverride(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      deviceOffDates,
      templates,
      groups,
      overrideRules,
      personnelBlockedDates,
    );
  }

  async validateSchedule(scheduleId: string): Promise<ValidationResult> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { assignments: true },
    });
    if (!schedule) throw new Error(`Schedule ${scheduleId} not found`);

    const unitId = schedule.unitId;
    const personnelLookup = await this.buildPersonnelLookup(unitId);
    const deviceLookup = await this.buildDeviceLookup(unitId);
    const templates = await this.buildTemplateLookup(unitId);
    const groups = await this.buildGroupLookup(unitId);
    const holidays = await this.loadHolidays(schedule.year, schedule.month);
    const deviceOffDates = await this.loadDeviceOffDates(unitId, schedule.year, schedule.month);
    const personnelBlockedDates = await this.loadPersonnelBlockedDates(unitId, schedule.year, schedule.month);

    const allAssignments = new AssignmentCollection(
      schedule.assignments.map(r =>
        Assignment.create({
          id: r.id,
          scheduleId: r.scheduleId,
          personnelId: r.personnelId,
          deviceId: r.deviceId,
          unitId: r.unitId,
          personnelGroupId: r.personnelGroupId,
          shiftTemplateId: r.shiftTemplateId,
          kind: r.kind as 'device' | 'person',
          date: r.date,
          shiftType: r.shiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          personnelType: r.personnelType,
        }),
      ),
    );

    let result = createEmptyValidationResult();
    const checkedConstraints: string[] = [];

    for (const assignment of allAssignments.all) {
      const report = this.engine.validate(
        assignment,
        allAssignments,
        personnelLookup,
        deviceLookup,
        holidays,
        deviceOffDates,
        templates,
        groups,
        personnelBlockedDates,
      );
      for (const v of report.violations) {
        const severity: ConflictSeverity =
          v.severity === 'BLOCKING' ? ConflictSeverity.ERROR :
          v.severity === 'WARNING' ? ConflictSeverity.WARNING :
          ConflictSeverity.INFO;
        const conflict = createConflict({
          code: VIOLATION_RULE_TO_CONFLICT_CODE[v.rule] || ConflictCode.RULE_VIOLATION,
          severity,
          message: v.message,
          context: {
            personnelId: assignment.personnelId.value,
            date: assignment.date.value,
            shiftType: assignment.shiftType.value,
            startTime: assignment.startTime,
            endTime: assignment.endTime,
          },
        });
        if (severity === ConflictSeverity.ERROR) {
          addHardViolation(result, conflict);
        } else {
          addSoftViolation(result, conflict);
        }
        checkedConstraints.push(v.rule);
      }
    }

    // PHASE 5C.26 P1-A2 — schedule-level minimum coverage (single authoritative
    // calculation via ScheduleCoverageService/CoverageEngine). Under-covered
    // staffing is BLOCKING (COVERAGE_MISSING), equal/over coverage passes.
    if (this.coverageService) {
      const coverage = await this.coverageService.evaluateScheduleCoverage({
        unitId,
        scheduleId,
        year: schedule.year,
        month: schedule.month,
      });
      result.coverage = {
        totalSlots: coverage.requiredSlots,
        filledSlots: coverage.assignedSlots,
        coveragePercent: coverage.coveragePercent,
        byUnit: {
          [unitId]: {
            total: coverage.requiredSlots,
            filled: coverage.assignedSlots,
            percent: coverage.coveragePercent,
          },
        },
        uncoveredDates: coverage.uncoveredDates,
      };
      for (const conflict of this.coverageService.buildCoverageConflicts(coverage)) {
        addHardViolation(result, conflict);
      }
      if (coverage.underCoverage.length > 0) {
        addWarning(
          result,
          `Minimum kadro eksik: ${coverage.underCoverage.length} vardiya kadrolu slot doldurulmamış (gerekli ${coverage.requiredSlots}, karşılanan ${coverage.assignedSlots}).`,
        );
      }
    }

    finalizeValidation(result);
    return result;
  }

  private async buildPersonnelLookup(unitId?: string | null): Promise<PersonnelLookup> {
    const where = unitId ? { unitId, isActive: true } : { isActive: true };
    const personnel = await this.prisma.personnel.findMany({ where });
    const map = new Map<string, PersonnelInfo>();
    for (const p of personnel) {
      map.set(p.id, {
        id: p.id,
        name: p.name,
        isActive: p.isActive,
        employmentStatus: p.employmentStatus,
        unitId: p.unitId,
        groupId: p.groupId,
        role: p.role,
        skills: p.skills,
        deviceSkills: p.deviceSkills,
        nightShiftEligible: p.nightShiftEligible,
        offDays: p.offDays,
        maxWeeklyHours: p.maxWeeklyHours,
      });
    }
    return {
      findById: (id: string) => map.get(id),
      all: () => Array.from(map.values()),
    };
  }

  private async buildDeviceLookup(unitId?: string | null): Promise<DeviceLookup> {
    const where = unitId ? { unitId, isActive: true } : { isActive: true };
    const devices = await this.prisma.device.findMany({ where });
    const map = new Map<string, DeviceInfo>();
    for (const d of devices) {
      map.set(d.id, {
        id: d.id,
        code: d.code,
        name: d.name,
        unitId: d.unitId,
        mode: d.mode,
        requiredSkills: d.requiredSkills,
        workDays: d.workDays,
        isActive: d.isActive,
      });
    }
    return { findById: (id: string) => map.get(id) };
  }

  private async buildTemplateLookup(unitId?: string | null): Promise<ShiftTemplateLookup> {
    const where = unitId ? { unitId, isActive: true } : { isActive: true };
    const templates = await this.prisma.personShiftTemplate.findMany({ where });
    const map = new Map<string, ShiftTemplateInfo>();
    for (const t of templates) {
      map.set(t.id, {
        id: t.id,
        unitId: t.unitId,
        personnelGroupId: t.personnelGroupId,
        name: t.name,
        shiftType: t.shiftType,
        startTime: t.startTime,
        endTime: t.endTime,
        isActive: t.isActive,
      });
    }
    return { findById: (id: string) => map.get(id) };
  }

  private async buildGroupLookup(unitId?: string | null): Promise<GroupLookup> {
    const where = unitId ? { unitId, isActive: true } : { isActive: true };
    const groups = await this.prisma.personnelGroup.findMany({ where });
    const map = new Map<string, GroupInfo>();
    for (const g of groups) {
      map.set(g.id, {
        id: g.id,
        unitId: g.unitId || '',
        name: g.name,
        code: g.code,
        isActive: g.isActive,
      });
    }
    return { findById: (id: string) => map.get(id) };
  }

  private async loadHolidays(year: number, month: number): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      where: { year },
    });
    return new Set(holidays.map(h => h.date));
  }

  private async loadDeviceOffDates(unitId: string, year: number, month: number): Promise<Set<string>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const records = await this.prisma.deviceOffDate.findMany({
      where: {
        device: { unitId },
        isActive: true,
        date: { gte: startDate, lte: endDate },
      },
      select: { deviceId: true, date: true },
    });
    return new Set(records.map(r => `${r.deviceId}:${r.date}`));
  }

  /**
   * PHASE 5C.25 — authoritative availability input for the constraint engine.
   * Reuses the 5C.23 resolver so the engine never re-implements precedence.
   * Falls back to weekly offDays when the optional service is absent.
   */
  private async loadPersonnelBlockedDates(
    unitId: string | null | undefined,
    year: number,
    month: number,
  ): Promise<Map<string, Set<string>>> {
    const personnel = await this.prisma.personnel.findMany({
      where: unitId ? { unitId, isActive: true } : { isActive: true },
      select: { id: true, offDays: true },
    });
    const refs = personnel.map(p => ({ id: p.id, offDays: p.offDays || [] }));
    if (this.availabilityService) {
      return this.availabilityService.resolveMonthBlockedDates(refs, year, month);
    }
    return PersonnelAvailabilityService.blockedByWeeklyOffDays(refs, year, month);
  }
}
