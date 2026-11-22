import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class EmergencyAccessService {
  constructor(private prisma: PrismaService) {}

  async requestAccess(
    data: {
      userId: string;
      grantedById: string;
      reason: string;
      justification: string;
      accessLevel?: string;
      durationMinutes?: number;
    },
    callerOrganizationId?: string,
  ) {
    const activeGrant = await this.prisma.emergencyAccessGrant.findFirst({
      where: { userId: data.userId, isActive: true, expiresAt: { gte: new Date() } },
    });
    if (activeGrant) throw new BadRequestException('User already has an active emergency access grant');

    const targetUser = await this.prisma.user.findUnique({
      where: { id: data.userId },
      select: { organizationId: true },
    });
    if (!targetUser) throw new NotFoundException('Target user not found');
    if (callerOrganizationId !== undefined && targetUser.organizationId !== callerOrganizationId) {
      throw new ForbiddenException('Diğer kuruluşun kullanıcısına acil erişim tanımlanamaz');
    }

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (data.durationMinutes || 60));

    return this.prisma.emergencyAccessGrant.create({
      data: {
        userId: data.userId,
        grantedById: data.grantedById,
        reason: data.reason as any,
        justification: data.justification,
        accessLevel: data.accessLevel || 'read',
        expiresAt,
        accessLog: { grantedAt: new Date(), grantedBy: data.grantedById } as any,
      } as any,
    });
  }

  async revokeAccess(grantId: string, revokedById: string, callerOrganizationId?: string) {
    const grant = await this.prisma.emergencyAccessGrant.findUnique({
      where: { id: grantId },
      include: { user: { select: { organizationId: true } } },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    if (!grant.isActive) throw new BadRequestException('Grant is already revoked');
    if (callerOrganizationId !== undefined && grant.user.organizationId !== callerOrganizationId) {
      throw new ForbiddenException('Diğer kuruluşun acil erişim kaydı iptal edilemez');
    }

    return this.prisma.emergencyAccessGrant.update({
      where: { id: grantId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedById,
        accessLog: { ...(grant.accessLog as any || {}), revokedAt: new Date(), revokedBy: revokedById },
      } as any,
    });
  }

  async getActiveGrants(callerOrganizationId?: string) {
    return this.prisma.emergencyAccessGrant.findMany({
      where: {
        isActive: true,
        expiresAt: { gte: new Date() },
        ...(callerOrganizationId !== undefined ? { user: { organizationId: callerOrganizationId } } : {}),
      },
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async getGrantHistory(userId?: string, callerOrganizationId?: string) {
    const where: any = {
      ...(callerOrganizationId !== undefined ? { user: { organizationId: callerOrganizationId } } : {}),
    };
    if (userId) where.userId = userId;
    return this.prisma.emergencyAccessGrant.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { grantedAt: 'desc' },
      take: 100,
    });
  }

  async validateAccess(userId: string): Promise<boolean> {
    const activeGrant = await this.prisma.emergencyAccessGrant.findFirst({
      where: {
        userId,
        isActive: true,
        expiresAt: { gte: new Date() },
      },
    });
    return !!activeGrant;
  }
}
