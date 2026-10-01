import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(private prisma: PrismaService) {}

  async add(jti: string, userId?: string, reason?: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 86400000);
    try {
      await this.prisma.tokenBlacklist.create({
        data: { jti, userId, reason, expiresAt },
      });
    } catch {
      this.logger.warn(`jti already blacklisted, skipping: ${jti}`);
    }
  }

  async isBlacklisted(jti: string): Promise<boolean> {
    const entry = await this.prisma.tokenBlacklist.findUnique({
      where: { jti },
      select: { id: true },
    });
    return entry !== null;
  }

  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.tokenBlacklist.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} expired blacklist entries`);
    }
    return result.count;
  }
}
