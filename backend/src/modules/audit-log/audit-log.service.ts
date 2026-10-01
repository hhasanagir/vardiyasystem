import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { CorrelationService } from '../../correlation/correlation.service';
import { AuditEventLabels, EntityTypeLabels } from './audit.constants';

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  SUBMIT_FOR_REVIEW = 'SUBMIT_FOR_REVIEW',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  PUBLISH = 'PUBLISH',
  ARCHIVE = 'ARCHIVE',
  ROLLBACK = 'ROLLBACK',
  CREATE_REVISION = 'CREATE_REVISION',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  ASSIGN = 'ASSIGN',
  UNASSIGN = 'UNASSIGN',
  LOCK = 'LOCK',
  UNLOCK = 'UNLOCK',
  DISABLE = 'DISABLE',
}

export enum SuspiciousActivityType {
  RAPID_CHANGES = 'RAPID_CHANGES',
  OFF_HOURS = 'OFF_HOURS',
  BULK_DELETE = 'BULK_DELETE',
  FAILED_LOGINS = 'FAILED_LOGINS',
  PERMISSION_ESCALATION = 'PERMISSION_ESCALATION',
  DATA_EXPORT = 'DATA_EXPORT',
  SCHEDULE_MODIFICATION = 'SCHEDULE_MODIFICATION',
}

export interface SuspiciousActivity {
  type: SuspiciousActivityType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details: Record<string, unknown>;
  detectedAt: Date;
  userId?: string;
  userName?: string;
}

export interface AuditLogEntry {
  id: string;
  requestId: string;
  userId: string;
  userName: string;
  userRole: string;
  organizationId: string;
  hospitalId: string;
  unitId: string;
  action: string;
  actionLabel: string;
  entityType: string;
  entityTypeLabel: string;
  entityId: string;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  description: string;
  ipAddress: string;
  userAgent: string;
  status: string;
  timestamp: Date;
  changes: AuditChange[];
  isFlagged: boolean;
  flagReason?: string;
}

export interface AuditChange {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  changeType: 'added' | 'removed' | 'modified';
}

export interface LogEntryInput {
  userId: string;
  userName?: string;
  userRole?: string;
  organizationId?: string;
  hospitalId?: string;
  unitId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  /** prefer oldValue/newValue (new API) */
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  /** backward compat: maps to oldValue/newValue */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  description?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  reason?: string;
  comment?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}

interface AuditLogRecord {
  id: string;
  requestId: string | null;
  userId: string;
  userName: string | null;
  userRole: string | null;
  organizationId: string | null;
  hospitalId: string | null;
  unitId: string | null;
  actionType: string;
  entityType: string;
  entityId: string | null;
  oldValue: Prisma.JsonValue;
  newValue: Prisma.JsonValue;
  description: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  createdAt: Date;
  flagged: boolean;
  flagReason: string | null;
  user?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
}

@Injectable()
export class AuditLogService {
  private readonly RAPID_CHANGE_THRESHOLD = 10;
  private readonly RAPID_CHANGE_WINDOW_MS = 60000;
  private readonly OFF_HOURS_START = 22;
  private readonly OFF_HOURS_END = 6;

  constructor(
    private prisma: PrismaService,
    private correlationService?: CorrelationService,
  ) {}

  private hashField(value: string): string {
    return createHash('sha256').update(value).digest('hex').slice(0, 16);
  }

  async log(data: LogEntryInput) {
    const ctx = this.correlationService?.getContext();

    const oldVal = (data.oldValue ?? data.before) as
      | Record<string, unknown>
      | null
      | undefined;
    const newVal = (data.newValue ?? data.after) as
      | Record<string, unknown>
      | null
      | undefined;

    return this.prisma.auditLog.create({
      data: {
        requestId: ctx?.correlationId,
        userId: data.userId,
        userName: data.userName,
        userRole: data.userRole,
        organizationId: data.organizationId || ctx?.organizationId,
        hospitalId: data.hospitalId,
        unitId: data.unitId,
        actionType: data.action,
        entityType: data.entityType,
        entityId: data.entityId,
        oldValue: (oldVal ?? undefined) as Prisma.InputJsonValue | undefined,
        newValue: (newVal ?? undefined) as Prisma.InputJsonValue | undefined,
        description: data.description || data.reason || data.comment,
        ipAddress: data.ipAddress ? this.hashField(data.ipAddress) : null,
        userAgent: data.userAgent ? this.hashField(data.userAgent) : null,
        status: data.status || 'SUCCESS',
        metadata: data.metadata as Prisma.InputJsonValue,
      },
    });
  }

