import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { Prisma, UnitType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AuditLogService, AuditAction } from '../audit-log/audit-log.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { EventBusService } from '../../events/event-bus.service';
import {
  createEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
} from '../../events/domain-event.interface';

@Injectable()
export class PersonnelService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    @Inject(forwardRef(() => ScheduleGateway))
    private gateway: ScheduleGateway,
    private eventBus: EventBusService,
  ) {}

  async resolveUnit(value: string) {
    const validUnitTypes = [
      'mr',
      'bt',
      'rontgen',
      'nukleer',
      'onkoloji',
      'ultrason',
      'anjiyo',
      'mamografi',
      'kemik_dansitometri',
      'floroskopi',
      'pet_ct',
      'spect_ct',
      'linak',
      'simutasyon_ct',
      'mobil',
      'supervizor',
    ];
    return this.prisma.unit.findFirst({
      where: {
        OR: [
          { id: value },
          { code: value.toUpperCase() },
          ...(validUnitTypes.includes(value)
            ? [{ type: value as UnitType }]
            : []),
        ],
      },
    });
  }

  async findAll(filters?: {
    unitId?: string;
    isActive?: boolean | string;
    search?: string;
    month?: number;
    year?: number;
  }) {
    const where: Prisma.PersonnelWhereInput = {};

    if (filters?.unitId) {
      const unit = await this.resolveUnit(filters.unitId);
      if (!unit) {
        return [];
      }
      where.unitId = unit.id;
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive === true || filters.isActive === 'true';
    }

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const personnel = await this.prisma.personnel.findMany({
      where,
      include: {
        unit: true,
        _count: {
          select: {
            assignments:
              filters?.month && filters?.year
                ? {
                    where: {
                      schedule: { month: filters.month, year: filters.year },
                    },
                  }
                : true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    if (filters?.month && filters?.year) {
      const month = filters.month;
      const year = filters.year;
      const assignments = await this.prisma.assignment.findMany({
        where: { schedule: { month, year } },
        select: {
          personnelId: true,
          shiftType: true,
          startTime: true,
          endTime: true,
          date: true,
        },
      });
      const byPerson = new Map<
        string,
        Array<{
          shiftType: string;
          startTime: string;
          endTime: string;
          date: string;
        }>
      >();
      for (const a of assignments) {
        const list = byPerson.get(a.personnelId) || [];
        list.push(a);
        byPerson.set(a.personnelId, list);
      }
      return personnel.map((p) => ({
        ...p,
        stats: this.computeStats(
          p.id,
          month,
          year,
          p.maxWeeklyHours || 40,
          byPerson.get(p.id) || [],
        ),
      }));
    }

    return personnel;
  }

  private parseTime(t: string): number {
    const [h, m] = t.split(':').map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
  }

  private durationHours(startTime: string, endTime: string): number {
    const start = this.parseTime(startTime || '08:00');
    const end = this.parseTime(endTime || '16:00');
    const diff = end - start;
    return Math.max(diff, 0) / 60;
  }

  private computeStats(
    personnelId: string,
    month: number,
    year: number,
    maxWeeklyHours: number,
    assignments: Array<{
      shiftType: string;
      startTime: string;
      endTime: string;
      date: string;
    }>,
  ) {
    const daysInMonth = new Date(year, month, 0).getDate();
    const weeksInMonth = daysInMonth / 7;
    const totalShifts = assignments.length;
    const dayShifts = assignments.filter(
      (a) => a.shiftType === 'day' || a.shiftType === 'evening',
    ).length;
    const nightShifts = assignments.filter(
      (a) => a.shiftType === 'night',
    ).length;
    const totalHours = assignments.reduce(
      (sum, a) => sum + this.durationHours(a.startTime, a.endTime),
      0,
    );
    const weeklyHours = weeksInMonth > 0 ? totalHours / weeksInMonth : 0;
    const workloadPercentage =
      maxWeeklyHours > 0 ? Math.round((weeklyHours / maxWeeklyHours) * 100) : 0;
    const riskLevel =
      totalShifts === 0 || workloadPercentage <= 50
        ? 'low'
        : workloadPercentage <= 70
          ? 'moderate'
          : workloadPercentage <= 90
            ? 'high'
            : 'critical';
    const critical = workloadPercentage > 90;
    return {
      personnelId,
      selectedMonth: month,
      totalShifts,
      dayShifts,
      nightShifts,
      totalHours: Math.round(totalHours * 10) / 10,
      weeklyHours: Math.round(weeklyHours * 10) / 10,
      workloadPercentage,
      riskLevel,
      critical,
      conflicts: 0,
    };
  }

  async findOne(id: string, organizationId?: string) {
    const personnel = await this.prisma.personnel.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
      },
      include: {
        unit: true,
        assignments: {
          include: {
            schedule: true,
            device: true,
          },
          orderBy: { date: 'desc' },
          take: 50,
        },
      },
    });

    if (!personnel) {
      throw new NotFoundException('Personnel not found');
    }

    return personnel;
  }

  async create(
    data: {
      name: string;
      role?: string;
      employeeNo?: string;
      email?: string;
      phone?: string;
      unitId: string;
      organizationId?: string;
      skills?: string[];
      seniority?: number;
      specialization?: string;
      experienceYears?: number;
      certifications?: string[];
      deviceSkills?: string[];
      nightShiftEligible?: boolean;
      employmentStatus?: string;
      startDate?: string;
      notes?: string;
      offDays?: number[];
      maxWeeklyHours?: number;
    },
    userId?: string,
  ) {
    let unitId = data.unitId;
    const unit = await this.prisma.unit.findFirst({
      where: {
        OR: [
          { id: data.unitId },
          { code: data.unitId.toUpperCase() },
          { type: data.unitId as UnitType },
        ],
      },
    });
    if (!unit) {
      throw new BadRequestException(`Geçersiz birim: ${data.unitId}`);
    }
    unitId = unit.id;

    const created = await this.prisma.personnel.create({
      data: {
        name: data.name,
        role: data.role || 'technician',
        employeeNo: data.employeeNo,
        email: data.email,
        phone: data.phone,
        unitId,
        skills: data.skills || [],
        seniority: data.seniority || 0,
        specialization: data.specialization,
        experienceYears: data.experienceYears || 0,
        certifications: data.certifications || [],
        deviceSkills: data.deviceSkills || [],
        nightShiftEligible: data.nightShiftEligible ?? true,
        employmentStatus: data.employmentStatus || 'active',
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        notes: data.notes,
        offDays: data.offDays || [],
        maxWeeklyHours: data.maxWeeklyHours || 40,
      },
      include: {
        unit: true,
      },
    });

    if (userId) {
      await this.auditLog
        .log({
          userId,
          action: AuditAction.CREATE,
          entityType: 'personnel',
          entityId: created.id,
          after: created,
        })
        .catch(() => {});
    }

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'created',
        personnelId: created.id,
        personnelName: created.name,
        unitId: created.unitId || undefined,
        organizationId: created.unit?.organizationId || undefined,
      })
      .catch(() => {});

    this.eventBus.publish(
      createEvent(
        EVENT_NAMES.PERSONNEL_CREATED,
        created.id,
        AGGREGATE_TYPES.PERSONNEL,
        {
          personnelId: created.id,
          name: created.name,
          role: created.role,
          unitId: created.unitId,
          organizationId: created.unit?.organizationId,
          employeeNo: created.employeeNo,
          email: created.email,
        },
        userId || created.id,
      ),
    );

    return created;
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      role: string;
      employeeNo: string;
      email: string;
      phone: string;
      skills: string[];
      seniority: number;
      specialization: string;
      experienceYears: number;
      certifications: string[];
      deviceSkills: string[];
      nightShiftEligible: boolean;
      employmentStatus: string;
      startDate: string;
      notes: string;
      offDays: number[];
      maxWeeklyHours: number;
      isActive: boolean;
      unitId: string;
      organizationId: string;
      version: number;
    }>,
    userId?: string,
  ) {
    const {
      version: clientVersion,
      unitId: _unitId,
      organizationId: _orgId,
      ...rest
    } = data;
    const updateData: Prisma.PersonnelUncheckedUpdateInput = {
      ...rest,
    } as Prisma.PersonnelUncheckedUpdateInput;

    if (data.unitId) {
      const unit = await this.prisma.unit.findFirst({
        where: {
          OR: [
            { id: data.unitId },
            { code: data.unitId.toUpperCase() },
            { type: data.unitId as UnitType },
          ],
        },
      });
      if (unit) updateData.unitId = unit.id;
    }

    if (data.startDate) {
      updateData.startDate = new Date(data.startDate);
    }

    const before = await this.prisma.personnel.findUnique({
      where: { id },
      include: { unit: true },
    });
    if (!before) throw new NotFoundException('Personnel not found');

    if (clientVersion !== undefined && before.version !== clientVersion) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        message:
          'Personnel was modified by another user. Please refresh and try again.',
        currentVersion: before.version,
        clientVersion,
      });
    }

    const updated = await this.prisma.personnel.update({
      where: { id },
      data: {
        ...updateData,
        version: { increment: 1 },
      },
      include: {
        unit: true,
      },
    });

    if (userId) {
      await this.auditLog
        .log({
          userId,
          action: AuditAction.UPDATE,
          entityType: 'personnel',
          entityId: id,
          before,
          after: updated,
        })
        .catch(() => {});
    }

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'updated',
        personnelId: id,
        personnelName: updated.name,
        unitId: updated.unitId || undefined,
        organizationId: before?.unit?.organizationId || undefined,
        updatedBy: userId,
      })
      .catch(() => {});

    return updated;
  }

  async delete(id: string, userId?: string) {
    const before = await this.prisma.personnel.findUnique({
      where: { id },
      include: { unit: true },
    });

    if (!before) {
      throw new NotFoundException('Personnel not found');
    }

    const activeAssignments = await this.prisma.assignment.count({
      where: {
        personnelId: id,
        schedule: { status: { not: 'archived' } },
      },
    });

    if (activeAssignments > 0) {
      throw new ConflictException(
        `Bu personelin ${activeAssignments} aktif vardiya ataması bulunmaktadır. Silinmeden önce tüm atamalar kaldırılmalıdır.`,
      );
    }

    await this.prisma.personnel.delete({ where: { id } });

    if (userId && before) {
      await this.auditLog
        .log({
          userId,
          action: AuditAction.DELETE,
          entityType: 'personnel',
          entityId: id,
          before,
        })
        .catch(() => {});
    }

    this.gateway
      .broadcastPersonnelUpdate({
        action: 'deleted',
        personnelId: id,
        personnelName: before?.name || id,
        unitId: before?.unitId || undefined,
        organizationId: before?.unit?.organizationId || undefined,
      })
      .catch(() => {});

    return { success: true };
  }

  async getWorkload(id: string, month?: number, year?: number) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        maxWeeklyHours: true,
        assignments: {
          where: {
            schedule: {
              ...(month && { month }),
              ...(year && { year }),
            },
          },
          select: {
            shiftType: true,
            startTime: true,
            endTime: true,
            date: true,
            deviceId: true,
          },
        },
      },
    });

    if (!personnel) {
      throw new NotFoundException('Personnel not found');
    }

    const resolvedMonth = month || new Date().getMonth() + 1;
    const resolvedYear = year || new Date().getFullYear();
    const stats = this.computeStats(
      id,
      resolvedMonth,
      resolvedYear,
      personnel.maxWeeklyHours || 40,
      personnel.assignments,
    );

    return {
      name: personnel.name,
      ...stats,
      byDevice: this.groupByDevice(personnel.assignments),
      byMonth: this.groupByMonth(personnel.assignments),
    };
  }

  private groupByDevice(
    assignments: Array<{
      deviceId: string | null;
      date: string;
      shiftType: string;
    }>,
  ) {
    const groups = new Map<string, number>();
    for (const a of assignments) {
      const key = a.deviceId || 'personel-nobeti';
      const count = groups.get(key) || 0;
      groups.set(key, count + 1);
    }
    return Array.from(groups.entries()).map(([deviceId, count]) => ({
      deviceId,
      count,
    }));
  }

  private groupByMonth(assignments: Array<{ date: string }>) {
    const groups = new Map<string, number>();
    for (const a of assignments) {
      const month = a.date.substring(0, 7);
      const count = groups.get(month) || 0;
      groups.set(month, count + 1);
    }
    return Array.from(groups.entries()).map(([month, count]) => ({
      month,
      count,
    }));
  }
}
