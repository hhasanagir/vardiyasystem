import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class InviteCodeService {
  constructor(private prisma: PrismaService) {}

  async create(
    organizationId: string,
    createdById: string,
    options?: { maxUses?: number; expiresInHours?: number },
  ) {
    const code = randomBytes(6).toString('hex').toUpperCase();

    const expiresAt = options?.expiresInHours
      ? new Date(Date.now() + options.expiresInHours * 3600000)
      : null;

    return this.prisma.inviteCode.create({
      data: {
        code,
        organizationId,
        createdById,
        maxUses: options?.maxUses ?? 1,
        expiresAt,
      },
    });
  }

  async validate(code: string): Promise<{ organizationId: string }> {
    const invite = await this.prisma.inviteCode.findUnique({
      where: { code: code.toUpperCase() },
    });

    if (!invite) {
      throw new NotFoundException('Geçersiz davet kodu');
    }

    if (!invite.isActive) {
      throw new BadRequestException('Davet kodu aktif değil');
    }

    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new BadRequestException('Davet kodunun süresi dolmuş');
    }

    if (invite.useCount >= invite.maxUses) {
      throw new BadRequestException(
        'Davet kodu maksimum kullanım sayısına ulaştı',
      );
    }

    return { organizationId: invite.organizationId };
  }

  async consume(code: string): Promise<void> {
    await this.prisma.inviteCode.update({
      where: { code: code.toUpperCase() },
      data: { useCount: { increment: 1 } },
    });
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.inviteCode.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