  async logBatch(entries: LogEntryInput[]) {
    const ctx = this.correlationService?.getContext();
    const requestId = ctx?.correlationId;

    return this.prisma.auditLog.createMany({
      data: entries.map((entry) => ({
        requestId,
        userId: entry.userId,
        userName: entry.userName,
        userRole: entry.userRole,
        organizationId: entry.organizationId || ctx?.organizationId,
        hospitalId: entry.hospitalId,
        unitId: entry.unitId,
        actionType: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        oldValue: (entry.oldValue ?? entry.before ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        newValue: (entry.newValue ?? entry.after ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        description: entry.description || entry.reason || entry.comment,
        ipAddress: entry.ipAddress ? this.hashField(entry.ipAddress) : null,
        userAgent: entry.userAgent ? this.hashField(entry.userAgent) : null,
        status: entry.status || 'SUCCESS',
        metadata: entry.metadata as Prisma.InputJsonValue,
      })),
    });
  }

  async findAll(filters?: {
    userId?: string;
    actionType?: string;
    entityType?: string;
    entityId?: string;
    organizationId?: string;
    hospitalId?: string;
    unitId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ data: AuditLogEntry[]; total: number; pages: number }> {
    const where: Prisma.AuditLogWhereInput = {};
    const andConditions: Prisma.AuditLogWhereInput[] = [];

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.actionType) where.actionType = filters.actionType;
    if (filters?.entityType) where.entityType = filters.entityType;
    if (filters?.entityId) where.entityId = filters.entityId;
    if (filters?.organizationId) where.organizationId = filters.organizationId;
    if (filters?.hospitalId) where.hospitalId = filters.hospitalId;
    if (filters?.unitId) where.unitId = filters.unitId;
    if (filters?.status) where.status = filters.status;

    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate)
        where.createdAt.lte = new Date(filters.endDate + 'T23:59:59.999Z');
    }

    if (filters?.search) {
      andConditions.push({
        OR: [
          { entityId: { contains: filters.search } },
          { description: { contains: filters.search } },
          { userName: { contains: filters.search } },
          { actionType: { contains: filters.search } },
          { entityType: { contains: filters.search } },
        ],
      });
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const limit = filters?.limit || 50;
    const offset = filters?.offset || 0;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const data = logs.map((log) =>
      this.formatAuditLogEntry(log as unknown as AuditLogRecord),
    );

    return {
      data,
      total,
      pages: Math.ceil(total / limit),
    };
  }

  async findById(id: string): Promise<AuditLogEntry | null> {
    const log = await this.prisma.auditLog.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!log) return null;
    return this.formatAuditLogEntry(log as unknown as AuditLogRecord);
  }

