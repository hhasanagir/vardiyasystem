import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationEventService } from '../notifications/notification-event.service';
import { EventBusService } from '../../events/event-bus.service';
import { createEvent, EVENT_NAMES, AGGREGATE_TYPES } from '../../events/domain-event.interface';
import { ScheduleValidationService } from '../schedules/schedule-validation.service';

@Injectable()
export class SwapRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notificationEvent: NotificationEventService,
    private eventBus: EventBusService,
    private scheduleValidation: ScheduleValidationService,
  ) {}

  async findAll(filters: { status?: string; unitId?: string }, scope?: { unitId?: string | null; organizationId?: string | null }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;

    // Authoritative read scope derived from the swap's own schedule relationship
    // (fromAssignment -> schedule -> unit/org). Never trust client/legacy unitId.
    if (scope?.unitId) {
      where.fromAssignment = { schedule: { unitId: scope.unitId } };
    } else if (scope?.organizationId) {
      where.fromAssignment = { schedule: { organizationId: scope.organizationId } };
    }

    if (scope?.unitId || scope?.organizationId) {
      return this.prisma.swapRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    }

    // Legacy no-scope path (kept for backward compatibility):
    const requests = await this.prisma.swapRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    if (!filters.unitId) return requests;

    const userIds = requests.map(r => r.requesterId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, unitId: true },
    });
    const unitUserIds = new Set(users.filter(u => u.unitId === filters.unitId).map(u => u.id));

    return requests.filter(r => unitUserIds.has(r.requesterId));
  }

  async findOne(id: string, scope?: { unitId?: string | null; organizationId?: string | null }) {
    const request = await this.prisma.swapRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Swap request not found');
    }

    if (scope) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: request.fromAssignmentId },
        select: {
          schedule: { select: { unitId: true, organizationId: true } },
        },
      });
      const unitId = assignment?.schedule?.unitId ?? null;
      const organizationId = assignment?.schedule?.organizationId ?? request.organizationId ?? null;
      if (scope.unitId) {
        if (!unitId || unitId !== scope.unitId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
      } else if (scope.organizationId) {
        if (!organizationId || organizationId !== scope.organizationId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
      }
    }

    return request;
  }

  async create(data: {
    requesterId: string;
    fromAssignmentId: string;
    targetPersonnelId?: string;
    toAssignmentId?: string;
    reason?: string;
    organizationId: string;
    unitId: string;
  }, scope?: { unitId?: string | null; organizationId?: string | null }) {
    // Authoritative scope BEFORE insert: the from-assignment must resolve to a
    // unit/org inside the requester's scope. Never trust client/JWT unitId for
    // the swap's own data placement (fromAssignment -> schedule -> unit/org).
    if (scope) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: data.fromAssignmentId },
        select: {
          schedule: { select: { unitId: true, organizationId: true } },
        },
      });
      if (!assignment) {
        throw new NotFoundException('Takasa konu atama bulunamadı');
      }
      const unitId = assignment?.schedule?.unitId ?? null;
      const organizationId = assignment?.schedule?.organizationId ?? null;
      if (scope.unitId) {
        if (!unitId || unitId !== scope.unitId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
      } else if (scope.organizationId) {
        if (!organizationId || organizationId !== scope.organizationId) {
          throw new ForbiddenException('Bu birime erişim yetkiniz yok');
        }
      }
    }

    const request = await this.prisma.swapRequest.create({
      data: {
        requesterId: data.requesterId,
        fromAssignmentId: data.fromAssignmentId,
        targetPersonnelId: data.targetPersonnelId || '',
        toAssignmentId: data.toAssignmentId,
        reason: data.reason,
        status: 'PENDING',
      },
    });

    await this.auditLog.log({
      userId: data.requesterId,
      action: 'CREATE',
      entityType: 'swap_request',
      entityId: request.id,
      after: request,
    });

    if (data.targetPersonnelId) {
      const assignment = await this.prisma.assignment.findUnique({
        where: { id: data.fromAssignmentId },
        select: { date: true },
      }).catch(() => null);

      const requester = await this.prisma.personnel.findUnique({
        where: { id: data.requesterId },
        select: { name: true },
      }).catch(() => null);

      this.notificationEvent.swapSubmitted(
        data.requesterId,
        data.targetPersonnelId,
        data.organizationId,
        { swapId: request.id, requesterName: requester?.name || 'Bir kullanıcı', date: assignment?.date || '' },
      );
    }

    return request;
  }

  async approve(id: string, processedById: string) {
    const request = await this.prisma.swapRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Swap request not found');
    }

    if (request.status !== 'PENDING') {
      throw new ForbiddenException('Only pending requests can be approved');
    }

    const fromAssignment = await this.prisma.assignment.findUnique({
      where: { id: request.fromAssignmentId },
    });

    if (!fromAssignment) {
      throw new NotFoundException('From assignment not found');
    }

    let toAssignment: any = null;
    if (request.toAssignmentId) {
      toAssignment = await this.prisma.assignment.findUnique({
        where: { id: request.toAssignmentId },
      });

      if (!toAssignment) {
        throw new NotFoundException('To assignment not found');
      }
    }

    // Determine the schedule's unit so device/off-date lookups are tenant-correct.
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: fromAssignment.scheduleId },
      select: { unitId: true },
    });
    const scheduleUnitId = schedule?.unitId ?? null;

    // Validate the RESULTING assignment state before mutating anything.
    const validateResulting = async (assignment: any, newPersonnelId: string) => {
      const report = await this.scheduleValidation.validateAssignment(
        assignment.scheduleId,
        {
          personnelId: newPersonnelId,
          deviceId: assignment.deviceId,
          unitId: scheduleUnitId,
          personnelGroupId: assignment.personnelGroupId,
          shiftTemplateId: assignment.shiftTemplateId,
          kind: assignment.kind || 'device',
          date: assignment.date,
          shiftType: assignment.shiftType,
          startTime: assignment.startTime,
          endTime: assignment.endTime,
          personnelType: assignment.personnelType,
        },
        assignment.id,
      );
      return report;
    };

    const rejectOnBlocking = (report: { hasBlocking: boolean; violations: unknown[] }) => {
      if (report.hasBlocking) {
        throw new ConflictException({
          message: 'Takas doğrulama hatası: engelleyici kural ihlali',
          violations: report.violations,
          hasBlocking: true,
          canOverride: false,
        });
      }
    };

    if (request.toAssignmentId && toAssignment) {
      rejectOnBlocking(await validateResulting(fromAssignment, toAssignment.personnelId));
      rejectOnBlocking(await validateResulting(toAssignment, fromAssignment.personnelId));
    } else if (request.targetPersonnelId) {
      rejectOnBlocking(await validateResulting(fromAssignment, request.targetPersonnelId));
    }

    if (request.toAssignmentId && toAssignment) {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.swapRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', approvedById: processedById, approvedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new ConflictException('Swap request is no longer pending');
        }
        await tx.assignment.update({
          where: { id: request.fromAssignmentId },
          data: { personnelId: toAssignment.personnelId! },
        });
        await tx.assignment.update({
          where: { id: toAssignment.id },
          data: { personnelId: fromAssignment.personnelId! },
        });
      });
    } else if (request.targetPersonnelId) {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.swapRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', approvedById: processedById, approvedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new ConflictException('Swap request is no longer pending');
        }
        await tx.assignment.update({
          where: { id: request.fromAssignmentId },
          data: { personnelId: request.targetPersonnelId },
        });
      });
    } else {
      await this.prisma.$transaction(async (tx) => {
        const claim = await tx.swapRequest.updateMany({
          where: { id, status: 'PENDING' },
          data: { status: 'APPROVED', approvedById: processedById, approvedAt: new Date() },
        });
        if (claim.count === 0) {
          throw new ConflictException('Swap request is no longer pending');
        }
      });
    }

    const updated = await this.prisma.swapRequest.findUnique({ where: { id } });

    await this.auditLog.log({
      userId: processedById,
      action: 'APPROVE',
      entityType: 'swap_request',
      entityId: id,
      before: request,
      after: updated,
    });

    const orgAssignment = await this.prisma.assignment.findUnique({
      where: { id: request.fromAssignmentId },
      select: { date: true, schedule: { select: { unit: { select: { organizationId: true } } } } },
    }).catch(() => null);

    this.notificationEvent.swapAccepted(
      request.requesterId,
      orgAssignment?.schedule?.unit?.organizationId || '',
      { swapId: id, date: orgAssignment?.date || '' },
    );

    this.eventBus.publish(createEvent(
      EVENT_NAMES.SHIFT_SWAPPED,
      id,
      AGGREGATE_TYPES.SWAP,
      {
        swapId: id,
        requesterId: request.requesterId,
        fromAssignmentId: request.fromAssignmentId,
        toAssignmentId: request.toAssignmentId,
        targetPersonnelId: request.targetPersonnelId,
        processedById,
        status: 'APPROVED',
      },
      processedById,
    ));

    return updated;
  }

  async reject(id: string, processedById: string) {
    const request = await this.prisma.swapRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Swap request not found');
    }

    if (request.status !== 'PENDING') {
      throw new ForbiddenException('Only pending requests can be rejected');
    }

    const updated = await this.prisma.swapRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        approvedById: processedById,
        approvedAt: new Date(),
      },
    });

    await this.auditLog.log({
      userId: processedById,
      action: 'REJECT',
      entityType: 'swap_request',
      entityId: id,
      before: request,
      after: updated,
    });

    const assignment = await this.prisma.assignment.findUnique({
      where: { id: request.fromAssignmentId },
      select: { date: true, schedule: { select: { unit: { select: { organizationId: true } } } } },
    }).catch(() => null);

    this.notificationEvent.swapRejected(
      request.requesterId,
      assignment?.schedule?.unit?.organizationId || '',
      { swapId: id, date: assignment?.date || '' },
    );

    return updated;
  }

  async delete(id: string, userId: string) {
    const request = await this.prisma.swapRequest.findUnique({ where: { id } });

    if (!request) {
      throw new NotFoundException('Swap request not found');
    }

    if (request.requesterId !== userId) {
      throw new ForbiddenException('Kendi talebiniz dışındaki talepleri silemezsiniz');
    }

    await this.prisma.swapRequest.delete({ where: { id } });

    await this.auditLog.log({
      userId,
      action: 'DELETE',
      entityType: 'swap_request',
      entityId: id,
      before: request,
    });

    return { success: true };
  }
}
