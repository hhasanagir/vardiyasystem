import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationEventService } from '../notifications/notification-event.service';
import { EventBusService } from '../../events/event-bus.service';
import {
  createEvent,
  EVENT_NAMES,
  AGGREGATE_TYPES,
} from '../../events/domain-event.interface';

@Injectable()
export class SwapRequestsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notificationEvent: NotificationEventService,
    private eventBus: EventBusService,
  ) {}

  async findAll(filters: { status?: string; unitId?: string }) {
    const requests = await this.prisma.swapRequest.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!filters.unitId) return requests;

    const userIds = requests.map((r) => r.requesterId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, unitId: true },
    });
    const unitUserIds = new Set(
      users.filter((u) => u.unitId === filters.unitId).map((u) => u.id),
    );

    return requests.filter((r) => unitUserIds.has(r.requesterId));
  }

  async findOne(id: string) {
    const request = await this.prisma.swapRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException('Swap request not found');
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
  }) {
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
      const assignment = await this.prisma.assignment
        .findUnique({
          where: { id: data.fromAssignmentId },
          select: { date: true },
        })
        .catch(() => null);

      const requester = await this.prisma.personnel
        .findUnique({
          where: { id: data.requesterId },
          select: { name: true },
        })
        .catch(() => null);

      this.notificationEvent.swapSubmitted(
        data.requesterId,
        data.targetPersonnelId,
        data.organizationId,
        {
          swapId: request.id,
          requesterName: requester?.name || 'Bir kullanıcı',
          date: assignment?.date || '',
        },
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

    if (request.toAssignmentId) {
      const toAssignmentId = request.toAssignmentId;
      const toAssignment = await this.prisma.assignment.findUnique({
        where: { id: toAssignmentId },
      });

      if (!toAssignment) {
        throw new NotFoundException('To assignment not found');
      }

      await this.prisma.$transaction(async (tx) => {
        await tx.assignment.update({
          where: { id: request.fromAssignmentId },
          data: { personnelId: toAssignment.personnelId! },
        });
        await tx.assignment.update({
          where: { id: toAssignmentId },
          data: { personnelId: fromAssignment.personnelId! },
        });
        await tx.swapRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedById: processedById,
            approvedAt: new Date(),
          },
        });
      });
    } else if (request.targetPersonnelId) {
      await this.prisma.$transaction(async (tx) => {
        await tx.assignment.update({
          where: { id: request.fromAssignmentId },
          data: { personnelId: request.targetPersonnelId },
        });
        await tx.swapRequest.update({
          where: { id },
          data: {
            status: 'APPROVED',
            approvedById: processedById,
            approvedAt: new Date(),
          },
        });
      });
    } else {
      await this.prisma.swapRequest.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedById: processedById,
          approvedAt: new Date(),
        },
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

    const orgAssignment = await this.prisma.assignment
      .findUnique({
        where: { id: request.fromAssignmentId },
        select: {
          date: true,
          schedule: { select: { unit: { select: { organizationId: true } } } },
        },
      })
      .catch(() => null);

    this.notificationEvent.swapAccepted(
      request.requesterId,
      orgAssignment?.schedule?.unit?.organizationId || '',
      { swapId: id, date: orgAssignment?.date || '' },
    );

    this.eventBus.publish(
      createEvent(
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
      ),
    );

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

    const assignment = await this.prisma.assignment
      .findUnique({
        where: { id: request.fromAssignmentId },
        select: {
          date: true,
          schedule: { select: { unit: { select: { organizationId: true } } } },
        },
      })
      .catch(() => null);

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
      throw new ForbiddenException(
        'Kendi talebiniz dışındaki talepleri silemezsiniz',
      );
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
