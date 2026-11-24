import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationEventService } from '../notifications/notification-event.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { SkillService } from '../skills/skill.service';
import { Prisma, ShiftType } from '@prisma/client';
import {
  ScheduleStatusEnum,
  ScheduleStatus,
  isValidTransition,
  isEditable,
  canApprove,
  canPublish,
} from '../../models/schedule-status';
import { PersonnelAvailabilityService } from './services/personnel-availability.service';
import { ScheduleCoverageService } from './services/schedule-coverage.service';

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

const TRANSITION_INCLUDE = {
  unit: true,
  assignments: { include: { personnel: true, device: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

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
    private availabilityService: PersonnelAvailabilityService,
    private coverageService: ScheduleCoverageService,
  ) {}

  async submitForReview(scheduleId: string, user: UserContext, comment?: string) {
    const schedule = await this.getSchedule(scheduleId);
    
    if (!isValidTransition(schedule.status, ScheduleStatusEnum.UNDER_REVIEW)) {
      throw new BadRequestException(
        `${schedule.status} durumundan incelemeye gönderilemez`
      );
    }

    const updated = await this.commitTransition(
      scheduleId,
      schedule.version,
      { status: ScheduleStatusEnum.UNDER_REVIEW },
      async (tx) => {
        await this.upsertApproval(scheduleId, {
          submittedBy: user.id,
          submittedAt: new Date(),
          submittedComment: comment,
        }, tx);
        await this.auditLog.log({
          userId: user.id,
          action: 'SUBMIT_FOR_REVIEW',
          entityType: 'schedule',
          entityId: scheduleId,
          before: { status: schedule.status },
          after: { status: ScheduleStatusEnum.UNDER_REVIEW, comment },
        }, tx);
      },
    );

    this.notificationEvent.scheduleSubmitted(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year },
    );

    this.gateway.broadcastAlertUpdate({
      scheduleId,
      unitId: updated.unitId,
      organizationId: updated.unit?.organizationId || undefined,
    }).catch(() => {});

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

    this.assertScheduleTenant(schedule, user);

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.APPROVED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan onaylanamaz`
      );
    }

    // Four-eyes is fail-closed: an under-review plan must have a recorded
    // submitter, and the approver must be a different person. The previous
    // `submittedBy &&` guard let legacy/forged rows without an approval record
    // through, and the auto-publish path used a synthetic actor to bypass it.
    const submittedBy = schedule.approval?.submittedBy;
    if (!submittedBy) {
      throw new ForbiddenException(
        'Four-eyes principle: onay için gönderen kullanıcı kaydı bulunamadı. Programı yeniden incelemeye gönderin.',
      );
    }
    if (submittedBy === user.id) {
      throw new ForbiddenException('Four-eyes principle: the person who submitted for review cannot also approve');
    }

    const updated = await this.commitTransition(
      scheduleId,
      schedule.version,
      { status: ScheduleStatusEnum.APPROVED },
      async (tx) => {
        await this.upsertApproval(scheduleId, {
          approvedBy: user.id,
          approvedAt: new Date(),
          approvalComment: comment,
        }, tx);
        await this.auditLog.log({
          userId: user.id,
          action: 'APPROVE',
          entityType: 'schedule',
          entityId: scheduleId,
          before: { status: schedule.status },
          after: { status: ScheduleStatusEnum.APPROVED, comment },
        }, tx);
      },
    );

    this.notificationEvent.scheduleApproved(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year, approvedByName: user.name },
    );

    this.gateway.broadcastAlertUpdate({
      scheduleId,
      unitId: updated.unitId,
      organizationId: updated.unit?.organizationId || undefined,
    }).catch(() => {});

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

    this.assertScheduleTenant(schedule, user);

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.REJECTED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan reddedilemez`
      );
    }

    const updated = await this.commitTransition(
      scheduleId,
      schedule.version,
      { status: ScheduleStatusEnum.REJECTED },
      async (tx) => {
        await this.upsertApproval(scheduleId, {
          rejectedBy: user.id,
          rejectedAt: new Date(),
          rejectionReason: reason,
        }, tx);
        await this.auditLog.log({
          userId: user.id,
          action: 'REJECT',
          entityType: 'schedule',
          entityId: scheduleId,
          before: { status: schedule.status },
          after: { status: ScheduleStatusEnum.REJECTED, reason },
        }, tx);
      },
    );

    this.notificationEvent.scheduleRejected(
      user.id,
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year, reason },
    );

    this.gateway.broadcastAlertUpdate({
      scheduleId,
      unitId: updated.unitId,
      organizationId: updated.unit?.organizationId || undefined,
    }).catch(() => {});

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
        `Yayınlama engellendi: ${validation.errors.length} personelin gerekli yetkinliği bulunmuyor veya sertifikası süresi dolmuş.`
      );
    }

    const schedule = await this.getSchedule(scheduleId);

    if (!canPublish(user.role)) {
      throw new ForbiddenException('Bu işlemi yapmak için yetkiniz yok. Sadece Proje Yöneticisi yayınlayabilir.');
    }

    this.assertScheduleTenant(schedule, user);

    if (!isValidTransition(schedule.status, ScheduleStatusEnum.PUBLISHED)) {
      throw new BadRequestException(
        `${schedule.status} durumundan yayınlanamaz. Önce onaylanması gerekir.`
      );
    }

    // PHASE 5C.25 — P1-A1 publish gate: no published plan may contain an
    // assignment on a date the personnel is on leave/absent/unavailable.
    const [personnel, assignments] = await Promise.all([
      this.prisma.personnel.findMany({
        where: { unitId: schedule.unitId, isActive: true },
        select: { id: true, offDays: true },
      }),
      this.prisma.assignment.findMany({
        where: { scheduleId },
        select: { personnelId: true, date: true },
      }),
    ]);
    const blockedDates = await this.availabilityService.resolveMonthBlockedDates(
      personnel.map(p => ({ id: p.id, offDays: p.offDays || [] })),
      schedule.year,
      schedule.month,
    );
    const violators = assignments.filter(a => blockedDates.get(a.personnelId)?.has(a.date));
    if (violators.length > 0) {
      throw new BadRequestException(
        `Yayınlama engellendi: ${violators.length} atama izinli/raporlu/uygunsuz döneme denk geliyor (ör. ${violators[0].personnelId} → ${violators[0].date}). Lütfen bu atamaları kaldırıp tekrar deneyin.`
      );
    }

    // PHASE 5C.26 — P1-A2 publish gate: no published plan may leave a mandatory
    // staffing slot unfilled. Equal/over coverage passes; under-coverage blocks.
    const coverage = await this.coverageService.evaluateScheduleCoverage({
      unitId: schedule.unitId,
      scheduleId,
      year: schedule.year,
      month: schedule.month,
    });
    if (coverage.underCoverage.length > 0) {
      const example = coverage.underCoverage[0];
      throw new BadRequestException(
        `Yayınlama engellendi: ${coverage.underCoverage.length} vardiya kadrosu minimum personel sayısını karşılamıyor (gerekli ${coverage.requiredSlots}, atanmış ${coverage.assignedSlots}; ör. ${example.deviceName} ${example.date} ${example.shiftType} ${example.personnelType} → gerekli ${example.required}, atanmış ${example.assigned}). Eksik kadroları doldurup tekrar deneyin.`
      );
    }

    const updated = await this.commitTransition(
      scheduleId,
      schedule.version,
      { status: ScheduleStatusEnum.PUBLISHED, publishedAt: new Date() },
      async (tx) => {
        // P2-07 — the pre-publish snapshot is written in the same transaction
        // as the state change, so a published plan is always restorable.
        await this.createSnapshot(scheduleId, user.id, 'Yayınlama öncesi snapshot', tx);
        await this.upsertApproval(scheduleId, {
          publishedBy: user.id,
          publishedAt: new Date(),
        }, tx);
        await this.auditLog.log({
          userId: user.id,
          action: 'PUBLISH',
          entityType: 'schedule',
          entityId: scheduleId,
          before: { status: schedule.status },
          after: { status: ScheduleStatusEnum.PUBLISHED },
        }, tx);
      },
    );

    this.gateway.broadcastAlertUpdate({
      scheduleId,
      unitId: updated.unitId,
      organizationId: updated.unit?.organizationId || undefined,
    }).catch(() => {});

    const personnelIds = await this.prisma.personnel.findMany({
      where: { unitId: updated.unitId, isActive: true },
      select: { id: true },
    });

    this.notificationEvent.schedulePublished(
      personnelIds.map(p => p.id),
      updated.unit?.organizationId || user.organizationId || '',
      { scheduleId, month: updated.month, year: updated.year, unitName: updated.unit?.name || '' },
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
        `${schedule.status} durumundan arşivlenemez`
      );
    }

    const updated = await this.commitTransition(
      scheduleId,
      schedule.version,
      { status: ScheduleStatusEnum.ARCHIVED },
      async (tx) => {
        await this.upsertApproval(scheduleId, {
          archivedBy: user.id,
          archivedAt: new Date(),
        }, tx);
        await this.auditLog.log({
          userId: user.id,
          action: 'ARCHIVE',
          entityType: 'schedule',
          entityId: scheduleId,
          before: { status: schedule.status },
          after: { status: ScheduleStatusEnum.ARCHIVED },
        }, tx);
      },
    );

    return {
      success: true,
      newStatus: updated.status,
      version: updated.version,
      message: 'Program arşivlendi',
      schedule: updated,
    };
  }

  async rollback(scheduleId: string, targetVersion: number, user: UserContext, reason: string) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Geri alma sebebi zorunludur');
    }

    const schedule = await this.getSchedule(scheduleId);

    if (!isEditable(schedule.status)) {
      throw new BadRequestException(
        'Yayınlanmış programlar düzenlenemez. Revizyon oluşturun.'
      );
    }

    const snapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: targetVersion },
    });

    if (!snapshot) {
      throw new NotFoundException(`Versiyon ${targetVersion} bulunamadı`);
    }

    const currentVersion = schedule.version;

    let affectedSwapIds: string[] = [];

    const updated = await this.prisma.$transaction(async (tx) => {
      // P2-05 — the version precondition is enforced by the same atomic
      // statement that bumps the version. Check it before any destructive
      // write so a stale rollback cannot touch assignments or swaps.
      const cas = await tx.schedule.updateMany({
        where: { id: scheduleId, version: currentVersion },
        data: { version: { increment: 1 }, updatedAt: new Date() },
      });
      if (cas.count === 0) {
        throw new ConflictException(`Schedule ${scheduleId} changed concurrently; reload and retry`);
      }

      affectedSwapIds = await tx.swapRequest
        .findMany({
          where: {
            OR: [
              { fromAssignment: { scheduleId } },
              { toAssignment: { scheduleId } },
            ],
          },
          select: { id: true },
        })
        .then((rows) => rows.map((r) => r.id));

      if (affectedSwapIds.length > 0) {
        await tx.swapRequest.updateMany({
          where: { id: { in: affectedSwapIds } },
          data: {
            status: 'CANCELLED',
            reason: `Rollback (v${targetVersion}): ${reason} nedeniyle iptal edildi`,
          },
        });
      }

      await tx.assignment.deleteMany({ where: { scheduleId } });

      const data = snapshot.data as unknown as SnapshotData;
      if (data && data.assignments && Array.isArray(data.assignments)) {
        await tx.assignment.createMany({
          data: data.assignments.map((a: SnapshotAssignment) => {
            const kind = a.kind === 'person' ? 'person' : 'device';
            return {
              scheduleId,
              organizationId:
                schedule.unit?.organizationId
                ?? (schedule as { organizationId?: string | null }).organizationId
                ?? undefined,
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

      await this.auditLog.log({
        userId: user.id,
        action: 'ROLLBACK',
        entityType: 'schedule',
        entityId: scheduleId,
        before: { version: currentVersion },
        after: { rolledBackToVersion: targetVersion, cancelledSwapIds: affectedSwapIds },
      }, tx);

      return tx.schedule.findUnique({
        where: { id: scheduleId },
        include: TRANSITION_INCLUDE,
      });
    });

    if (!updated) {
      throw new NotFoundException('Program bulunamadı');
    }

    await this.createSnapshot(scheduleId, user.id, `v${targetVersion}'e geri alındı: ${reason}`);

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
        'Revizyon sadece yayınlanmış programlardan oluşturulabilir'
      );
    }

    const nextVersion = schedule.version + 1;

    // P2-05/P2-06 — snapshot, conditional version bump and audit are one
    // atomic unit. A concurrent mutation cannot produce a revision whose
    // snapshot describes a different state than the row it points at.
    const updated = await this.prisma.$transaction(async (tx) => {
      const scheduleWithAssignments = await tx.schedule.findUnique({
        where: { id: schedule.id },
        include: { assignments: true },
      });

      await tx.scheduleSnapshot.create({
        data: {
          scheduleId: schedule.id,
          version: nextVersion,
          data: {
            assignments: scheduleWithAssignments?.assignments || [],
          },
          createdById: user.id,
        },
      });

      const cas = await tx.schedule.updateMany({
        where: { id: scheduleId, version: schedule.version },
        data: {
          status: ScheduleStatusEnum.DRAFT,
          version: nextVersion,
          publishedAt: null,
          updatedAt: new Date(),
        },
      });
      if (cas.count === 0) {
        throw new ConflictException(`Schedule ${scheduleId} changed concurrently; reload and retry`);
      }

      await this.auditLog.log({
        userId: user.id,
        action: 'CREATE_REVISION',
        entityType: 'schedule',
        entityId: schedule.id,
        after: { parentScheduleId: scheduleId, revisionVersion: nextVersion },
      }, tx);

      return tx.schedule.findUnique({
        where: { id: scheduleId },
        select: { id: true, version: true, status: true },
      });
    });

    if (!updated) {
      throw new NotFoundException('Program bulunamadı');
    }

    const fullSchedule = await this.prisma.schedule.findUnique({
      where: { id: updated.id },
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

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

  async compareVersions(scheduleId: string, fromVersion: number, toVersion: number) {
    const fromSnapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: fromVersion },
    });

    const toSnapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version: toVersion },
    });

    if (!fromSnapshot || !toSnapshot) {
      throw new NotFoundException('Versiyonlardan biri bulunamadı');
    }

    const fromData = (fromSnapshot.data as unknown as SnapshotData) || { assignments: [] };
    const toData = (toSnapshot.data as unknown as SnapshotData) || { assignments: [] };

    const fromAssignments = fromData.assignments || [];
    const toAssignments = toData.assignments || [];

    const added = toAssignments.filter((a: SnapshotAssignment) => 
      !fromAssignments.some((f: SnapshotAssignment) => 
        f.deviceId === a.deviceId && f.date === a.date && f.shiftType === a.shiftType
      )
    );

    const removed = fromAssignments.filter((a: SnapshotAssignment) =>
      !toAssignments.some((t: SnapshotAssignment) =>
        t.deviceId === a.deviceId && t.date === a.date && t.shiftType === a.shiftType
      )
    );

    const modified = toAssignments.filter((a: SnapshotAssignment) => {
      const from = fromAssignments.find((f: SnapshotAssignment) =>
        f.deviceId === a.deviceId && f.date === a.date && f.shiftType === a.shiftType
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

  async getPendingApprovals(organizationId?: string) {
    const where: any = {
      status: ScheduleStatusEnum.UNDER_REVIEW,
    };
    if (organizationId) {
      where.organizationId = organizationId;
    }
    return this.prisma.schedule.findMany({
      where,
      include: {
        unit: true,
        assignments: { include: { personnel: true, device: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        approval: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Defense-in-depth tenant check for workflow transitions. The HTTP guard
   * already resolves the schedule's owner, but internal callers (publishByUnit,
   * jobs) must not be able to approve/publish a plan from another organization.
   */
  private assertScheduleTenant(
    schedule: { organizationId?: string | null; unit?: { organizationId?: string | null } | null },
    user: UserContext,
  ): void {
    const scheduleOrganizationId =
      schedule.unit?.organizationId ?? schedule.organizationId ?? null;

    if (!user.organizationId) {
      if (user.role !== 'system_admin' && user.role !== 'hospital_admin') {
        throw new ForbiddenException('Access denied: missing tenant context');
      }
      return;
    }

    if (scheduleOrganizationId && scheduleOrganizationId !== user.organizationId) {
      throw new ForbiddenException('Access denied: schedule belongs to another organization');
    }
  }

  private async getSchedule(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        approval: true,
        unit: { select: { organizationId: true } },
      },
    });

    if (!schedule) {
      throw new NotFoundException('Program bulunamadı');
    }

    return schedule;
  }

  /**
   * P2-05/P2-06 — all workflow transitions use an atomic version precondition
   * and commit their state row, approval/snapshot writes and audit entry in a
   * single transaction. The version bump makes a stale read fail closed.
   */
  private async commitTransition(
    scheduleId: string,
    expectedVersion: number,
    data: Record<string, unknown>,
    sideEffects: (tx: Prisma.TransactionClient) => Promise<void>,
  ) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const cas = await tx.schedule.updateMany({
        where: { id: scheduleId, version: expectedVersion },
        data: { ...data, updatedAt: new Date(), version: { increment: 1 } },
      });
      if (cas.count === 0) {
        throw new ConflictException(`Schedule ${scheduleId} changed concurrently; reload and retry`);
      }

      await sideEffects(tx);

      return tx.schedule.findUnique({
        where: { id: scheduleId },
        include: TRANSITION_INCLUDE,
      });
    });

    if (!updated) {
      throw new NotFoundException('Program bulunamadı');
    }
    return updated;
  }

  private async upsertApproval(
    scheduleId: string,
    data: ApprovalData,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    await client.scheduleApproval.upsert({
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
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    const schedule = await client.schedule.findUnique({
      where: { id: scheduleId },
      include: { assignments: true },
    });

    if (!schedule) return;

    const lastSnapshot = await client.scheduleSnapshot.findFirst({
      where: { scheduleId },
      orderBy: { version: 'desc' },
      select: { version: true },
    });

    const nextVersion = Math.max(schedule.version, (lastSnapshot?.version ?? 0) + 1);

    await client.scheduleSnapshot.create({
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
