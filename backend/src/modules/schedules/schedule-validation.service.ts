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
import {
  Conflict,
  ConflictCode,
  ConflictSeverity,
  createConflict,
} from './domain/models/conflict';
import {
  ValidationResult,
  createEmptyValidationResult,
  addHardViolation,
  addSoftViolation,
  finalizeValidation,
} from './domain/models/validation-result';
import { ViolationRule } from './domain/constraints/constraint.interface';

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
};

@Injectable()
export class ScheduleValidationService {
  private readonly engine = new ConstraintEngine();

  constructor(private readonly prisma: PrismaService) {}

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
      existingRecords.map((r) =>
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
    const holidays = await this.loadHolidays(
      parseInt(params.date.substring(0, 4)),
      parseInt(params.date.substring(5, 7)),
    );

    return this.engine.validate(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      templates,
      groups,
    );
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
      existingRecords.map((r) =>
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
    const holidays = await this.loadHolidays(
      parseInt(params.date.substring(0, 4)),
      parseInt(params.date.substring(5, 7)),
    );

    return this.engine.validateWithOverride(
      assignment,
      existingAssignments,
      personnelLookup,
      deviceLookup,
      holidays,
      templates,
      groups,
      overrideRules,
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

    const allAssignments = new AssignmentCollection(
      schedule.assignments.map((r) =>
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
        templates,
        groups,
      );
      for (const v of report.violations) {
        const severity: ConflictSeverity =
          v.severity === 'BLOCKING'
            ? ConflictSeverity.ERROR
            : v.severity === 'WARNING'
              ? ConflictSeverity.WARNING
              : ConflictSeverity.INFO;
        const conflict = createConflict({
          code:
            VIOLATION_RULE_TO_CONFLICT_CODE[v.rule] ||
            ConflictCode.RULE_VIOLATION,
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

    finalizeValidation(result);
    return result;
  }

  private async buildPersonnelLookup(
    unitId?: string | null,
  ): Promise<PersonnelLookup> {
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
    return { findById: (id: string) => map.get(id) };
  }

  private async buildDeviceLookup(
    unitId?: string | null,
  ): Promise<DeviceLookup> {
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

  private async buildTemplateLookup(
    unitId?: string | null,
  ): Promise<ShiftTemplateLookup> {
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

  private async loadHolidays(
    year: number,
    month: number,
  ): Promise<Set<string>> {
    const holidays = await this.prisma.holiday.findMany({
      where: { year },
    });
    return new Set(holidays.map((h) => h.date));
  }
}
