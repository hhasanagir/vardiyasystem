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
