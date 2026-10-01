import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class PushTokensService {
  private readonly logger = new Logger(PushTokensService.name);

  constructor(private prisma: PrismaService) {}

  async register(userId: string, token: string, platform: string) {
    const existing = await this.prisma.pushToken.findUnique({
      where: { token },
    });
    if (existing) {
      if (existing.userId !== userId || !existing.isActive) {
        return this.prisma.pushToken.update({
          where: { token },
          data: { userId, isActive: true, platform },
        });
      }
      return existing;
    }
    return this.prisma.pushToken.create({
      data: { userId, token, platform },
    });
  }

  async unregister(userId: string, token: string) {
    try {
      await this.prisma.pushToken.updateMany({
        where: { userId, token },
        data: { isActive: false },
      });
    } catch (err) {
      this.logger.warn(
        'Failed to unregister push token',
        (err as Error).message,
      );
    }
  }

  async unregisterAll(userId: string) {
    try {
      await this.prisma.pushToken.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false },
      });
    } catch (err) {
      this.logger.warn(
        'Failed to unregister all push tokens',
        (err as Error).message,
      );
    }
  }

  async getTokens(userId: string): Promise<string[]> {
    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: { userId, isActive: true },
        select: { token: true },
      });
      return tokens.map((t) => t.token);
    } catch {
      return [];
    }
  }

  async getAllActiveTokens(): Promise<
    { userId: string; token: string; platform: string }[]
  > {
    try {
      return this.prisma.pushToken.findMany({
        where: { isActive: true },
        select: { userId: true, token: true, platform: true },
      });
    } catch {
      return [];
    }
  }
}
