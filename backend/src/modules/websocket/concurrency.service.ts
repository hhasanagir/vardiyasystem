import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import type { Prisma } from '@prisma/client';

export interface ConcurrencyResult {
  success: boolean;
  newVersion?: number;
  conflict?: boolean;
  serverVersion?: number;
  serverChanges?: RecentChanges;
  error?: string;
}

export interface VersionInfo {
  currentVersion: number;
  lastUpdated: Date | null;
  lastUpdatedBy: string | null;
}

export interface RecentChanges {
  snapshots: Array<{
    version: number;
    createdAt: Date;
    data: unknown;
  }>;
  currentVersion: number;
}

export interface AssignmentChange {
  deviceId: string;
  personnelId: string;
  date: string;
}

export interface ChangePayload {
  assignments?: AssignmentChange[];
  [key: string]: unknown;
}

export type Changes = ChangePayload | Record<string, unknown>;

@Injectable()
export class ConcurrencyService {
  private versionCache = new Map<
    string,
    { version: number; updatedAt: Date }
  >();
  private readonly CACHE_TTL_MS = 1000;

  constructor(private prisma: PrismaService) {}

  async checkAndUpdate(
    scheduleId: string,
    clientVersion: number,
    userId: string,
    changes: Changes,
  ): Promise<ConcurrencyResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const schedule = await tx.schedule.findUnique({
          where: { id: scheduleId },
          select: { id: true, version: true, updatedAt: true },
        });

        if (!schedule) {
          return {
            success: false,
            conflict: false,
            error: 'Schedule not found',
          };
        }

        if (schedule.version !== clientVersion) {
          const recentChanges = await this.getRecentChanges(
            scheduleId,
            clientVersion,
          );

          return {
            success: false,
            conflict: true,
            serverVersion: schedule.version,
            serverChanges: recentChanges,
          };
        }

        const newVersion = schedule.version + 1;

        const updated = await tx.schedule.update({
          where: { id: scheduleId, version: schedule.version },
          data: {
            version: newVersion,
            updatedAt: new Date(),
          },
        });

        await this.createSnapshotTx(
          tx,
          scheduleId,
          newVersion,
          userId,
          changes,
        );

        this.versionCache.set(scheduleId, {
          version: newVersion,
          updatedAt: updated.updatedAt,
        });

        return {
          success: true,
          newVersion,
        };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2025') {
        return {
          success: false,
          conflict: true,
          error: 'Version conflict: schedule was modified by another operation',
        };
      }
      return {
        success: false,
        conflict: false,
        error: (error as Error).message,
      };
    }
  }

  async checkVersion(
    scheduleId: string,
    clientVersion: number,
  ): Promise<{
    valid: boolean;
    serverVersion: number;
    conflict: boolean;
    serverChanges?: RecentChanges;
  }> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { version: true, updatedAt: true },
    });

    if (!schedule) {
      return { valid: false, serverVersion: 0, conflict: false };
    }

    if (schedule.version !== clientVersion) {
      const recentChanges = await this.getRecentChanges(
        scheduleId,
        clientVersion,
      );

      return {
        valid: false,
        serverVersion: schedule.version,
        conflict: true,
        serverChanges: recentChanges,
      };
    }

    return {
      valid: true,
      serverVersion: schedule.version,
      conflict: false,
    };
  }

  async getVersionInfo(scheduleId: string): Promise<VersionInfo> {
    const cached = this.versionCache.get(scheduleId);

    if (cached && Date.now() - cached.updatedAt.getTime() < this.CACHE_TTL_MS) {
      return {
        currentVersion: cached.version,
        lastUpdated: cached.updatedAt,
        lastUpdatedBy: null,
      };
    }

    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { version: true, updatedAt: true, createdById: true },
    });

    if (schedule) {
      this.versionCache.set(scheduleId, {
        version: schedule.version,
        updatedAt: schedule.updatedAt,
      });

      return {
        currentVersion: schedule.version,
        lastUpdated: schedule.updatedAt,
        lastUpdatedBy: schedule.createdById,
      };
    }

    return {
      currentVersion: 0,
      lastUpdated: null,
      lastUpdatedBy: null,
    };
  }

  async forceUpdate(
    scheduleId: string,
    newVersion: number,
    changes: Changes,
  ): Promise<void> {
    await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { version: newVersion },
    });

    this.versionCache.set(scheduleId, {
      version: newVersion,
      updatedAt: new Date(),
    });
  }

  async validateChanges(
    scheduleId: string,
    clientVersion: number,
    changes: Changes,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    const versionCheck = await this.checkVersion(scheduleId, clientVersion);
    if (versionCheck.conflict) {
      errors.push(
        `Sürüm çakışması: Mevcut sürüm ${versionCheck.serverVersion}, istemci sürümü ${clientVersion}`,
      );
    }

    const changePayload = changes as ChangePayload;
    if (changePayload.assignments) {
      for (const assignment of changePayload.assignments) {
        if (
          !assignment.deviceId ||
          !assignment.personnelId ||
          !assignment.date
        ) {
          errors.push(`Eksik atama bilgisi: ${JSON.stringify(assignment)}`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private async getRecentChanges(
    scheduleId: string,
    sinceVersion: number,
  ): Promise<RecentChanges> {
    const snapshots = await this.prisma.scheduleSnapshot.findMany({
      where: {
        scheduleId,
        version: { gt: sinceVersion },
      },
      orderBy: { version: 'desc' },
      take: 5,
    });

    return {
      snapshots: snapshots.map((s) => ({
        version: s.version,
        createdAt: s.createdAt,
        data: s.data,
      })),
      currentVersion:
        (
          await this.prisma.schedule.findUnique({
            where: { id: scheduleId },
            select: { version: true },
          })
        )?.version || 0,
    };
  }

  private async createSnapshot(
    scheduleId: string,
    version: number,
    userId: string,
    changes: Changes,
  ): Promise<void> {
    const assignments = await this.prisma.assignment.findMany({
      where: { scheduleId },
    });

    await this.prisma.scheduleSnapshot.create({
      data: {
        scheduleId,
        version,
        data: {
          assignments,
          changes,
        } as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  private async createSnapshotTx(
    tx: Prisma.TransactionClient,
    scheduleId: string,
    version: number,
    userId: string,
    changes: Changes,
  ): Promise<void> {
    const assignments = await tx.assignment.findMany({
      where: { scheduleId },
    });

    await tx.scheduleSnapshot.create({
      data: {
        scheduleId,
        version,
        data: {
          assignments,
          changes,
        } as Prisma.InputJsonValue,
        createdById: userId,
      },
    });
  }

  clearCache(scheduleId?: string): void {
    if (scheduleId) {
      this.versionCache.delete(scheduleId);
    } else {
      this.versionCache.clear();
    }
  }
}
