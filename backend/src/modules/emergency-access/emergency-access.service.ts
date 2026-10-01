import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class EmergencyAccessService {
  constructor(private prisma: PrismaService) {}

  async requestAccess(data: {
    userId: string;
    grantedById: string;
    reason: string;
    justification: string;
    accessLevel?: string;
    durationMinutes?: number;
  }) {
    const activeGrant = await this.prisma.emergencyAccessGrant.findFirst({
      where: {
        userId: data.userId,
        isActive: true,
        expiresAt: { gte: new Date() },
      },
    });
    if (activeGrant)
      throw new BadRequestException(
        'User already has an active emergency access grant',
      );

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
        accessLog: {
          grantedAt: new Date(),
          grantedBy: data.grantedById,
        } as any,
      } as any,
    });
  }

  async revokeAccess(grantId: string, revokedById: string) {
    const grant = await this.prisma.emergencyAccessGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException('Grant not found');
    if (!grant.isActive)
      throw new BadRequestException('Grant is already revoked');

    return this.prisma.emergencyAccessGrant.update({
      where: { id: grantId },
      data: {
        isActive: false,
        revokedAt: new Date(),
        revokedById,
        accessLog: {
          ...((grant.accessLog as any) || {}),
          revokedAt: new Date(),
          revokedBy: revokedById,
        },
      } as any,
    });
  }

  async getActiveGrants() {
    return this.prisma.emergencyAccessGrant.findMany({
      where: { isActive: true, expiresAt: { gte: new Date() } },
      include: {
        user: { select: { id: true, name: true, email: true } },
        grantedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { grantedAt: 'desc' },
    });
  }

  async getGrantHistory(userId?: string) {
    const where: any = userId ? { userId } : {};
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