  async findByUser(
    userId: string,
    filters?: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    },
  ) {
    return this.findAll({
      userId,
      ...filters,
    });
  }

  async findByEntity(entityType: string, entityId: string) {
    const logs = await this.prisma.auditLog.findMany({
      where: { entityType, entityId },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return logs.map((log) =>
      this.formatAuditLogEntry(log as unknown as AuditLogRecord),
    );
  }

  async flagLog(logId: string, reason: string, flaggedBy: string) {
    return this.prisma.auditLog.update({
      where: { id: logId },
      data: {
        flagged: true,
        flagReason: reason,
        flaggedAt: new Date(),
        flaggedBy,
      },
    });
  }

  async unflagLog(logId: string) {
    return this.prisma.auditLog.update({
      where: { id: logId },
      data: {
        flagged: false,
        flagReason: null,
        flaggedAt: null,
        flaggedBy: null,
      },
    });
  }

  async getFlaggedLogs() {
    const logs = await this.prisma.auditLog.findMany({
      where: { flagged: true },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { flaggedAt: 'desc' },
    });

    return logs.map((log) =>
      this.formatAuditLogEntry(log as unknown as AuditLogRecord),
    );
  }

  async getStatistics(startDate: string, endDate: string) {
    const where = {
      createdAt: {
        gte: new Date(startDate),
        lte: new Date(endDate + 'T23:59:59.999Z'),
      },
    };

    const [totalLogs, byAction, byUser, byEntity, flaggedLogs] =
      await Promise.all([
        this.prisma.auditLog.count({ where }),
        this.prisma.auditLog.groupBy({
          by: ['actionType'],
          where,
          _count: true,
        }),
        this.prisma.auditLog.groupBy({
          by: ['userId'],
          where,
          _count: true,
        }),
        this.prisma.auditLog.groupBy({
          by: ['entityType'],
          where,
          _count: true,
        }),
        this.prisma.auditLog.count({ where: { ...where, flagged: true } }),
      ]);

    const userIds = [...new Set(byUser.map((u) => u.userId))];
    const userDetails =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [];

    return {
      period: { startDate, endDate },
      totalLogs,
      flaggedLogs,
      byAction: byAction.map((a) => ({
        action: a.actionType,
        label: AuditEventLabels[a.actionType] || a.actionType,
        count: a._count,
      })),
      byUser: byUser.map((u) => ({
        userId: u.userId,
        userName:
          userDetails.find((d) => d.id === u.userId)?.name || 'Bilinmiyor',
        userEmail: userDetails.find((d) => d.id === u.userId)?.email || '',
        count: u._count,
      })),
      byEntity: byEntity.map((e) => ({
        entityType: e.entityType,
        label: EntityTypeLabels[e.entityType] || e.entityType,
        count: e._count,
      })),
    };
  }

  async detectSuspiciousActivity(
    userId?: string,
  ): Promise<SuspiciousActivity[]> {
    const activities: SuspiciousActivity[] = [];
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (userId) {
      activities.push(...(await this.detectRapidChanges(userId, oneHourAgo)));
      activities.push(
        ...(await this.detectOffHoursActivity(userId, todayStart)),
      );
      activities.push(...(await this.detectBulkOperations(userId, oneHourAgo)));
    } else {
      const users = await this.prisma.user.findMany({ select: { id: true } });
      for (const user of users) {
        activities.push(
          ...(await this.detectRapidChanges(user.id, oneHourAgo)),
        );
        activities.push(
          ...(await this.detectOffHoursActivity(user.id, todayStart)),
        );
      }
    }

    activities.push(...(await this.detectScheduleModificationsAfterPublish()));

    return activities;
  }

  private async detectRapidChanges(
    userId: string,
    since: Date,
  ): Promise<SuspiciousActivity[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: since },
        actionType: { in: ['UPDATE', 'DELETE'] },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (logs.length >= this.RAPID_CHANGE_THRESHOLD) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true },
      });

      return [
        {
          type: SuspiciousActivityType.RAPID_CHANGES,
          severity: 'high',
          message: `Kullanıcı ${user?.name || userId} son 1 saatte ${logs.length} hızlı değişiklik yaptı`,
          details: {
            userId,
            userName: user?.name,
            userEmail: user?.email,
            changeCount: logs.length,
            timeWindow: '1 saat',
            actions: logs.map((l) => l.actionType),
          },
          detectedAt: new Date(),
          userId,
          userName: user?.name,
        },
      ];
    }
    return [];
  }

  private async detectOffHoursActivity(
    userId: string,
    since: Date,
  ): Promise<SuspiciousActivity[]> {
    const logs = await this.prisma.auditLog.findMany({
      where: {
        userId,
        createdAt: { gte: since },
      },
      include: { user: { select: { name: true } } },
    });

    const offHoursLogs = logs.filter((log) => {
      const hour = new Date(log.createdAt).getHours();
      return hour >= this.OFF_HOURS_START || hour < this.OFF_HOURS_END;
    });

    if (offHoursLogs.length >= 3 && logs[0]) {
      return [
        {
          type: SuspiciousActivityType.OFF_HOURS,
          severity: 'medium',
          message: `Kullanıcı ${logs[0].user?.name} mesai dışı saatlerde ${offHoursLogs.length} işlem yaptı`,
          details: {
            userId,
            offHoursCount: offHoursLogs.length,
            totalCount: logs.length,
            actions: offHoursLogs.map((l) => l.actionType),
          },
          detectedAt: new Date(),
          userId,
          userName: logs[0].user?.name,
        },
      ];
    }
    return [];
  }

  private async detectBulkOperations(
    userId: string,
    since: Date,
  ): Promise<SuspiciousActivity[]> {
    const logs = await this.prisma.auditLog.groupBy({
      by: ['actionType'],
      where: {
        userId,
        createdAt: { gte: since },
      },
      _count: true,
    });

    const bulkDelete = logs.find(
      (l) =>
        (l.actionType === 'DELETE' || l.actionType === 'BULK_DELETE') &&
        l._count >= 5,
    );

    if (bulkDelete) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      return [
        {
          type: SuspiciousActivityType.BULK_DELETE,
          severity: 'critical',
          message: `Kullanıcı ${user?.name} kısa sürede ${bulkDelete._count} kayıt sildi`,
          details: {
            userId,
            deleteCount: bulkDelete._count,
            timeWindow: '1 saat',
          },
          detectedAt: new Date(),
          userId,
          userName: user?.name,
        },
      ];
    }
    return [];
  }

  private async detectScheduleModificationsAfterPublish(): Promise<
    SuspiciousActivity[]
  > {
    const publishedSchedules = await this.prisma.schedule.findMany({
      where: { status: 'published' },
      select: { id: true, unitId: true, month: true, year: true },
    });

    const suspiciousModifications: SuspiciousActivity[] = [];

    for (const schedule of publishedSchedules) {
      const modifications = await this.prisma.auditLog.findMany({
        where: {
          entityType: 'schedule',
          entityId: schedule.id,
          actionType: { in: ['UPDATE', 'DELETE', 'ROLLBACK'] },
        },
        include: { user: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      if (modifications.length > 0 && modifications[0]) {
        const lastModification = modifications[0];
        const publishDate = await this.getSchedulePublishDate(schedule.id);

        if (publishDate && lastModification.createdAt > publishDate) {
          suspiciousModifications.push({
            type: SuspiciousActivityType.SCHEDULE_MODIFICATION,
            severity: 'high',
            message: `Yayınlanmış program (#${schedule.id}) değiştirildi`,
            details: {
              scheduleId: schedule.id,
              unit: schedule.unitId,
              month: schedule.month,
              year: schedule.year,
              modificationCount: modifications.length,
              lastModifiedBy: lastModification.user?.name,
              lastModifiedAt: lastModification.createdAt,
            },
            detectedAt: new Date(),
            userId: lastModification.userId,
            userName: lastModification.user?.name,
          });
        }
      }
    }
    return suspiciousModifications;
  }

  private async getSchedulePublishDate(
    scheduleId: string,
  ): Promise<Date | null> {
    const approval = await this.prisma.scheduleApproval.findUnique({
      where: { scheduleId },
    });
    return approval?.publishedAt || null;
  }

  async getTimeline(filters?: {
    userId?: string;
    unitId?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }): Promise<{ entries: AuditLogEntry[]; summary: TimelineSummary }> {
    const where: Prisma.AuditLogWhereInput = {};

    if (filters?.userId) where.userId = filters.userId;
    if (filters?.unitId) where.unitId = filters.unitId;
    if (filters?.startDate || filters?.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate)
        where.createdAt.lte = new Date(filters.endDate + 'T23:59:59.999Z');
    }

    const logs = await this.prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: filters?.limit || 100,
    });

    const entries = logs.map((log) =>
      this.formatAuditLogEntry(log as unknown as AuditLogRecord),
    );

    const summary: TimelineSummary = {
      totalEntries: entries.length,
      byAction: this.groupByAction(entries),
      byUser: this.groupByUser(entries),
      byEntity: this.groupByEntity(entries),
      flaggedCount: entries.filter((e) => e.isFlagged).length,
      timeRange: {
        oldest:
          entries.length > 0 ? entries[entries.length - 1].timestamp : null,
        newest: entries.length > 0 ? entries[0].timestamp : null,
      },
    };

    return { entries, summary };
  }

  static computeChanges(
    oldValue: Record<string, unknown> | null,
    newValue: Record<string, unknown> | null,
  ): AuditChange[] {
    if (!oldValue && !newValue) return [];
    if (!oldValue) {
      return Object.keys(newValue!).map((key) => ({
        field: key,
        oldValue: undefined,
        newValue: newValue![key],
        changeType: 'added' as const,
      }));
    }
    if (!newValue) {
      return Object.keys(oldValue).map((key) => ({
        field: key,
        oldValue: oldValue[key],
        newValue: undefined,
        changeType: 'removed' as const,
      }));
    }

    const changes: AuditChange[] = [];
    const allKeys = new Set([
      ...Object.keys(oldValue),
      ...Object.keys(newValue),
    ]);

    for (const key of allKeys) {
      const oldVal = oldValue[key];
      const newVal = newValue[key];

      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({
          field: key,
          oldValue: oldVal,
          newValue: newVal,
          changeType:
            oldVal === undefined
              ? 'added'
              : newVal === undefined
                ? 'removed'
                : 'modified',
        });
      }
    }

    return changes;
  }

  private formatAuditLogEntry(log: AuditLogRecord): AuditLogEntry {
    const oldVal = log.oldValue as Record<string, unknown> | null;
    const newVal = log.newValue as Record<string, unknown> | null;

    return {
      id: log.id,
      requestId: log.requestId || '',
      userId: log.userId,
      userName: log.userName || log.user?.name || 'Bilinmiyor',
      userRole: log.userRole || log.user?.role || '',
      organizationId: log.organizationId || '',
      hospitalId: log.hospitalId || '',
      unitId: log.unitId || '',
      action: log.actionType,
      actionLabel: AuditEventLabels[log.actionType] || log.actionType,
      entityType: log.entityType,
      entityTypeLabel: EntityTypeLabels[log.entityType] || log.entityType,
      entityId: log.entityId || '',
      oldValue: oldVal,
      newValue: newVal,
      description: log.description || '',
      ipAddress: log.ipAddress || '',
      userAgent: log.userAgent || '',
      status: log.status,
      timestamp: log.createdAt,
      changes: AuditLogService.computeChanges(oldVal, newVal),
      isFlagged: log.flagged || false,
      flagReason: log.flagReason || undefined,
    };
  }

  getActionLabel(action: string): string {
    return AuditEventLabels[action] || action;
  }

  getEntityTypeLabel(entityType: string): string {
    return EntityTypeLabels[entityType] || entityType;
  }

  private groupByAction(entries: AuditLogEntry[]) {
    const groups: Record<string, number> = {};
    for (const entry of entries) {
      groups[entry.action] = (groups[entry.action] || 0) + 1;
    }
    return groups;
  }

  private groupByUser(entries: AuditLogEntry[]) {
    const groups: Record<string, { name: string; count: number }> = {};
    for (const entry of entries) {
      if (!groups[entry.userId]) {
        groups[entry.userId] = { name: entry.userName, count: 0 };
      }
      groups[entry.userId].count++;
    }
    return groups;
  }

  private groupByEntity(entries: AuditLogEntry[]) {
    const groups: Record<string, number> = {};
    for (const entry of entries) {
      groups[entry.entityType] = (groups[entry.entityType] || 0) + 1;
    }
    return groups;
  }
}

export interface TimelineSummary {
  totalEntries: number;
  byAction: Record<string, number>;
  byUser: Record<string, { name: string; count: number }>;
  byEntity: Record<string, number>;
  flaggedCount: number;
  timeRange: { oldest: Date | null; newest: Date | null };
}
