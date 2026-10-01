import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DataSubjectService {
  constructor(private prisma: PrismaService) {}

  async getMyData(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roleAssignments: { include: { role: true } },
        authSessions: { where: { revokedAt: null } },
        consentRecords: { include: { template: true } },
        notificationRecipients: { take: 100, orderBy: { createdAt: 'desc' } },
        attendanceRecords: { take: 100, orderBy: { date: 'desc' } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const personnel = await this.prisma.personnel.findFirst({
      where: { email: user.email },
      include: {
        assignments: { take: 100, orderBy: { date: 'desc' } },
        personnelSkills: { include: { skill: true } },
        personnelTrainings: { include: { training: true } },
      },
    });

    return {
      user: this.sanitizeUser(user),
      roleAssignments: user.roleAssignments,
      activeSessions: user.authSessions.map((s) => ({
        id: s.id,
        lastUsedAt: s.lastUsedAt,
        deviceInfo: s.deviceInfo,
        createdAt: s.createdAt,
      })),
      consents: user.consentRecords,
      notifications: user.notificationRecipients.map((n) => ({
        id: n.id,
        isRead: n.isRead,
        createdAt: n.createdAt,
      })),
      attendance: user.attendanceRecords,
      personnel: personnel
        ? {
            id: personnel.id,
            name: personnel.name,
            employeeNo: personnel.employeeNo,
            email: personnel.email,
            role: personnel.role,
            skills: personnel.personnelSkills,
            trainings: personnel.personnelTrainings,
            assignments: personnel.assignments,
          }
        : null,
      exportFormat: 'json',
      exportedAt: new Date().toISOString(),
    };
  }

  async requestDataExport(userId: string, format: string = 'json') {
    const existing = await this.prisma.dataSubjectRequest.findFirst({
      where: {
        userId,
        requestType: 'ACCESS',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (existing)
      throw new BadRequestException(
        'You already have a pending access request',
      );

    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        requestType: 'ACCESS',
        description: `Data export in ${format} format`,
        metadata: { format },
      } as any,
    });

    return {
      requestId: request.id,
      status: request.status,
      message: 'Data export request submitted',
    };
  }

  async requestErasure(userId: string, reason?: string) {
    const existing = await this.prisma.dataSubjectRequest.findFirst({
      where: {
        userId,
        requestType: 'ERASURE',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (existing)
      throw new BadRequestException(
        'You already have a pending erasure request',
      );

    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        requestType: 'ERASURE',
        description: reason || 'Right to erasure request',
      } as any,
    });

    return {
      requestId: request.id,
      status: request.status,
      message: 'Erasure request submitted',
    };
  }

  async requestRectification(
    userId: string,
    field: string,
    currentValue: string,
    proposedValue: string,
  ) {
    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        requestType: 'RECTIFICATION',
        description: `Request to rectify ${field}: ${currentValue} -> ${proposedValue}`,
        metadata: { field, currentValue, proposedValue },
      } as any,
    });

    return { requestId: request.id, status: request.status };
  }

  async requestRestriction(userId: string, reason?: string) {
    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        requestType: 'RESTRICTION',
        description: reason || 'Request to restrict processing',
      } as any,
    });
    return { requestId: request.id, status: request.status };
  }

  async requestPortability(userId: string) {
    const existing = await this.prisma.dataSubjectRequest.findFirst({
      where: {
        userId,
        requestType: 'PORTABILITY',
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (existing)
      throw new BadRequestException(
        'You already have a pending portability request',
      );

    const request = await this.prisma.dataSubjectRequest.create({
      data: {
        userId,
        requestType: 'PORTABILITY',
        description: 'Data portability request (GDPR Art. 20)',
        metadata: { format: 'json' },
      } as any,
    });
    return { requestId: request.id, status: request.status };
  }

  async getMyRequests(userId: string) {
    return this.prisma.dataSubjectRequest.findMany({
      where: { userId },
      orderBy: { requestedAt: 'desc' },
    });
  }

  async getRequest(requestId: string, userId?: string) {
    const request = await this.prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
      include: { auditLogs: { orderBy: { createdAt: 'desc' } } },
    });
    if (!request) throw new NotFoundException('Request not found');
    if (userId && request.userId !== userId)
      throw new ForbiddenException('Access denied');
    return request;
  }

  async processRequest(
    requestId: string,
    action: string,
    performedBy: string,
    notes?: string,
  ) {
    const request = await this.prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');

    const statusMap: Record<string, string> = {
      approve: 'COMPLETED',
      reject: 'REJECTED',
      start: 'IN_PROGRESS',
      verify: 'VERIFYING_IDENTITY',
    };

    const newStatus = statusMap[action] || request.status;

    const updates: any = { status: newStatus };
    if (action === 'approve') {
      updates.completedAt = new Date();
      if (
        request.requestType === 'ACCESS' ||
        request.requestType === 'PORTABILITY'
      ) {
        const userData = await this.getMyData(request.userId);
        updates.dataSnapshot = userData as any;
      }
    }
    if (action === 'reject' && notes) {
      updates.rejectionReason = notes;
    }

    const updated = await this.prisma.dataSubjectRequest.update({
      where: { id: requestId },
      data: updates,
    });

    await this.prisma.dataSubjectRequestAuditLog.create({
      data: {
        requestId,
        action,
        performedBy,
        description: notes,
      } as any,
    });

    return updated;
  }

  async processErasure(requestId: string, performedBy: string) {
    const request = await this.prisma.dataSubjectRequest.findUnique({
      where: { id: requestId },
    });
    if (!request) throw new NotFoundException('Request not found');

    await this.prisma.$transaction(async (tx: any) => {
      const userId = request.userId;

      await tx.dataSubjectRequest.update({
        where: { id: requestId },
        data: {
          status: 'IN_PROGRESS',
          dataSnapshot: await this.getMyData(userId).then((d) => d as any),
        },
      });

      await tx.emergencyAccessGrant.deleteMany({ where: { userId } });
      await tx.consentRecord.deleteMany({ where: { userId } });
      await tx.dataSubjectRequest.updateMany({
        where: { userId, id: { not: requestId } },
        data: { userId: 'deleted-user' } as any,
      });
      await tx.authSession.deleteMany({ where: { userId } });
      await tx.pushToken.deleteMany({ where: { userId } });
      await tx.userRoleAssignment.deleteMany({ where: { userId } });

      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${userId}@anon.vardiya`,
          name: 'Deleted User',
          password: 'DELETED',
          isActive: false,
        },
      });

      await tx.dataSubjectRequest.update({
        where: { id: requestId },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });

      await tx.dataSubjectRequestAuditLog.create({
        data: {
          requestId,
          action: 'erasure_completed',
          performedBy,
          description:
            'User data anonymized and accounts disabled per right to erasure',
        } as any,
      });
    });

    return { message: 'Erasure completed successfully' };
  }

  private sanitizeUser(user: any) {
    const { password, ...safe } = user;
    return safe;
  }

  async getRequestStatistics(organizationId?: string) {
    const where: any = organizationId ? { user: { organizationId } } : {};
    const requests = await this.prisma.dataSubjectRequest.findMany({ where });

    return {
      total: requests.length,
      byType: this.countBy(requests, 'requestType'),
      byStatus: this.countBy(requests, 'status'),
      pendingCount: requests.filter(
        (r) => r.status === 'PENDING' || r.status === 'IN_PROGRESS',
      ).length,
      completedCount: requests.filter((r) => r.status === 'COMPLETED').length,
      avgProcessingTime: this.calcAvgProcessingTime(requests),
    };
  }

  private countBy(items: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of items) {
      const val = item[key];
      result[val] = (result[val] || 0) + 1;
    }
    return result;
  }

  private calcAvgProcessingTime(requests: any[]): number | null {
    const completed = requests.filter(
      (r) => r.status === 'COMPLETED' && r.completedAt,
    );
    if (completed.length === 0) return null;
    const totalMs = completed.reduce(
      (sum, r) => sum + (r.completedAt.getTime() - r.requestedAt.getTime()),
      0,
    );
    return Math.round(totalMs / completed.length / (1000 * 60 * 60));
  }
}
