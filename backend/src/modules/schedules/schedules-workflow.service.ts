import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationEventService } from '../notifications/notification-event.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { SkillService } from '../skills/skill.service';
import { ShiftType } from '@prisma/client';
import {
  ScheduleStatusEnum,
  ScheduleStatus,
  isValidTransition,
  isEditable,
  canApprove,
  canPublish,
} from '../../models/schedule-status';

interface UserContext {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId?: string;
  unitId?: string;
}

export interface SnapshotAssignment {
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

interface ApprovalData {
  submittedBy?: string;
  submittedAt?: Date;
  submittedComment?: string;
  approvedBy?: string;
  approvedAt?: Date;
  approvalComment?: string;
  rejectedBy?: string;
  rejectedAt?: Date;
  rejectionReason?: string;
  publishedBy?: string;
  publishedAt?: Date;
  archivedBy?: string;
  archivedAt?: Date;
}

@Injectable()
export class SchedulesWorkflowService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notificationEvent: NotificationEventService,
    private gateway: ScheduleGateway,
    private skillService: SkillService,
  ) {}

  async submitForReview(
    scheduleId: string,
    user: UserContext,
    comment?: string,
  ) {
    const schedule = await this.getSchedule(scheduleId);

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.UNDER_REVIEW)) {
      throw new BadRequestException(
        `${schedule.status} durumundan incelemeye gönderilemez`,
      );
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.UNDER_REVIEW,
        updatedAt: new Date(),
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.upsertApproval(scheduleId, {
      submittedBy: user.id,
      submittedAt: new Date(),
      submittedComment: comment,
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'SUBMIT_FOR_REVIEW',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: ScheduleStatusEnum.UNDER_REVIEW, comment },
      })
      .catch(() => {});

    this.notificationEvent.scheduleSubmitted(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year },
    );

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: updated.unitId,
        organizationId: updated.unit?.organizationId || undefined,
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: 'Program inceleme için gönderildi',
      schedule: updated,
    };
  }

  async approve(scheduleId: string, user: UserContext, comment?: string) {
    const schedule = await this.getSchedule(scheduleId);

    if (!canApprove(user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok');
    }

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.APPROVED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan onaylanamaz`,
      );
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.APPROVED,
        updatedAt: new Date(),
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.upsertApproval(scheduleId, {
      approvedBy: user.id,
      approvedAt: new Date(),
      approvalComment: comment,
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'APPROVE',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: ScheduleStatusEnum.APPROVED, comment },
      })
      .catch(() => {});

    this.notificationEvent.scheduleApproved(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      {
        scheduleId,
        month: updated.month,
        year: updated.year,
        approvedByName: user.name,
      },
    );

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: updated.unitId,
        organizationId: updated.unit?.organizationId || undefined,
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: 'Program onaylandı',
      schedule: updated,
    };
  }

  async reject(scheduleId: string, user: UserContext, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Reddetme sebebi zorunludur');
    }

    const schedule = await this.getSchedule(scheduleId);

    if (!canApprove(user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok');
    }

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.REJECTED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan reddedilemez`,
      );
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.REJECTED,
        updatedAt: new Date(),
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.upsertApproval(scheduleId, {
      rejectedBy: user.id,
      rejectedAt: new Date(),
      rejectionReason: reason,
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'REJECT',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: ScheduleStatusEnum.REJECTED, reason },
      })
      .catch(() => {});

    this.notificationEvent.scheduleRejected(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year, reason },
    );

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: updated.unitId,
        organizationId: updated.unit?.organizationId || undefined,
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: `Program reddedildi: ${reason}`,
      schedule: updated,
    };
  }

  async publish(scheduleId: string, user: UserContext) {
    const validation = await this.skillService.validateAssignments(scheduleId);
    if (!validation.valid) {
      throw new BadRequestException(
        `Yayınlama engellendi: ${validation.errors.length} personelin gerekli yetkinliği bulunmuyor veya sertifikası süresi dolmuş.`,
      );
    }

    const schedule = await this.getSchedule(scheduleId);

    if (!canPublish(user.role)) {
      throw new ForbiddenException(
        'Bu işlemi yapmak için yetkiniz yok. Sadece Proje Yöneticisi yayınlayabilir.',
      );
    }

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.PUBLISHED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan yayınlanamaz. Önce onaylanması gerekir.`,
      );
    }

    await this.createSnapshot(scheduleId, user.id, 'Yayınlama öncesi snapshot');

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.PUBLISHED,
        publishedAt: new Date(),
        updatedAt: new Date(),
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.upsertApproval(scheduleId, {
      publishedBy: user.id,
      publishedAt: new Date(),
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'PUBLISH',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: ScheduleStatusEnum.PUBLISHED },
      })
      .catch(() => {});

    this.gateway
      .broadcastAlertUpdate({
        scheduleId,
        unitId: updated.unitId,
        organizationId: updated.unit?.organizationId || undefined,
      })
      .catch(() => {});

    const personnelIds = await this.prisma.personnel.findMany({
      where: { unitId: updated.unitId, isActive: true },
      select: { id: true },
    });

    this.notificationEvent.schedulePublished(
      personnelIds.map((p) => p.id),
      updated.unit?.organizationId || user.organizationId || '',
      {
        scheduleId,
        month: updated.month,
        year: updated.year,
        unitName: updated.unit?.name || '',
      },
    );

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: 'Program yayınlandı',
      schedule: updated,
    };
  }

  async archive(scheduleId: string, user: UserContext) {
    const schedule = await this.getSchedule(scheduleId);

    if (!canPublish(user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok');
    }

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.ARCHIVED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan arşivlenemez`,
      );
    }

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.ARCHIVED,
        updatedAt: new Date(),
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.upsertApproval(scheduleId, {
      archivedBy: user.id,
      archivedAt: new Date(),
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'ARCHIVE',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { status: schedule.status },
        after: { status: ScheduleStatusEnum.ARCHIVED },
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: 'Program arşivlendi',
      schedule: updated,
    };
  }

  async rollback(
    scheduleId: string,
    targetVersion: number,
    user: UserContext,
    reason: string,
  ) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Geri alma sebebi zorunludur');
    }

    const schedule = await this.getSchedule(scheduleId);

    if (!isEditable(schedule.status)) {
      throw new BadRequestException(
        'Yayınlanmış programlar düzenlenemez. Revizyon oluşturun.',
      );
    }

    const snapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: targetVersion },
    });

    if (!snapshot) {
      throw new NotFoundException(`Versiyon ${targetVersion} bulunamadı`);
    }

    const currentVersion = schedule.version;

    await this.prisma.assignment.deleteMany({ where: { scheduleId } });

    const data = snapshot.data as unknown as SnapshotData;
    if (data && data.assignments && Array.isArray(data.assignments)) {
      await this.prisma.assignment.createMany({
        data: data.assignments.map((a: SnapshotAssignment) => {
          const kind = a.kind === 'person' ? 'person' : 'device';
          return {
            scheduleId,
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

    await this.createSnapshot(
      scheduleId,
      user.id,
      `v${targetVersion}'e geri alındı: ${reason}`,
    );

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { version: { increment: 1 } },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLog
      .log({
        userId: user.id,
        action: 'ROLLBACK',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { version: currentVersion },
        after: {
          rolledBackToVersion: targetVersion,
          newVersion: updated.version,
        },
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: `v${targetVersion}'e geri alındı`,
      schedule: updated,
    };
  }

  async createRevision(scheduleId: string, user: UserContext) {
    const schedule = await this.getSchedule(scheduleId);

    if (schedule.status !== ScheduleStatusEnum.PUBLISHED) {
      throw new BadRequestException(
        'Revizyon sadece yayınlanmış programlardan oluşturulabilir',
      );
    }

    const nextVersion = schedule.version + 1;
    const scheduleWithAssignments = await this.prisma.schedule.findUnique({
      where: { id: schedule.id },
      include: { assignments: true },
    });

    await this.prisma.scheduleSnapshot.create({
      data: {
        scheduleId: schedule.id,
        version: nextVersion,
        data: {
          assignments: scheduleWithAssignments?.assignments || [],
        },
        createdById: user.id,
      },
    });

    const updated = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: ScheduleStatusEnum.DRAFT,
        version: nextVersion,
        publishedAt: null,
      },
    });

    const fullSchedule = await this.prisma.schedule.findUnique({
      where: { id: updated.id },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    await this.auditLog
      .log({
        userId: user.id,
        action: 'CREATE_REVISION',
        entityType: 'schedule',
        entityId: schedule.id,
        after: {
          parentScheduleId: scheduleId,
          revisionVersion: updated.version,
        },
      })
      .catch(() => {});

    return {
      success: true,
      newStatus: ScheduleStatusEnum.DRAFT,
      version: updated.version,
      message: `v${schedule.version}'den revizyon oluşturuldu`,
      schedule: fullSchedule,
    };
  }

  async getVersionHistory(scheduleId: string) {
    return this.prisma.scheduleSnapshot.findMany({
      where: { scheduleId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        createdAt: true,
        createdById: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getVersionSnapshot(scheduleId: string, version: number) {
    const snapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    if (!snapshot) {
      throw new NotFoundException(`Versiyon ${version} bulunamadı`);
    }

    return snapshot;
  }

  async compareVersions(
    scheduleId: string,
    fromVersion: number,
    toVersion: number,
  ) {
    const fromSnapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: fromVersion },
    });

    const toSnapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: toVersion },
    });

    if (!fromSnapshot || !toSnapshot) {
      throw new NotFoundException('Versiyonlardan biri bulunamadı');
    }

    const fromData = (fromSnapshot.data as unknown as SnapshotData) || {
      assignments: [],
    };
    const toData = (toSnapshot.data as unknown as SnapshotData) || {
      assignments: [],
    };

    const fromAssignments = fromData.assignments || [];
    const toAssignments = toData.assignments || [];

    const added = toAssignments.filter(
      (a: SnapshotAssignment) =>
        !fromAssignments.some(
          (f: SnapshotAssignment) =>
            f.deviceId === a.deviceId &&
            f.date === a.date &&
            f.shiftType === a.shiftType,
        ),
    );

    const removed = fromAssignments.filter(
      (a: SnapshotAssignment) =>
        !toAssignments.some(
          (t: SnapshotAssignment) =>
            t.deviceId === a.deviceId &&
            t.date === a.date &&
            t.shiftType === a.shiftType,
        ),
    );

    const modified = toAssignments.filter((a: SnapshotAssignment) => {
      const from = fromAssignments.find(
        (f: SnapshotAssignment) =>
          f.deviceId === a.deviceId &&
          f.date === a.date &&
          f.shiftType === a.shiftType,
      );
      return from && from.personnelId !== a.personnelId;
    });

    return {
      fromVersion: {
        version: fromVersion,
        createdAt: fromSnapshot.createdAt,
        assignments: fromAssignments,
      },
      toVersion: {
        version: toVersion,
        createdAt: toSnapshot.createdAt,
        assignments: toAssignments,
      },
      diff: {
        added,
        removed,
        modified,
        totalChanges: added.length + removed.length + modified.length,
      },
    };
  }

  async getAuditLog(scheduleId: string) {
    return this.prisma.auditLog.findMany({
      where: {
        entityType: 'schedule',
        entityId: scheduleId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
    });
  }

  async getPendingApprovals() {
    return this.prisma.schedule.findMany({
      where: {
        status: ScheduleStatusEnum.UNDER_REVIEW,
      },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approval: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async getSchedule(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        approval: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException('Program bulunamadı');
    }

    return schedule;
  }

  private async upsertApproval(scheduleId: string, data: ApprovalData) {
    await this.prisma.scheduleApproval.upsert({
      where: { scheduleId },
      create: {
        scheduleId,
        ...data,
      },
      update: data,
    });
  }

  private async createSnapshot(
    scheduleId: string,
    userId: string,
    comment?: string,
  ) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { assignments: true },
    });

    if (!schedule) return;

    const lastSnapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = Math.max(
      schedule.version,
      (lastSnapshot?.version ?? 0) + 1,
    );

    await this.prisma.scheduleSnapshot.create({
      data: {
        scheduleId,
        version: nextVersion,
        data: {
          assignments: schedule.assignments,
          comment,
        },
        createdById: userId,
      },
    });
  }
}
