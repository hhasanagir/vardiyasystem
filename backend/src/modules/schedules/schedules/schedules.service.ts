import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, ScheduleStatus, ShiftType, UnitType } from '@prisma/client';
import type {
  AssignmentViolation,
  AssignmentValidationResult,
  ViolationRule,
} from './types/violation.types';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { UnitsService } from '../units/units.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { NotificationEventService } from '../notifications/notification-event.service';
import { MetricsService } from '../../metrics/metrics.service';
import { EventBusService } from '../../events/event-bus.service';
import {
  createEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
} from '../../events/domain-event.interface';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { PublishUnitScheduleDto } from './dto/publish-unit-schedule.dto';
import { SchedulesWorkflowService } from './schedules-workflow.service';
import { canPublish, canDirectAssign } from '../../models/schedule-status';

interface UserContext {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string;
  unitId?: string;
}

interface SnapshotAssignment {
  personnelId: string;
  deviceId: string | null;
  unitId?: string | null;
  personnelGroupId?: string | null;
  shiftTemplateId?: string | null;
  kind?: string;
  date: string;
  shiftType: string;
  startTime: string;
  endTime: string;
}

interface SnapshotData {
  assignments: SnapshotAssignment[];
  comment?: string;
}

@Injectable()
export class SchedulesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private unitsService: UnitsService,
    private workflowService: SchedulesWorkflowService,
    private gateway: ScheduleGateway,
    private notificationEvent: NotificationEventService,
    private metrics: MetricsService,
    private eventBus: EventBusService,
  ) {}

  async create(dto: CreateScheduleDto, userId: string) {
    const existing = await this.prisma.schedule.findFirst({
      where: {
        unitId: dto.unitId,
        month: dto.month,
        year: dto.year,
      },
    });

    if (existing) {
      throw new ConflictException(
        'Schedule already exists for this unit and period',
      );
    }

    const schedule = await this.prisma.schedule.create({
      data: {
        unitId: dto.unitId,
        month: dto.month,
        year: dto.year,
        status: 'draft',
        createdById: userId,
      },
      include: {
        unit: true,
        assignments: {
          include: {
            personnel: true,
            device: true,
          },
        },
      },
    });

    await this.auditLog
      .log({
        userId,
        action: 'CREATE',
        entityType: 'schedule',
        entityId: schedule.id,
        after: schedule,
      })
      .catch(() => {});

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'created',
        personnelId: schedule.id,
        personnelName: `Schedule ${schedule.month}/${schedule.year}`,
        unitId: schedule.unitId,
        organizationId: schedule.unit?.organizationId || undefined,
      })
      .catch(() => {});

    this.metrics.shiftCreatedTotal.inc({
      unit_id: schedule.unitId || 'unknown',
    });

    this.eventBus.publish(
      createEvent(
        EVENT_NAMES.SCHEDULE_CREATED,
        schedule.id,
        AGGREGATE_TYPES.SCHEDULE,
        {
          scheduleId: schedule.id,
          unitId: schedule.unitId,
          month: schedule.month,
          year: schedule.year,
          userId,
          status: schedule.status,
        },
        userId,
      ),
    );

    return schedule;
  }

  async findAll(filters: {
    organizationId?: string;
    unitId?: string;
    month?: number;
    year?: number;
    status?: string;
    take?: number;
    skip?: number;
  }) {
    const where: Prisma.ScheduleWhereInput = {
      ...(filters.organizationId && {
        unit: { organizationId: filters.organizationId },
      }),
      ...(filters.unitId && { unitId: filters.unitId }),
      ...(filters.month && { month: filters.month }),
      ...(filters.year && { year: filters.year }),
      ...(filters.status && { status: filters.status as ScheduleStatus }),
    };
    const take = Math.min(filters.take ?? 100, 500);

    return this.prisma.schedule.findMany({
      where,
      take,
      skip: filters.skip,
      include: {
        unit: { select: { id: true, name: true, code: true, type: true } },
        assignments: {
          include: {
            personnel: { select: { id: true, name: true, role: true } },
            device: {
              select: { id: true, code: true, name: true, mode: true },
            },
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
  }

  async findOne(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        unit: true,
        assignments: {
          include: {
            personnel: true,
            device: true,
          },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        snapshots: {
          orderBy: { version: 'desc' },
        },
      },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    return schedule;
  }

  async findByUnitMonthYear(unitId: string, month: number, year: number) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { unitId, month, year },
      include: {
        unit: true,
        createdBy: {
          select: { id: true, name: true, email: true },
        },
        assignments: {
          include: {
            personnel: true,
            device: true,
          },
        },
        approval: true,
      },
    });

    return schedule ?? null;
  }

  async findByUnitType(unitType: string, month: number, year: number) {
    if (!unitType) {
      throw new BadRequestException('Birim parametresi zorunludur');
    }
    if (!month || !year) {
      throw new BadRequestException('Ay ve yıl parametreleri zorunludur');
    }

    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });

    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }

    const schedule = await this.findByUnitMonthYear(unit.id, month, year);

    const devices = await this.unitsService.getDevices(unit.id, true);

    const personShiftConfig = await this.loadPersonShiftConfig(unit.id);

    if (!schedule) {
      const deviceIds = devices.map((d) => d.id);
      const shiftDefs = await this.prisma.shifts.findMany({
        where: {
          organizationId: unit?.organizationId || undefined,
          deviceId: { in: deviceIds },
          isActive: true,
        },
        select: {
          id: true,
          deviceId: true,
          type: true,
          startTime: true,
          endTime: true,
          name: true,
          personnelType: true,
          blockId: true,
          optionalOnWeekends: true,
          optionalOnHolidays: true,
          isMaster: true,
        },
      });
      const deviceShiftConfig = devices.map((d) => ({
        deviceId: d.id,
        shifts: shiftDefs
          .filter((s) => s.deviceId === d.id)
          .map((s) => ({
            id: s.id,
            type: s.type,
            startTime: s.startTime,
            endTime: s.endTime,
            name: s.name,
            personnelType: s.personnelType,
            blockId: s.blockId,
            optionalOnWeekends: s.optionalOnWeekends,
            optionalOnHolidays: s.optionalOnHolidays,
            isMaster: s.isMaster,
          })),
      }));
      return {
        unit: unitType,
        month,
        year,
        id: null as string | null,
        version: 0,
        status: 'draft' as const,
        devices: devices.map((d) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          mode: d.mode,
          blockCode: d.blockCode,
          isMaster: d.isMaster,
        })),
        deviceShiftConfig,
        personShiftConfig,
        assignments: [],
        personAssignments: [],
        createdBy: null,
        createdAt: null,
        updatedAt: null,
        workflow: null,
      };
    }

    const deviceIds = devices.map((d) => d.id);

    const shiftDefs = await this.prisma.shifts.findMany({
      where: {
        organizationId:
          schedule.unit?.organizationId || unit?.organizationId || undefined,
        deviceId: { in: deviceIds },
        isActive: true,
      },
      select: {
        id: true,
        deviceId: true,
        type: true,
        startTime: true,
        endTime: true,
        name: true,
        personnelType: true,
        blockId: true,
        optionalOnWeekends: true,
        optionalOnHolidays: true,
        isMaster: true,
      },
    });

    const deviceShiftConfig = devices.map((d) => ({
      deviceId: d.id,
      shifts: shiftDefs
        .filter((s) => s.deviceId === d.id)
        .map((s) => ({
          id: s.id,
          type: s.type,
          startTime: s.startTime,
          endTime: s.endTime,
          name: s.name,
          personnelType: s.personnelType,
          blockId: s.blockId,
          optionalOnWeekends: s.optionalOnWeekends,
          optionalOnHolidays: s.optionalOnHolidays,
          isMaster: s.isMaster,
        })),
    }));

    return {
      id: schedule.id,
      unit: unitType,
      month: schedule.month,
      year: schedule.year,
      version: schedule.version,
      status: schedule.status,
      devices: devices.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        mode: d.mode,
        blockCode: d.blockCode,
        isMaster: d.isMaster,
      })),
      deviceShiftConfig,
      personShiftConfig,
      assignments: schedule.assignments
        .filter((a) => a.kind !== 'person')
        .map((a) => ({
          id: a.id,
          scheduleId: a.scheduleId,
          personnelId: a.personnelId,
          personnelName: a.personnel?.name || '',
          personnelType: a.personnel?.role || null,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          startTime: a.startTime,
          endTime: a.endTime,
          isConfirmed: a.isConfirmed,
          version: a.version,
        })),
      personAssignments: schedule.assignments
        .filter((a) => a.kind === 'person')
        .map((a) => ({
          id: a.id,
          scheduleId: a.scheduleId,
          personnelId: a.personnelId,
          personnelName: a.personnel?.name || '',
          personnelType: a.personnel?.role || a.personnelType || null,
          personnelGroupId: a.personnelGroupId,
          shiftTemplateId: a.shiftTemplateId,
          unitId: a.unitId,
          date: a.date,
          shiftType: a.shiftType,
          startTime: a.startTime,
          endTime: a.endTime,
          isConfirmed: a.isConfirmed,
          version: a.version,
        })),
      createdBy: schedule.createdBy
        ? {
            id: schedule.createdBy.id,
            name: schedule.createdBy.name,
            email: schedule.createdBy.email,
          }
        : null,
      createdAt: schedule.createdAt,
      updatedAt: schedule.updatedAt,
      workflow: schedule.approval
        ? {
            submittedBy: schedule.approval.submittedBy ?? undefined,
            submittedAt:
              schedule.approval.submittedAt?.toISOString() ?? undefined,
            approvedBy: schedule.approval.approvedBy ?? undefined,
            approvedAt:
              schedule.approval.approvedAt?.toISOString() ?? undefined,
            publishedBy: schedule.approval.publishedBy ?? undefined,
            publishedAt:
              schedule.approval.publishedAt?.toISOString() ?? undefined,
            rejectedBy: schedule.approval.rejectedBy ?? undefined,
            rejectedAt:
              schedule.approval.rejectedAt?.toISOString() ?? undefined,
            rejectionReason: schedule.approval.rejectionReason ?? undefined,
          }
        : null,
    };
  }

  private async loadPersonShiftConfig(unitId: string) {
    const groups = await this.prisma.personnelGroup.findMany({
      where: { unitId, isActive: true },
      include: {
        shiftTemplates: {
          where: { isActive: true },
          orderBy: [{ startTime: 'asc' }, { shiftType: 'asc' }],
        },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map((g) => ({
      groupId: g.id,
      code: g.code,
      name: g.name,
      description: g.description,
      templates: g.shiftTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        shiftType: t.shiftType,
        startTime: t.startTime,
        endTime: t.endTime,
      })),
    }));
  }

  async publishByUnit(
    unitType: string,
    dto: PublishUnitScheduleDto,
    user: UserContext,
  ) {
    if (!canPublish(user.role)) {
      throw new ForbiddenException(
        'Bu işlemi yapmak için yetkiniz yok. Sadece Proje Yöneticisi yayınlayabilir.',
      );
    }

    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });

    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }

    let schedule = await this.prisma.schedule.findFirst({
      where: { unitId: unit.id, month: dto.month, year: dto.year },
    });

    if (!schedule) {
      schedule = await this.prisma.schedule.create({
        data: {
          unitId: unit.id,
          month: dto.month,
          year: dto.year,
          status: 'draft',
          createdById: user.id,
        },
      });
    }

    if (dto.assignments && dto.assignments.length > 0) {
      for (const a of dto.assignments) {
        const errors = await this.validateAssignment(schedule.id, {
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          startTime: a.startTime,
          endTime: a.endTime,
          personnelType: a.personnelType,
        });
        if (errors.length > 0) {
          throw new ConflictException(
            `Assignment validation failed: ${errors.join('; ')}`,
          );
        }
      }
      await this.prisma.$transaction(async (tx) => {
        await tx.assignment.deleteMany({ where: { scheduleId: schedule.id } });
        await tx.assignment.createMany({
          data: (dto.assignments || []).map((a) => ({
            scheduleId: schedule.id,
            personnelId: a.personnelId,
            deviceId: a.deviceId,
            date: a.date,
            shiftType: a.shiftType,
            startTime: a.startTime,
            endTime: a.endTime,
            personnelType: a.personnelType || undefined,
          })),
        });
      });
    }

    const wfUser: UserContext = user;
    let result;

    try {
      if (schedule.status === 'draft') {
        result = await this.workflowService.submitForReview(
          schedule.id,
          wfUser,
          'Birim üzerinden otomatik gönderim',
        );
        result = await this.workflowService.approve(
          schedule.id,
          wfUser,
          'Birim üzerinden otomatik onay',
        );
        result = await this.workflowService.publish(schedule.id, wfUser);
      } else if (schedule.status === 'under_review') {
        result = await this.workflowService.approve(
          schedule.id,
          wfUser,
          'Birim üzerinden otomatik onay',
        );
        result = await this.workflowService.publish(schedule.id, wfUser);
      } else if (schedule.status === 'approved') {
        result = await this.workflowService.publish(schedule.id, wfUser);
      } else if (schedule.status === 'rejected') {
        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: { status: 'draft' },
        });
        result = await this.workflowService.submitForReview(
          schedule.id,
          wfUser,
          'Birim üzerinden yeniden gönderim',
        );
        result = await this.workflowService.approve(
          schedule.id,
          wfUser,
          'Birim üzerinden otomatik onay',
        );
        result = await this.workflowService.publish(schedule.id, wfUser);
      } else if (schedule.status === 'archived') {
        await this.prisma.schedule.update({
          where: { id: schedule.id },
          data: { status: 'draft' },
        });
        result = await this.workflowService.submitForReview(
          schedule.id,
          wfUser,
          'Arşivden birim üzerinden gönderim',
        );
        result = await this.workflowService.approve(
          schedule.id,
          wfUser,
          'Birim üzerinden otomatik onay',
        );
        result = await this.workflowService.publish(schedule.id, wfUser);
      }
    } catch (e) {
      await this.prisma.schedule
        .update({
          where: { id: schedule.id },
          data: { status: (schedule as any).status },
        })
        .catch(() => {});
      throw e;
    }

    return result;
  }

  async findMyShifts(userEmail: string, month: number, year: number) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { email: userEmail },
    });

    if (!personnel) {
      return { shifts: [], personnel: null };
    }

    const schedule = await this.prisma.schedule.findFirst({
      where: { unitId: personnel.unitId, month, year },
      include: {
        unit: true,
        assignments: {
          where: { personnelId: personnel.id },
          include: { device: true },
        },
      },
    });

    if (!schedule) {
      return {
        shifts: [],
        personnel: {
          id: personnel.id,
          name: personnel.name,
          role: personnel.role,
          unitId: personnel.unitId,
        },
        month,
        year,
        status: 'no_schedule',
      };
    }

    const shifts = schedule.assignments.map((a) => ({
      id: a.id,
      date: a.date,
      shiftType: a.shiftType,
      startTime: a.startTime,
      endTime: a.endTime,
      deviceId: a.deviceId,
      deviceName: a.device?.name || '',
      deviceCode: a.device?.code || '',
      isConfirmed: a.isConfirmed,
    }));

    return {
      shifts,
      personnel: {
        id: personnel.id,
        name: personnel.name,
        role: personnel.role,
        unitId: personnel.unitId,
      },
      scheduleId: schedule.id,
      unit: schedule.unit?.type?.toLowerCase() || '',
      unitName: schedule.unit?.name || '',
      month: schedule.month,
      year: schedule.year,
      status: schedule.status,
    };
  }

  async getMySummary(userEmail: string) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { email: userEmail },
    });

    if (!personnel) {
      return { today: null, week: [], upcoming: [], summary: null };
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().split('T')[0];

    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        unitId: personnel.unitId,
        month: currentMonth,
        year: currentYear,
      },
      include: {
        unit: true,
        assignments: {
          where: { personnelId: personnel.id },
          include: { device: true },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!schedule) {
      return {
        today: null,
        week: [],
        upcoming: [],
        summary: {
          totalShifts: 0,
          totalHours: 0,
          nightShifts: 0,
          weekendShifts: 0,
          overtimeHours: 0,
        },
      };
    }

    const allShifts = schedule.assignments.map((a) => ({
      id: a.id,
      date: a.date,
      shiftType: a.shiftType,
      startTime: a.startTime,
      endTime: a.endTime,
      deviceName: a.device?.name || '',
      deviceCode: a.device?.code || '',
      isConfirmed: a.isConfirmed,
    }));

    const todayShift = allShifts.find((s) => s.date === todayStr) || null;

    const weekShifts = allShifts.filter((s) => {
      const d = new Date(s.date);
      return d >= weekStart && d <= weekEnd;
    });

    const upcomingShifts = allShifts
      .filter((s) => s.date >= todayStr)
      .slice(0, 10);

    const totalShifts = allShifts.length;
    const nightShifts = allShifts.filter((s) => s.shiftType === 'night').length;
    const weekendShifts = allShifts.filter((s) => {
      const d = new Date(s.date);
      return d.getDay() === 0 || d.getDay() === 6;
    }).length;

    let totalHours = 0;
    for (const s of allShifts) {
      if (!s.startTime || !s.endTime) continue;
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      totalHours += (eh * 60 + em - (sh * 60 + sm)) / 60;
    }

    const overtimeHours = Math.max(0, totalHours - totalShifts * 8);

    return {
      today: todayShift,
      week: weekShifts,
      upcoming: upcomingShifts,
      summary: {
        totalShifts,
        totalHours: Math.round(totalHours * 10) / 10,
        nightShifts,
        weekendShifts,
        overtimeHours: Math.round(overtimeHours * 10) / 10,
      },
    };
  }

  async update(
    id: string,
    dto: UpdateScheduleDto,
    userId: string,
    expectedVersion?: number,
  ) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    if (expectedVersion !== undefined && schedule.version !== expectedVersion) {
      throw new ConflictException(
        `Optimistic locking conflict: expected version ${expectedVersion}, actual ${schedule.version}`,
      );
    }

    if (dto.assignments) {
      await this.createSnapshot(id, userId);

      for (const a of dto.assignments) {
        const errors = await this.validateAssignment(id, {
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          startTime: a.startTime,
          endTime: a.endTime,
        });
        if (errors.length > 0) {
          throw new ConflictException(
            `Assignment validation failed: ${errors.join('; ')}`,
          );
        }
      }

      await this.prisma.assignment.deleteMany({ where: { scheduleId: id } });

      if (dto.assignments.length > 0) {
        await this.prisma.assignment.createMany({
          data: dto.assignments.map((a) => ({
            scheduleId: id,
            personnelId: a.personnelId,
            deviceId: a.deviceId,
            date: a.date,
            shiftType: a.shiftType,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        });
      }
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        status: dto.status,
        version: { increment: 1 },
        publishedAt: dto.status === 'published' ? new Date() : undefined,
      },
      include: {
        unit: true,
        assignments: {
          include: {
            personnel: true,
            device: true,
          },
        },
      },
    });

    await this.auditLog
      .log({
        userId,
        action: dto.status === 'published' ? 'PUBLISH' : 'UPDATE',
        entityType: 'schedule',
        entityId: id,
        before: schedule,
        after: updated,
      })
      .catch(() => {});

    this.eventBus.publish(
      createEvent(
        dto.status === 'published'
          ? EVENT_NAMES.SCHEDULE_APPROVED
          : EVENT_NAMES.SCHEDULE_UPDATED,
        id,
        AGGREGATE_TYPES.SCHEDULE,
        {
          scheduleId: id,
          unitId: schedule.unitId,
          month: schedule.month,
          year: schedule.year,
          userId,
          status: dto.status || schedule.status,
        },
        userId,
      ),
    );

    return updated;
  }

  private async validateAssignment(
    scheduleId: string,
    dto: {
      personnelId: string;
      deviceId?: string | null;
      kind?: string;
      unitId?: string;
      personnelGroupId?: string;
      shiftTemplateId?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
      reason?: string;
    },
    excludeAssignmentId?: string,
  ): Promise<string[]> {
    const errors: string[] = [];
    const shiftType = dto.shiftType as ShiftType;
    const kind: 'device' | 'person' =
      dto.kind === 'person' ? 'person' : 'device';

    const personnelRec = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: {
        role: true,
        offDays: true,
        isActive: true,
        nightShiftEligible: true,
        unitId: true,
        groupId: true,
      },
    });
    if (!personnelRec) {
      return ['Personel bulunamadı'];
    }
    const personnelType =
      dto.personnelType || personnelRec.role || 'technician';

    if (kind === 'device') {
      if (!dto.deviceId) {
        errors.push('Cihaz bazlı vardiya için cihaz seçilmelidir');
        return errors;
      }
      const sameDevice = await this.prisma.assignment.findFirst({
        where: {
          scheduleId,
          deviceId: dto.deviceId,
          date: dto.date,
          shiftType,
          personnelType,
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
      });
      if (sameDevice) {
        errors.push(
          `Cihaz ${dto.date} tarihinde ${shiftType} vardiyası için dolu`,
        );
      }
    } else {
      if (dto.deviceId) {
        errors.push('Personel nöbeti cihaz gerektirmez');
      }
      if (!dto.unitId || !dto.personnelGroupId || !dto.shiftTemplateId) {
        errors.push(
          'Personel nöbeti için birim, personel grubu ve vardiya şablonu zorunludur',
        );
        return errors;
      }
      if (personnelRec.unitId !== dto.unitId) {
        errors.push('Personel seçilen birime bağlı değildir');
      }
      if (
        personnelRec.groupId &&
        personnelRec.groupId !== dto.personnelGroupId
      ) {
        errors.push('Personel seçilen gruba bağlı değildir');
      }
      const group = await this.prisma.personnelGroup.findUnique({
        where: { id: dto.personnelGroupId },
        select: { id: true, unitId: true },
      });
      if (!group) {
        errors.push('Personel grubu bulunamadı');
      } else if (group.unitId !== dto.unitId) {
        errors.push('Personel grubu seçilen birime bağlı değildir');
      }
      const template = await this.prisma.personShiftTemplate.findUnique({
        where: { id: dto.shiftTemplateId },
        select: {
          id: true,
          personnelGroupId: true,
          unitId: true,
          shiftType: true,
        },
      });
      if (!template) {
        errors.push('Vardiya şablonu bulunamadı');
      } else {
        if (template.personnelGroupId !== dto.personnelGroupId) {
          errors.push('Vardiya şablonu seçilen gruba bağlı değildir');
        }
        if (template.unitId !== dto.unitId) {
          errors.push('Vardiya şablonu seçilen birime bağlı değildir');
        }
        if (template.shiftType !== shiftType) {
          errors.push('Vardiya şablonu vardiya türüyle uyuşmuyor');
        }
      }
      const groupSlot = await this.prisma.assignment.findFirst({
        where: {
          scheduleId,
          kind: 'person',
          personnelGroupId: dto.personnelGroupId,
          date: dto.date,
          shiftType,
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
      });
      if (groupSlot) {
        errors.push(
          `Bu grup için ${dto.date} tarihinde ${shiftType} vardiyası zaten dolu`,
        );
      }
    }

    const samePersonnel = await this.prisma.assignment.findFirst({
      where: {
        scheduleId,
        personnelId: dto.personnelId,
        date: dto.date,
        shiftType,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });
    if (samePersonnel) {
      errors.push(
        `Personel ${dto.date} tarihinde ${shiftType} vardiyasına zaten atanmıştır`,
      );
    }

    if (dto.startTime && dto.endTime && !dto.reason) {
      const overlapping = await this.prisma.assignment.findMany({
        where: {
          scheduleId,
          personnelId: dto.personnelId,
          date: dto.date,
          shiftType: {
            notIn: [
              'off',
              'leave',
              'sick',
              'training',
              'backup',
            ] as ShiftType[],
          },
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
        select: { startTime: true, endTime: true, shiftType: true },
      });
      const overlap = overlapping.find((o) =>
        this.timesOverlap(o.startTime, o.endTime, dto.startTime, dto.endTime),
      );
      if (overlap) {
        errors.push(
          `Personel ${dto.date} tarihinde ${overlap.startTime}-${overlap.endTime} saatlerinde başka bir vardiyaya atanmıştır (saat çakışması)`,
        );
      }
    }

    if (personnelRec) {
      if (!personnelRec.isActive) {
        errors.push('Personel pasif durumdadır');
      }
      if (
        personnelRec.nightShiftEligible === false &&
        (shiftType === 'night' || shiftType === 'evening')
      ) {
        errors.push('Personel gece vardiyası için uygun değildir');
      }
      const dateNum = new Date(dto.date).getDay();
      const offDays = personnelRec.offDays;
      if (offDays && Array.isArray(offDays) && offDays.includes(dateNum)) {
        errors.push(
          `Personelin ${dto.date} tarihinde (gün ${dateNum}) izin günü bulunmaktadır`,
        );
      }
    }

    const prevDate = new Date(dto.date);
    if (isNaN(prevDate.getTime())) return errors;
    prevDate.setDate(prevDate.getDate() - 1);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    if (
      (dto.shiftType === 'day' || dto.shiftType === 'morning') &&
      !dto.reason
    ) {
      const prevNight = await this.prisma.assignment.findFirst({
        where: {
          scheduleId,
          personnelId: dto.personnelId,
          date: prevDateStr,
          shiftType: 'night',
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
      });
      if (prevNight) {
        errors.push(
          'Personel önceki gece vardiyasında çalışmıştır - gündüz vardiyası atanamaz (dinlenme kuralı)',
        );
      }
    }

    return errors;
  }

  private timesOverlap(
    startA: string,
    endA: string,
    startB: string,
    endB: string,
  ): boolean {
    const toMin = (t: string): number => {
      const [h, m] = (t || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    const norm = (s: string, e: string) => {
      let sMin = toMin(s);
      let eMin = toMin(e);
      if (eMin <= sMin) eMin += 1440;
      return { sMin, eMin };
    };
    const a = norm(startA, endA);
    const b = norm(startB, endB);
    if (b.sMin < a.sMin) {
      b.sMin += 1440;
      b.eMin += 1440;
    }
    return a.sMin < b.eMin && b.sMin < a.eMin;
  }

  private async validateAssignmentDetailed(
    scheduleId: string,
    dto: {
      personnelId: string;
      deviceId?: string | null;
      kind?: string;
      unitId?: string;
      personnelGroupId?: string;
      shiftTemplateId?: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType?: string;
      reason?: string;
    },
    excludeAssignmentId?: string,
  ): Promise<AssignmentValidationResult> {
    const violations: AssignmentViolation[] = [];
    const shiftType = dto.shiftType as ShiftType;
    const kind: 'device' | 'person' =
      dto.kind === 'person' ? 'person' : 'device';

    const personnelRec = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: {
        role: true,
        offDays: true,
        isActive: true,
        nightShiftEligible: true,
        unitId: true,
        groupId: true,
        name: true,
      },
    });
    if (!personnelRec) {
      violations.push({
        rule: 'PERSONNEL_NOT_FOUND',
        severity: 'BLOCKING',
        message: 'Personel bulunamadı',
        isOverrideAllowed: false,
      });
      return { violations, hasBlocking: true, hasOverridable: false };
    }
    const personnelType =
      dto.personnelType || personnelRec.role || 'technician';

    if (kind === 'device') {
      if (!dto.deviceId) {
        violations.push({
          rule: 'DEVICE_REQUIRED',
          severity: 'BLOCKING',
          message: 'Cihaz bazlı vardiya için cihaz seçilmelidir',
          isOverrideAllowed: false,
        });
      } else {
        const sameDevice = await this.prisma.assignment.findFirst({
          where: {
            scheduleId,
            deviceId: dto.deviceId,
            date: dto.date,
            shiftType,
            personnelType,
            ...(excludeAssignmentId
              ? { id: { not: excludeAssignmentId } }
              : {}),
          },
          include: { personnel: { select: { name: true } } },
        });
        if (sameDevice) {
          violations.push({
            rule: 'DEVICE_BOOKED',
            severity: 'BLOCKING',
            message: `Cihaz ${dto.date} tarihinde ${shiftType} vardiyası için dolu`,
            details: {
              currentShift: {
                date: sameDevice.date,
                shiftType: sameDevice.shiftType,
                startTime: sameDevice.startTime,
                endTime: sameDevice.endTime,
              },
              newShift: {
                date: dto.date,
                shiftType,
                startTime: dto.startTime,
                endTime: dto.endTime,
              },
            },
            isOverrideAllowed: false,
          });
        }
      }
    } else {
      if (dto.deviceId) {
        violations.push({
          rule: 'PERSON_DEVICE_NOT_ALLOWED',
          severity: 'BLOCKING',
          message: 'Personel nöbeti cihaz gerektirmez',
          isOverrideAllowed: false,
        });
      }
      if (!dto.unitId || !dto.personnelGroupId || !dto.shiftTemplateId) {
        violations.push({
          rule: 'PERSON_FIELDS_REQUIRED',
          severity: 'BLOCKING',
          message:
            'Personel nöbeti için birim, personel grubu ve vardiya şablonu zorunludur',
          isOverrideAllowed: false,
        });
      }
      if (personnelRec.unitId !== dto.unitId) {
        violations.push({
          rule: 'PERSONNEL_NOT_IN_UNIT',
          severity: 'BLOCKING',
          message: 'Personel seçilen birime bağlı değil',
          isOverrideAllowed: false,
        });
      }
      if (
        personnelRec.groupId &&
        personnelRec.groupId !== dto.personnelGroupId
      ) {
        violations.push({
          rule: 'PERSONNEL_NOT_IN_GROUP',
          severity: 'BLOCKING',
          message: 'Personel seçilen gruba bağlı değil',
          isOverrideAllowed: false,
        });
      }
      if (dto.personnelGroupId) {
        const group = await this.prisma.personnelGroup.findUnique({
          where: { id: dto.personnelGroupId },
          select: { id: true, unitId: true, name: true },
        });
        if (!group) {
          violations.push({
            rule: 'GROUP_NOT_FOUND',
            severity: 'BLOCKING',
            message: 'Personel grubu bulunamadı',
            isOverrideAllowed: false,
          });
        } else if (group.unitId !== dto.unitId) {
          violations.push({
            rule: 'GROUP_NOT_IN_UNIT',
            severity: 'BLOCKING',
            message: 'Personel grubu seçilen birime bağlı değil',
            isOverrideAllowed: false,
          });
        }
      }
      if (dto.shiftTemplateId) {
        const template = await this.prisma.personShiftTemplate.findUnique({
          where: { id: dto.shiftTemplateId },
          select: {
            id: true,
            personnelGroupId: true,
            unitId: true,
            shiftType: true,
          },
        });
        if (!template) {
          violations.push({
            rule: 'TEMPLATE_NOT_FOUND',
            severity: 'BLOCKING',
            message: 'Vardiya şablonu bulunamadı',
            isOverrideAllowed: false,
          });
        } else {
          if (template.personnelGroupId !== dto.personnelGroupId) {
            violations.push({
              rule: 'TEMPLATE_NOT_IN_GROUP',
              severity: 'BLOCKING',
              message: 'Vardiya şablonu seçilen gruba bağlı değil',
              isOverrideAllowed: false,
            });
          }
          if (template.unitId !== dto.unitId) {
            violations.push({
              rule: 'TEMPLATE_NOT_IN_UNIT',
              severity: 'BLOCKING',
              message: 'Vardiya şablonu seçilen birime bağlı değil',
              isOverrideAllowed: false,
            });
          }
          if (template.shiftType !== shiftType) {
            violations.push({
              rule: 'TEMPLATE_SHIFT_MISMATCH',
              severity: 'BLOCKING',
              message: 'Vardiya şablonu vardiya türüyle uyuşmuyor',
              isOverrideAllowed: false,
            });
          }
        }
      }
      if (dto.personnelGroupId) {
        const groupSlot = await this.prisma.assignment.findFirst({
          where: {
            scheduleId,
            kind: 'person',
            personnelGroupId: dto.personnelGroupId,
            date: dto.date,
            shiftType,
            ...(excludeAssignmentId
              ? { id: { not: excludeAssignmentId } }
              : {}),
          },
          include: { personnel: { select: { name: true } } },
        });
        if (groupSlot) {
          violations.push({
            rule: 'GROUP_SLOT_OCCUPIED',
            severity: 'BLOCKING',
            message: `Bu grup için ${dto.date} tarihinde ${shiftType} vardiyası zaten dolu`,
            details: {
              currentShift: {
                date: groupSlot.date,
                shiftType: groupSlot.shiftType,
                startTime: groupSlot.startTime,
                endTime: groupSlot.endTime,
              },
              personnelName: groupSlot.personnel?.name,
            },
            isOverrideAllowed: false,
          });
        }
      }
    }

    const samePersonnel = await this.prisma.assignment.findFirst({
      where: {
        scheduleId,
        personnelId: dto.personnelId,
        date: dto.date,
        shiftType,
        ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
      },
    });
    if (samePersonnel) {
      violations.push({
        rule: 'SAME_SLOT',
        severity: 'BLOCKING',
        message: `Personel ${dto.date} tarihinde ${shiftType} vardiyasına zaten atanmıştır`,
        details: {
          currentShift: {
            date: samePersonnel.date,
            shiftType: samePersonnel.shiftType,
            startTime: samePersonnel.startTime,
            endTime: samePersonnel.endTime,
          },
          newShift: {
            date: dto.date,
            shiftType,
            startTime: dto.startTime,
            endTime: dto.endTime,
          },
          personnelName: personnelRec.name,
        },
        isOverrideAllowed: false,
      });
    }

    if (dto.startTime && dto.endTime) {
      const overlapping = await this.prisma.assignment.findMany({
        where: {
          scheduleId,
          personnelId: dto.personnelId,
          date: dto.date,
          shiftType: {
            notIn: [
              'off',
              'leave',
              'sick',
              'training',
              'backup',
            ] as ShiftType[],
          },
          ...(excludeAssignmentId ? { id: { not: excludeAssignmentId } } : {}),
        },
        select: { startTime: true, endTime: true, shiftType: true, date: true },
      });
      const overlap = overlapping.find((o) =>
        this.timesOverlap(o.startTime, o.endTime, dto.startTime, dto.endTime),
      );
      if (overlap) {
        const toMin = (t: string): number => {
          const [h, m] = (t || '00:00').split(':').map(Number);
          return (h || 0) * 60 + (m || 0);
        };
        const overlapMinutes =
          Math.min(
            toMin(overlap.endTime) || toMin(overlap.startTime) + 480,
            toMin(dto.endTime),
          ) - Math.max(toMin(overlap.startTime), toMin(dto.startTime));
        violations.push({
          rule: 'TIME_OVERLAP',
          severity: 'WARNING',
          message: `Personel ${dto.date} tarihinde ${overlap.startTime}-${overlap.endTime} saatlerinde başka bir vardiyaya atanmıştır (saat çakışması)`,
          details: {
            currentShift: {
              date: dto.date,
              shiftType: overlap.shiftType,
              startTime: overlap.startTime,
              endTime: overlap.endTime,
            },
            newShift: {
              date: dto.date,
              shiftType,
              startTime: dto.startTime,
              endTime: dto.endTime,
            },
            restHours: Math.max(0, overlapMinutes),
          },
          isOverrideAllowed: true,
        });
      }
    }

    if (!personnelRec.isActive) {
      violations.push({
        rule: 'INACTIVE_PERSONNEL',
        severity: 'BLOCKING',
        message: 'Personel pasif durumdadır',
        isOverrideAllowed: false,
      });
    }
    if (
      personnelRec.nightShiftEligible === false &&
      (shiftType === 'night' || shiftType === 'evening')
    ) {
      violations.push({
        rule: 'NOT_NIGHT_ELIGIBLE',
        severity: 'WARNING',
        message: 'Personel gece vardiyası için uygun değildir',
        isOverrideAllowed: true,
      });
    }

    const dateNum = new Date(dto.date).getDay();
    const dayNames = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    const offDays = personnelRec.offDays;
    if (offDays && Array.isArray(offDays) && offDays.includes(dateNum)) {
      violations.push({
        rule: 'OFF_DAY_CONFLICT',
        severity: 'WARNING',
        message: `Personelin ${dto.date} tarihinde (${dayNames[dateNum]}) izin günü bulunmaktadır`,
        details: { dayOfWeek: dayNames[dateNum] },
        isOverrideAllowed: true,
      });
    }

    const prevDate = new Date(dto.date);
    if (!isNaN(prevDate.getTime())) {
      prevDate.setDate(prevDate.getDate() - 1);
      const prevDateStr = prevDate.toISOString().split('T')[0];

      if (dto.shiftType === 'day' || dto.shiftType === 'morning') {
        const prevNight = await this.prisma.assignment.findFirst({
          where: {
            scheduleId,
            personnelId: dto.personnelId,
            date: prevDateStr,
            shiftType: 'night',
            ...(excludeAssignmentId
              ? { id: { not: excludeAssignmentId } }
              : {}),
          },
        });
        if (prevNight) {
          const toMin = (t: string): number => {
            const [h, m] = (t || '00:00').split(':').map(Number);
            return (h || 0) * 60 + (m || 0);
          };
          const restMinutes =
            toMin(dto.startTime) - toMin(prevNight.endTime) + 1440;
          const restHours = Math.round((restMinutes / 60) * 10) / 10;
          violations.push({
            rule: 'REST_RULE_VIOLATION',
            severity: 'WARNING',
            message: `Personel önceki gece vardiyasında çalışmıştır - dinlenme süresi yetersiz (gece ${prevNight.endTime} → sabah ${dto.startTime}, ${restHours} saat)`,
            details: {
              currentShift: {
                date: prevDateStr,
                shiftType: 'night',
                startTime: prevNight.startTime,
                endTime: prevNight.endTime,
              },
              newShift: {
                date: dto.date,
                shiftType,
                startTime: dto.startTime,
                endTime: dto.endTime,
              },
              restHours,
              minRestHours: 11,
            },
            isOverrideAllowed: true,
          });
        }
      }
    }

    const hasBlocking = violations.some((v) => v.severity === 'BLOCKING');
    const hasOverridable = violations.some((v) => v.isOverrideAllowed);

    return { violations, hasBlocking, hasOverridable };
  }

  async addAssignment(
    scheduleId: string,
    dto: CreateAssignmentDto,
    userId: string,
    userRole?: string,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        unit: true,
        createdBy: { select: { id: true, organizationId: true } },
      },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    const result = await this.validateAssignmentDetailed(scheduleId, dto);
    if (result.violations.length > 0) {
      const OVERRIDE_ROLES = [
        'system_admin',
        'hospital_admin',
        'imaging_director',
        'supervisor',
      ];
      const canOverride =
        result.hasOverridable &&
        !!userRole &&
        OVERRIDE_ROLES.includes(userRole);
      throw new ConflictException({
        message: 'Atama doğrulama hatası',
        violations: result.violations,
        hasBlocking: result.hasBlocking,
        canOverride,
      });
    }

    const personnelRec = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: { role: true },
    });
    const personnelType =
      dto.personnelType || personnelRec?.role || 'technician';
    const kind = dto.kind === 'person' ? 'person' : 'device';

    const assignment = await this.prisma.assignment.create({
      data: {
        scheduleId,
        personnelId: dto.personnelId,
        deviceId: kind === 'device' ? dto.deviceId : null,
        unitId: kind === 'person' ? dto.unitId : null,
        personnelGroupId: kind === 'person' ? dto.personnelGroupId : null,
        shiftTemplateId: kind === 'person' ? dto.shiftTemplateId : null,
        kind,
        date: dto.date,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        personnelType,
      },
      include: {
        personnel: true,
        device: true,
      },
    });

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { version: { increment: 1 } },
    });

    await this.auditLog
      .log({
        userId,
        action: 'CREATE',
        entityType: 'assignment',
        entityId: assignment.id,
        after: assignment,
      })
      .catch(() => {});

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: schedule.unitId,
        organizationId:
          schedule.createdBy?.organizationId ||
          schedule.unit?.organizationId ||
          undefined,
      })
      .catch(() => {});

    this.notificationEvent.assignmentCreated(
      dto.personnelId,
      schedule.createdBy?.organizationId || schedule.unit?.organizationId || '',
      {
        scheduleId,
        assignmentId: assignment.id,
        date: assignment.date,
        deviceName: assignment.device?.name || 'Cihaz',
      },
    );

    return this.findByUnitType(
      (schedule.unit?.type as string) || '',
      schedule.month,
      schedule.year,
    );
  }

  async overrideAssignment(
    scheduleId: string,
    dto: any,
    userId: string,
    userRole: string,
    userName: string,
  ) {
    const OVERRIDE_ROLES = [
      'system_admin',
      'hospital_admin',
      'imaging_director',
      'supervisor',
    ];
    if (!OVERRIDE_ROLES.includes(userRole)) {
      throw new ForbiddenException(
        'Bu işlem için yetkiniz yok. Süpervizör ve üzeri rol gerekli.',
      );
    }

    if (!dto.confirmedByUser) {
      throw new BadRequestException('İstisna onayı zorunludur');
    }
    if (!dto.overrideReason || !dto.overrideReason.trim()) {
      throw new BadRequestException('İstisna gerekçesi zorunludur');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        unit: true,
        createdBy: { select: { id: true, organizationId: true } },
      },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    const result = await this.validateAssignmentDetailed(scheduleId, dto);
    const nonOverridable = result.violations.filter(
      (v) => !v.isOverrideAllowed,
    );
    if (nonOverridable.length > 0) {
      throw new ConflictException({
        message: 'Bu kurallar istisna ile aşılamaz',
        violations: nonOverridable,
        hasBlocking: true,
        canOverride: false,
      });
    }

    const personnelRec = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: { role: true },
    });
    const personnelType =
      dto.personnelType || personnelRec?.role || 'technician';
    const kind = dto.kind === 'person' ? 'person' : 'device';

    const assignment = await this.prisma.assignment.create({
      data: {
        scheduleId,
        personnelId: dto.personnelId,
        deviceId: kind === 'device' ? dto.deviceId : null,
        unitId: kind === 'person' ? dto.unitId : null,
        personnelGroupId: kind === 'person' ? dto.personnelGroupId : null,
        shiftTemplateId: kind === 'person' ? dto.shiftTemplateId : null,
        kind,
        date: dto.date,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        personnelType,
      },
      include: {
        personnel: true,
        device: true,
      },
    });

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { version: { increment: 1 } },
    });

    await this.auditLog
      .log({
        userId,
        action: 'ASSIGNMENT_OVERRIDE',
        entityType: 'assignment',
        entityId: assignment.id,
        after: assignment,
        reason: dto.overrideReason,
        description: `İstisna onayı ile atama yapıldı. Onaylayan: ${userName} (${userRole}). Gerekçe: ${dto.overrideReason}. Override edilen kurallar: ${dto.violatedRules?.join(', ') || 'N/A'}`,
        metadata: {
          overrideReason: dto.overrideReason,
          violatedRules: dto.violatedRules || [],
          overriddenBy: userId,
          overriddenByName: userName,
          overriddenByRole: userRole,
          originalViolations: result.violations.map((v) => ({
            rule: v.rule,
            severity: v.severity,
          })),
        },
      })
      .catch(() => {});

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: schedule.unitId,
        organizationId:
          schedule.createdBy?.organizationId ||
          schedule.unit?.organizationId ||
          undefined,
      })
      .catch(() => {});

    this.notificationEvent.assignmentCreated(
      dto.personnelId,
      schedule.createdBy?.organizationId || schedule.unit?.organizationId || '',
      {
        scheduleId,
        assignmentId: assignment.id,
        date: assignment.date,
        deviceName: assignment.device?.name || 'Personel',
      },
    );

    return this.findByUnitType(
      (schedule.unit?.type as string) || '',
      schedule.month,
      schedule.year,
    );
  }

  async directAssign(
    unitType: string,
    month: number,
    year: number,
    dto: CreateAssignmentDto,
    userId: string,
    userRole: string,
    userName: string,
    userEmail: string,
  ) {
    if (!canDirectAssign(userRole)) {
      throw new ForbiddenException(
        'Bu islemi yapmak icin yetkiniz yok. Sorumlu Tekniker ve ustu rol gerekli.',
      );
    }

    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as any },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadi: ${unitType}`);
    }

    let schedule = await this.prisma.schedule.findFirst({
      where: { unitId: unit.id, month, year },
    });

    const isNewSchedule = !schedule;
    if (isNewSchedule) {
      schedule = await this.prisma.schedule.create({
        data: {
          unitId: unit.id,
          month,
          year,
          status: 'published',
          publishedAt: new Date(),
          createdById: userId,
        },
      });

      await this.auditLog
        .log({
          userId,
          action: 'CREATE',
          entityType: 'schedule',
          entityId: schedule.id,
          after: { ...schedule!, status: 'published', autoCreated: true },
        })
        .catch(() => {});
    } else if (schedule!.status !== 'published') {
      await this.prisma.schedule.update({
        where: { id: schedule!.id },
        data: {
          status: 'published',
          publishedAt: new Date(),
        },
      });

      await this.auditLog
        .log({
          userId,
          action: 'PUBLISH',
          entityType: 'schedule',
          entityId: schedule!.id,
          before: { status: schedule!.status },
          after: { status: 'published', autoPublished: true },
        })
        .catch(() => {});
    }

    const scheduleId = schedule!.id;
    const result = await this.validateAssignmentDetailed(scheduleId, dto);
    if (result.violations.length > 0) {
      const OVERRIDE_ROLES = [
        'system_admin',
        'hospital_admin',
        'imaging_director',
        'supervisor',
      ];
      const canOverride =
        result.hasOverridable && OVERRIDE_ROLES.includes(userRole);
      throw new ConflictException({
        message: 'Atama doğrulama hatası',
        violations: result.violations,
        hasBlocking: result.hasBlocking,
        canOverride,
      });
    }

    const personnelRec = await this.prisma.personnel.findUnique({
      where: { id: dto.personnelId },
      select: { role: true },
    });
    const personnelType =
      dto.personnelType || personnelRec?.role || 'technician';
    const kind = dto.kind === 'person' ? 'person' : 'device';

    const assignment = await this.prisma.assignment.create({
      data: {
        scheduleId,
        personnelId: dto.personnelId,
        deviceId: kind === 'device' ? dto.deviceId : null,
        unitId: kind === 'person' ? dto.unitId : null,
        personnelGroupId: kind === 'person' ? dto.personnelGroupId : null,
        shiftTemplateId: kind === 'person' ? dto.shiftTemplateId : null,
        kind,
        date: dto.date,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        personnelType,
      },
      include: {
        personnel: true,
        device: true,
      },
    });

    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { version: { increment: 1 } },
    });

    await this.auditLog
      .log({
        userId,
        action: 'CREATE',
        entityType: 'assignment',
        entityId: assignment.id,
        after: assignment,
      })
      .catch(() => {});

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: unit.id,
        organizationId: unit.organizationId || undefined,
      })
      .catch(() => {});

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'updated',
        personnelId: assignment.personnelId,
        personnelName: assignment.personnel?.name || '',
        unitId: unit.id,
        organizationId: unit.organizationId || undefined,
      })
      .catch(() => {});

    this.notificationEvent.assignmentCreated(
      dto.personnelId,
      unit.organizationId || '',
      {
        scheduleId,
        assignmentId: assignment.id,
        date: assignment.date,
        deviceName: assignment.device?.name || 'Cihaz',
      },
    );

    return this.findByUnitType(unitType, month, year);
  }

  async updateAssignment(
    id: string,
    assignmentId: string,
    dto: Partial<CreateAssignmentDto>,
    userId: string,
  ) {
    const existing = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { schedule: { include: { unit: true } } },
    });
    if (!existing || existing.scheduleId !== id) {
      throw new NotFoundException('Assignment not found');
    }

    const mergedDto = {
      personnelId: dto.personnelId ?? existing.personnelId,
      deviceId:
        dto.deviceId !== undefined ? dto.deviceId || null : existing.deviceId,
      unitId:
        dto.unitId !== undefined
          ? dto.unitId || undefined
          : existing.unitId || undefined,
      personnelGroupId:
        dto.personnelGroupId !== undefined
          ? dto.personnelGroupId || undefined
          : existing.personnelGroupId || undefined,
      shiftTemplateId:
        dto.shiftTemplateId !== undefined
          ? dto.shiftTemplateId || undefined
          : existing.shiftTemplateId || undefined,
      kind: dto.kind ?? existing.kind,
      date: dto.date ?? existing.date,
      shiftType: (dto.shiftType ?? existing.shiftType) as string,
      startTime: dto.startTime ?? existing.startTime,
      endTime: dto.endTime ?? existing.endTime,
      personnelType: dto.personnelType ?? existing.personnelType ?? undefined,
    };

    const result = await this.validateAssignmentDetailed(
      id,
      mergedDto,
      assignmentId,
    );
    if (result.violations.length > 0) {
      throw new ConflictException({
        message: 'Atama doğrulama hatası',
        violations: result.violations,
        hasBlocking: result.hasBlocking,
        canOverride: false,
      });
    }

    const kind = mergedDto.kind === 'person' ? 'person' : 'device';

    await this.prisma.assignment.update({
      where: { id: assignmentId },
      data: {
        personnelId: mergedDto.personnelId,
        deviceId: kind === 'device' ? mergedDto.deviceId : null,
        unitId: kind === 'person' ? mergedDto.unitId : null,
        personnelGroupId: kind === 'person' ? mergedDto.personnelGroupId : null,
        shiftTemplateId: kind === 'person' ? mergedDto.shiftTemplateId : null,
        kind,
        date: mergedDto.date,
        shiftType: mergedDto.shiftType as ShiftType,
        startTime: mergedDto.startTime,
        endTime: mergedDto.endTime,
        ...(mergedDto.personnelType
          ? { personnelType: mergedDto.personnelType }
          : {}),
      },
    });

    await this.prisma.schedule.update({
      where: { id },
      data: { version: { increment: 1 } },
    });

    return this.findByUnitType(
      (existing.schedule?.unit?.type as string) || '',
      existing.schedule.month,
      existing.schedule.year,
    );
  }

  async removeAssignment(id: string, assignmentId: string, userId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { personnel: { select: { id: true, name: true } } },
    });

    if (!assignment || assignment.scheduleId !== id) {
      throw new NotFoundException('Assignment not found');
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: { unit: true },
    });

    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    await this.prisma.assignment.delete({ where: { id: assignmentId } });

    await this.prisma.schedule.update({
      where: { id },
      data: { version: { increment: 1 } },
    });

    await this.auditLog
      .log({
        userId,
        action: 'DELETE',
        entityType: 'assignment',
        entityId: assignmentId,
        before: assignment,
      })
      .catch(() => {});

    this.gateway
      .broadcastAlertUpdate({
        scheduleId: id,
        unitId: schedule?.unitId || '',
        organizationId: schedule?.unit?.organizationId || undefined,
      })
      .catch(() => {});

    if (assignment.personnelId) {
      this.notificationEvent.assignmentRemoved(
        assignment.personnelId,
        schedule?.unit?.organizationId || '',
        { scheduleId: id, assignmentId, date: assignment.date },
      );
    }

    return this.findByUnitType(
      (schedule.unit?.type as string) || '',
      schedule.month,
      schedule.year,
    );
  }

  async findPersonScheduleByUnitType(
    unitType: string,
    month: number,
    year: number,
  ) {
    if (!unitType) {
      throw new BadRequestException('Birim parametresi zorunludur');
    }
    if (!month || !year) {
      throw new BadRequestException('Ay ve yıl parametreleri zorunludur');
    }

    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }

    const schedule = await this.findByUnitMonthYear(unit.id, month, year);

    const groups = await this.prisma.personnelGroup.findMany({
      where: { unitId: unit.id, isActive: true },
      include: {
        shiftTemplates: {
          where: { isActive: true },
          orderBy: [{ startTime: 'asc' }, { shiftType: 'asc' }],
        },
        _count: { select: { personnel: true } },
      },
      orderBy: { name: 'asc' },
    });

    const personAssignments = schedule
      ? schedule.assignments.filter((a) => a.kind === 'person')
      : [];

    return {
      unit: unitType,
      month,
      year,
      scheduleId: schedule?.id ?? null,
      status: schedule?.status ?? 'draft',
      unitId: unit.id,
      groups: groups.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
        description: g.description,
        personnelCount: g._count.personnel,
        templates: g.shiftTemplates.map((t) => ({
          id: t.id,
          name: t.name,
          shiftType: t.shiftType,
          startTime: t.startTime,
          endTime: t.endTime,
        })),
        assignments: personAssignments
          .filter((a) => a.personnelGroupId === g.id)
          .map((a) => ({
            id: a.id,
            date: a.date,
            shiftType: a.shiftType,
            startTime: a.startTime,
            endTime: a.endTime,
            personnelId: a.personnelId,
            personnelName: a.personnel?.name || '',
            personnelType: a.personnel?.role || a.personnelType || null,
            isConfirmed: a.isConfirmed,
          })),
      })),
    };
  }

  async getPersonShiftReport(
    unitType: string,
    month: number,
    year: number,
    filters?: { groupId?: string; personnelId?: string },
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }

    const schedule = await this.findByUnitMonthYear(unit.id, month, year);
    const personAssignments = (schedule?.assignments || []).filter(
      (a) => a.kind === 'person',
    );

    const groupWhere: Prisma.PersonnelGroupWhereInput = {
      unitId: unit.id,
      isActive: true,
    };
    if (filters?.groupId) groupWhere.id = filters.groupId;
    const groups = await this.prisma.personnelGroup.findMany({
      where: groupWhere,
      include: { _count: { select: { personnel: true } } },
      orderBy: { name: 'asc' },
    });
    const groupNameMap = new Map(groups.map((g) => [g.id, g.name]));

    const byPersonnel = new Map<string, any>();
    for (const a of personAssignments) {
      if (filters?.groupId && a.personnelGroupId !== filters.groupId) continue;
      if (filters?.personnelId && a.personnelId !== filters.personnelId)
        continue;
      const key = a.personnelId;
      if (!byPersonnel.has(key)) {
        byPersonnel.set(key, {
          personnelId: a.personnelId,
          personnelName: a.personnel?.name || a.personnelId,
          personnelType: a.personnel?.role || a.personnelType || '',
          groupId: a.personnelGroupId,
          groupName: groupNameMap.get(a.personnelGroupId || '') || '',
          totalShifts: 0,
          totalHours: 0,
          dayShifts: 0,
          eveningShifts: 0,
          nightShifts: 0,
          weekendShifts: 0,
          dates: [],
        });
      }
      const row = byPersonnel.get(key);
      row.totalShifts += 1;
      row.totalHours += this.shiftHours(a.startTime, a.endTime);
      if (a.shiftType === 'day' || a.shiftType === 'morning')
        row.dayShifts += 1;
      else if (a.shiftType === 'evening') row.eveningShifts += 1;
      else if (a.shiftType === 'night') row.nightShifts += 1;
      const dayOfWeek = new Date(a.date).getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      if (isWeekend) row.weekendShifts += 1;
      row.dates.push({
        date: a.date,
        shiftType: a.shiftType,
        startTime: a.startTime,
        endTime: a.endTime,
        isNight: a.shiftType === 'night',
        isWeekend,
      });
    }

    const rows = [...byPersonnel.values()].map((r) => ({
      ...r,
      dates: r.dates.sort((x: any, y: any) => x.date.localeCompare(y.date)),
    }));

    const groupSummary = groups.map((g) => {
      const groupRows = rows.filter((r) => r.groupId === g.id);
      return {
        groupId: g.id,
        groupName: g.name,
        personnelCount: g._count.personnel,
        assignedPersonnel: groupRows.length,
        totalShifts: groupRows.reduce((s, r) => s + r.totalShifts, 0),
        totalHours:
          Math.round(groupRows.reduce((s, r) => s + r.totalHours, 0) * 10) / 10,
        nightShifts: groupRows.reduce((s, r) => s + r.nightShifts, 0),
        weekendShifts: groupRows.reduce((s, r) => s + r.weekendShifts, 0),
      };
    });

    return {
      unit: unitType,
      month,
      year,
      scheduleId: schedule?.id ?? null,
      unitId: unit.id,
      rows,
      groups: groupSummary,
      summary: {
        totalAssignments: personAssignments.length,
        totalHours:
          Math.round(
            personAssignments.reduce(
              (s, a) => s + this.shiftHours(a.startTime, a.endTime),
              0,
            ) * 10,
          ) / 10,
        nightShifts: personAssignments.filter((a) => a.shiftType === 'night')
          .length,
        weekendShifts: rows.reduce((s, r) => s + r.weekendShifts, 0),
      },
    };
  }

  private shiftHours(startTime: string, endTime: string): number {
    if (!startTime || !endTime) return 0;
    const toMin = (t: string): number => {
      const [h, m] = (t || '00:00').split(':').map(Number);
      return (h || 0) * 60 + (m || 0);
    };
    let diff = toMin(endTime) - toMin(startTime);
    if (diff <= 0) diff += 1440;
    return diff / 60;
  }

  async rollback(id: string, version: number, userId: string) {
    const snapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: {
        scheduleId: id,
        version,
      },
    });

    if (!snapshot) {
      throw new NotFoundException('Snapshot not found');
    }

    const currentSchedule = await this.prisma.schedule.findUnique({
      where: { id },
    });

    const data = snapshot.data as unknown as SnapshotData;
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.assignment.deleteMany({ where: { scheduleId: id } });

      if (data && data.assignments && Array.isArray(data.assignments)) {
        await tx.assignment.createMany({
          data: data.assignments.map((a: SnapshotAssignment) => {
            const kind = a.kind === 'person' ? 'person' : 'device';
            return {
              scheduleId: id,
              personnelId: a.personnelId,
              deviceId: kind === 'device' ? a.deviceId : null,
              unitId: kind === 'person' ? a.unitId : null,
              personnelGroupId: kind === 'person' ? a.personnelGroupId : null,
              shiftTemplateId: kind === 'person' ? a.shiftTemplateId : null,
              kind,
              date: a.date,
              shiftType: a.shiftType as ShiftType,
              startTime: a.startTime,
              endTime: a.endTime,
            };
          }),
        });
      }

      return tx.schedule.update({
        where: { id },
        data: {
          version: { increment: 1 },
        },
        include: {
          unit: true,
          assignments: {
            include: {
              personnel: true,
              device: true,
            },
          },
        },
      });
    });

    await this.auditLog
      .log({
        userId,
        action: 'ROLLBACK',
        entityType: 'schedule',
        entityId: id,
        before: currentSchedule,
        after: { rolledBackToVersion: version, schedule: updated },
      })
      .catch(() => {});

    return updated;
  }

  async getSnapshots(id: string) {
    return this.prisma.scheduleSnapshot.findMany({
      where: { scheduleId: id },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        createdAt: true,
        createdBy: {
          select: { id: true, name: true },
        },
      },
    });
  }

  private async createSnapshot(scheduleId: string, userId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { assignments: true },
    });

    if (!schedule) return;

    await this.prisma.scheduleSnapshot.create({
      data: {
        scheduleId,
        version: schedule.version,
        data: {
          assignments: schedule.assignments,
        },
        createdById: userId,
      },
    });
  }

  async delete(id: string, userId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: { unit: { select: { organizationId: true } } },
    });
    if (!schedule) {
      throw new NotFoundException('Schedule not found');
    }

    await this.prisma.schedule.delete({ where: { id } });

    await this.auditLog
      .log({
        userId,
        action: 'DELETE',
        entityType: 'schedule',
        entityId: id,
        before: schedule,
      })
      .catch(() => {});

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'deleted',
        personnelId: id,
        personnelName: `Schedule ${schedule.month}/${schedule.year}`,
        unitId: schedule.unitId,
        organizationId: schedule.unit?.organizationId || undefined,
      })
      .catch(() => {});

    return { success: true };
  }

  async duplicate(
    sourceId: string,
    targetMonth: number,
    targetYear: number,
    userId: string,
  ) {
    const source = await this.findOne(sourceId);

    const schedule = await this.prisma.schedule.create({
      data: {
        unitId: source.unitId,
        month: targetMonth,
        year: targetYear,
        status: 'draft',
        createdById: userId,
      },
    });

    if (source.assignments && source.assignments.length > 0) {
      const dateMap = new Map<string, string>();

      for (const assignment of source.assignments) {
        const sourceDate = new Date(assignment.date);
        const targetDate = new Date(
          targetYear,
          targetMonth - 1,
          sourceDate.getDate(),
        );
        const newDate = targetDate.toISOString().split('T')[0];

        if (!dateMap.has(assignment.date)) {
          dateMap.set(assignment.date, newDate);
        }
      }

      await this.prisma.assignment.createMany({
        data: source.assignments.map((a: any) => {
          const newDate = dateMap.get(a.date) || a.date;
          const kind = a.kind === 'person' ? 'person' : 'device';
          return {
            scheduleId: schedule.id,
            personnelId: a.personnelId,
            deviceId: kind === 'device' ? a.deviceId : null,
            unitId: kind === 'person' ? a.unitId : null,
            personnelGroupId: kind === 'person' ? a.personnelGroupId : null,
            shiftTemplateId: kind === 'person' ? a.shiftTemplateId : null,
            kind,
            date: newDate,
            shiftType: a.shiftType as ShiftType,
            startTime: a.startTime,
            endTime: a.endTime,
          };
        }),
      });
    }

    return this.findOne(schedule.id);
  }

  async getShiftOverrides(unitType: string, month: number, year: number) {
    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const overrides = await this.prisma.shiftDateOverride.findMany({
      where: {
        shift: { unitId: unit.id },
        date: { gte: startDate, lte: endDate },
      },
      select: {
        id: true,
        shiftId: true,
        date: true,
        isEnabled: true,
        shift: { select: { id: true, deviceId: true, name: true } },
      },
    });
    return overrides.map((o) => ({
      id: o.id,
      shiftId: o.shiftId,
      date: o.date,
      isEnabled: o.isEnabled,
      shiftName: o.shift?.name || '',
      deviceId: o.shift?.deviceId || null,
    }));
  }

  async setShiftOverride(
    unitType: string,
    shiftId: string,
    date: string,
    isEnabled: boolean,
    userId: string,
  ) {
    const unit = await this.prisma.unit.findFirst({
      where: { type: unitType as UnitType },
    });
    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitType}`);
    }
    const shift = await this.prisma.shifts.findUnique({
      where: { id: shiftId },
    });
    if (!shift || shift.unitId !== unit.id) {
      throw new NotFoundException('Vardiya bulunamadı');
    }
    if (!shift.optionalOnWeekends && !shift.optionalOnHolidays) {
      throw new BadRequestException(
        'Bu vardiya hafta sonu / resmi tatil için opsiyonel değildir',
      );
    }

    const existing = await this.prisma.shiftDateOverride.findUnique({
      where: { shiftId_date: { shiftId, date } },
    });

    if (isEnabled) {
      if (existing) {
        if (existing.isEnabled) {
          return { id: existing.id, shiftId, date, isEnabled: true };
        }
        return this.prisma.shiftDateOverride.update({
          where: { id: existing.id },
          data: { isEnabled: true },
        });
      }
      return this.prisma.shiftDateOverride.create({
        data: { shiftId, date, isEnabled: true, createdById: userId },
      });
    }

    if (existing) {
      await this.prisma.shiftDateOverride.delete({
        where: { id: existing.id },
      });
    }
    return { success: true, shiftId, date, isEnabled: false };
  }

  async getAnalytics(organizationId?: string) {
    const scheduleWhere: Prisma.ScheduleWhereInput = {};
    if (organizationId) {
      scheduleWhere.unit = { organizationId };
    }

    const totalSchedules = await this.prisma.schedule.count({
      where: scheduleWhere,
    });
    const draftSchedules = await this.prisma.schedule.count({
      where: { ...scheduleWhere, status: 'draft' },
    });
    const publishedSchedules = await this.prisma.schedule.count({
      where: { ...scheduleWhere, status: 'published' },
    });
    const totalAssignments = await this.prisma.assignment.count();
    const totalPersonnel = await this.prisma.personnel.count();
    const totalDevices = await this.prisma.device.count({
      where: organizationId ? { organizationId } : {},
    });

    const unitBreakdown = await this.prisma.unit.findMany({
      where: organizationId ? { organizationId } : {},
      include: {
        _count: {
          select: {
            schedules: true,
            personnel: true,
            devices: true,
          },
        },
      },
    });

    return {
      totalSchedules,
      draftSchedules,
      publishedSchedules,
      totalAssignments,
      totalPersonnel,
      totalDevices,
      unitBreakdown: unitBreakdown.map((u) => ({
        code: u.code,
        name: u.name,
        type: u.type,
        schedules: u._count.schedules,
        personnel: u._count.personnel,
        devices: u._count.devices,
      })),
    };
  }

  async getDashboardStats(organizationId?: string) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const orgFilter = organizationId ? { organizationId } : {};

    const [
      personnelCount,
      allAssignments,
      todayAssignments,
      pendingRequests,
      devices,
      monthSchedules,
    ] = await Promise.all([
      this.prisma.personnel.count({
        where: organizationId ? { unit: { organizationId } } : {},
      }),
      this.prisma.assignment.findMany({
        where: { date: { startsWith: monthStr } },
        select: {
          shiftType: true,
          personnelId: true,
          scheduleId: true,
          date: true,
        },
      }),
      this.prisma.assignment.findMany({
        where: { date: today },
        select: { id: true },
      }),
      this.prisma.swapRequest.count({ where: { status: 'pending' } }),
      this.prisma.device.findMany({
        where: orgFilter as any,
        select: { mode: true },
      }),
      this.prisma.schedule.findMany({
        where: {
          ...(organizationId ? { unit: { organizationId } } : {}),
          month,
          year,
        },
        select: {
          status: true,
          id: true,
          _count: { select: { assignments: true } },
        },
      }),
    ]);

    const activeShifts = monthSchedules.filter(
      (s) => s.status === 'published',
    ).length;
    const missingAssignments = monthSchedules.filter(
      (s) => s._count.assignments === 0,
    ).length;
    const todayShifts = todayAssignments.length;
    const nightShifts = allAssignments.filter(
      (a) => a.shiftType === 'night',
    ).length;
    const monthlyHours = allAssignments.length * 8;

    const uniquePersonnel = new Set(allAssignments.map((a) => a.personnelId));
    const weeklyAssignments = allAssignments.filter((a) => {
      const d = new Date(a.date + 'T00:00:00');
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      return d >= weekStart;
    });
    const weeklyHours = weeklyAssignments.length * 8;

    const mrDevices = devices.filter((d) =>
      d.mode?.toLowerCase().includes('mr'),
    ).length;
    const btDevices = devices.filter(
      (d) =>
        d.mode?.toLowerCase().includes('bt') ||
        d.mode?.toLowerCase().includes('ct'),
    ).length;

    const fairnessScore =
      uniquePersonnel.size > 0
        ? Math.min(
            100,
            Math.round((allAssignments.length / uniquePersonnel.size) * 10),
          )
        : 100;

    return {
      activeShifts,
      missingAssignments,
      pendingRequests,
      monthlyHours,
      totalEmployees: personnelCount,
      mrDevices,
      btDevices,
      todayShifts,
      weeklyHours,
      nightShifts,
      overtimeHours: Math.max(0, monthlyHours - uniquePersonnel.size * 160),
      fairnessScore,
    };
  }
}
