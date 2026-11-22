import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';
import { Schedule, ScheduleStatus, ScheduleProps, ApprovalData } from '../domain/aggregates/schedule.aggregate';
import { AssignmentCollection } from '../domain/entities/assignment-collection';
import { Assignment, AssignmentSource } from '../domain/entities/assignment.entity';
import {
  ScheduleRepositoryPort,
  ScheduleFilter,
  ScheduleSaveOptions,
  VersionSnapshotRecord,
} from '../domain/repositories/schedule-repository.port';
import { Prisma, ScheduleStatus as PrismaScheduleStatus } from '@prisma/client';
import { StaleVersionError } from '../domain/errors/schedule-errors';
import { tenantContext } from '../../../infrastructure/prisma/middleware/tenant.middleware';
import { normalizeExpectedVersion } from '../version-precondition';

function sourceToDomain(prismaSource: string): AssignmentSource {
  const map: Record<string, AssignmentSource> = {
    manual: 'manual',
    auto_generated: 'auto-generated',
    override: 'override',
    swap: 'swap',
    template: 'template',
    import: 'import',
  };
  return map[prismaSource] || 'manual';
}

function sourceToPrisma(domainSource: AssignmentSource): string {
  const map: Record<string, string> = {
    'manual': 'manual',
    'auto-generated': 'auto_generated',
    'override': 'override',
    'swap': 'swap',
    'template': 'template',
    'import': 'import',
  };
  return map[domainSource] || 'manual';
}

@Injectable()
export class PrismaScheduleRepository implements ScheduleRepositoryPort {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Schedule | null> {
    const record = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        assignments: true,
        approval: true,
      },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findByUnitMonthYear(unitId: string, month: number, year: number): Promise<Schedule | null> {
    const record = await this.prisma.schedule.findUnique({
      where: { unitId_month_year: { unitId, month, year } },
      include: {
        assignments: true,
        approval: true,
      },
    });
    if (!record) return null;
    return this.toDomain(record);
  }

  async findAll(filter: ScheduleFilter): Promise<Schedule[]> {
    const where: Record<string, unknown> = {};
    if (filter.unitId) where.unitId = filter.unitId;
    if (filter.month) where.month = filter.month;
    if (filter.year) where.year = filter.year;
    if (filter.status) where.status = filter.status;
    if (filter.organizationId) where.organizationId = filter.organizationId;

    const records = await this.prisma.schedule.findMany({
      where,
      include: { assignments: true, approval: true },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: filter.take,
      skip: filter.skip,
    });

    return records.map(r => this.toDomain(r));
  }

  async findPendingApprovals(): Promise<Schedule[]> {
    const records = await this.prisma.schedule.findMany({
      where: { status: 'under_review' },
      include: { assignments: true, approval: true },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(r => this.toDomain(r));
  }

  async save(
    schedule: Schedule,
    expectedVersion?: number,
    options?: ScheduleSaveOptions,
  ): Promise<void> {
    const data = schedule;
    const approvalData = data.approvalData;

    // The tenant middleware injects `organizationId` for `create` only — not for
    // `upsert` — and the Schedule aggregate does not carry the tenant. Without
    // this, rows were written with a NULL organizationId and every tenant-scoped
    // read (the middleware filters on organizationId) hid them as "not found".
    // The owning organization is derived from the unit — server-side data, never
    // client input — and is resolved lazily so pure status transitions do not pay
    // for the extra lookup.
    const tenantOrganizationId = tenantContext.getStore()?.organizationId;
    let organizationId: string | null | undefined;
    const resolveOrganizationId = async (): Promise<string | undefined> => {
      if (organizationId === undefined) {
        organizationId = (await this.resolveUnitOrganizationId(data.unitId)) ?? tenantOrganizationId;
      }
      return organizationId ?? undefined;
    };

    await this.prisma.$transaction(async (tx) => {
      const precondition = normalizeExpectedVersion(expectedVersion);
      if (precondition !== undefined) {
        // PHASE 5C.25 P1-A6 — atomic compare-and-swap: the version predicate and
        // the row write happen in a single statement (no read-then-write window).
        const result = await tx.schedule.updateMany({
          where: { id: data.id, version: precondition },
          data: {
            status: data.status as PrismaScheduleStatus,
            version: data.scheduleVersion,
            publishedAt: data.publishedAt,
            updatedAt: new Date(),
          },
        });
        if (result.count === 0) {
          const current = await tx.schedule.findUnique({
            where: { id: data.id },
            select: { version: true },
          });
          if (!current) {
            throw new Error(`Schedule ${data.id} not found`);
          }
          throw new StaleVersionError(data.id, precondition, current.version);
        }
      } else {
        await tx.schedule.upsert({
          where: tenantOrganizationId
            ? { id: data.id, organizationId: tenantOrganizationId }
            : { id: data.id },
          create: {
            id: data.id,
            unitId: data.unitId,
            organizationId: await resolveOrganizationId(),
            month: data.month,
            year: data.year,
            status: data.status as PrismaScheduleStatus,
            version: data.scheduleVersion,
            createdById: data.createdById,
            publishedAt: data.publishedAt,
          },
          update: {
            status: data.status as PrismaScheduleStatus,
            version: data.scheduleVersion,
            publishedAt: data.publishedAt,
            updatedAt: new Date(),
          },
        });
      }

      // P2-08 — a rollback restores assignments in-place. SwapRequests that
      // pointed at the replaced rows must be cancelled in the same transaction,
      // otherwise they survive as dangling references.
      if (options?.cancelSwapRequestsReason) {
        const affectedSwapIds = (await tx.swapRequest.findMany({
          where: {
            OR: [
              { fromAssignment: { scheduleId: data.id } },
              { toAssignment: { scheduleId: data.id } },
            ],
          },
          select: { id: true },
        })).map(s => s.id);

        if (affectedSwapIds.length > 0) {
          await tx.swapRequest.updateMany({
            where: { id: { in: affectedSwapIds } },
            data: {
              status: 'CANCELLED',
              reason: options.cancelSwapRequestsReason,
            },
          });
        }
      }

      // P2-07 — DDD publish writes the restorable version snapshot atomically
      // with the status change. `upsert` keeps repeated publishes idempotent
      // under the (scheduleId, version) uniqueness guard.
      if (options?.snapshot) {
        await tx.scheduleSnapshot.upsert({
          where: { scheduleId_version: { scheduleId: data.id, version: data.scheduleVersion } },
          create: {
            scheduleId: data.id,
            version: data.scheduleVersion,
            data: { assignments: data.assignments.all.map(a => a.toSnapshot()) },
            createdById: options.snapshot.userId,
          },
          update: {},
        });
      }

      const existingIds = (await tx.assignment.findMany({
        where: { scheduleId: data.id },
        select: { id: true },
      })).map(a => a.id);

      const currentIds = data.assignments.all.map(a => a.id);
      const toDelete = existingIds.filter(id => !currentIds.includes(id));

      if (toDelete.length > 0) {
        await tx.assignment.deleteMany({
          where: { id: { in: toDelete } },
        });
      }

      for (const assignment of data.assignments.all) {
        const snapshot = assignment.toSnapshot();
        await tx.assignment.upsert({
          where: { id: assignment.id },
          create: {
            id: assignment.id,
            scheduleId: data.id,
            organizationId: await resolveOrganizationId(),
            personnelId: snapshot.personnelId,
            deviceId: snapshot.deviceId,
            unitId: snapshot.unitId,
            personnelGroupId: snapshot.personnelGroupId,
            shiftTemplateId: snapshot.shiftTemplateId,
            kind: snapshot.kind as never,
            source: sourceToPrisma(snapshot.source) as never,
            date: snapshot.date,
            shiftType: snapshot.shiftType as never,
            startTime: snapshot.startTime,
            endTime: snapshot.endTime,
            personnelType: snapshot.personnelType,
            overrideReason: snapshot.overrideReason,
            overriddenBy: snapshot.overriddenBy,
            overriddenAt: snapshot.overriddenBy ? new Date() : null,
            version: assignment.version,
          },
          update: {
            personnelId: snapshot.personnelId,
            deviceId: snapshot.deviceId,
            unitId: snapshot.unitId,
            personnelGroupId: snapshot.personnelGroupId,
            shiftTemplateId: snapshot.shiftTemplateId,
            kind: snapshot.kind as never,
            source: sourceToPrisma(snapshot.source) as never,
            date: snapshot.date,
            shiftType: snapshot.shiftType as never,
            startTime: snapshot.startTime,
            endTime: snapshot.endTime,
            personnelType: snapshot.personnelType,
            overrideReason: snapshot.overrideReason,
            overriddenBy: snapshot.overriddenBy,
            overriddenAt: snapshot.overriddenBy ? new Date() : null,
            version: assignment.version,
            updatedAt: new Date(),
          },
        });
      }

      if (approvalData) {
        await tx.scheduleApproval.upsert({
          where: { scheduleId: data.id },
          create: {
            scheduleId: data.id,
            submittedBy: approvalData.submittedBy,
            submittedAt: approvalData.submittedAt,
            submittedComment: approvalData.submittedComment,
            approvedBy: approvalData.approvedBy,
            approvedAt: approvalData.approvedAt,
            approvalComment: approvalData.approvalComment,
            rejectedBy: approvalData.rejectedBy,
            rejectedAt: approvalData.rejectedAt,
            rejectionReason: approvalData.rejectionReason,
            publishedBy: approvalData.publishedBy,
            publishedAt: approvalData.publishedAt,
            archivedBy: approvalData.archivedBy,
            archivedAt: approvalData.archivedAt,
          },
          update: {
            submittedBy: approvalData.submittedBy,
            submittedAt: approvalData.submittedAt,
            submittedComment: approvalData.submittedComment,
            approvedBy: approvalData.approvedBy,
            approvedAt: approvalData.approvedAt,
            approvalComment: approvalData.approvalComment,
            rejectedBy: approvalData.rejectedBy,
            rejectedAt: approvalData.rejectedAt,
            rejectionReason: approvalData.rejectionReason,
            publishedBy: approvalData.publishedBy,
            publishedAt: approvalData.publishedAt,
            archivedBy: approvalData.archivedBy,
            archivedAt: approvalData.archivedAt,
          },
        });
      }
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.schedule.delete({ where: { id } });
  }

  private async resolveUnitOrganizationId(unitId: string): Promise<string | null> {
    const unit = await this.prisma.unit.findUnique({ where: { id: unitId }, select: { organizationId: true } });
    return unit?.organizationId ?? null;
  }

  async count(filter?: ScheduleFilter): Promise<number> {
    const where: Record<string, unknown> = {};
    if (filter?.unitId) where.unitId = filter.unitId;
    if (filter?.month) where.month = filter.month;
    if (filter?.year) where.year = filter.year;
    if (filter?.status) where.status = filter.status;
    return this.prisma.schedule.count({ where });
  }

  async getVersionSnapshot(scheduleId: string, version: number): Promise<VersionSnapshotRecord | null> {
    const snapshot = await this.prisma.scheduleSnapshot.findFirst({
      where: { scheduleId, version },
    });
    if (!snapshot) return null;
    return {
      id: snapshot.id,
      scheduleId: snapshot.scheduleId,
      version: snapshot.version,
      data: snapshot.data as { assignments: unknown[] },
      createdById: snapshot.createdById,
      createdAt: snapshot.createdAt,
    };
  }

  private toDomain(record: {
    id: string;
    unitId: string;
    month: number;
    year: number;
    status: string;
    version: number;
    createdById: string | null;
    publishedAt: Date | null;
    assignments: Array<{
      id: string;
      scheduleId: string;
      personnelId: string;
      deviceId: string | null;
      unitId: string | null;
      personnelGroupId: string | null;
      shiftTemplateId: string | null;
      kind: string;
      source: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType: string;
      isConfirmed: boolean;
      overrideReason: string | null;
      overriddenBy: string | null;
      version: number;
    }>;
    approval: {
      submittedBy: string | null;
      submittedAt: Date | null;
      submittedComment: string | null;
      approvedBy: string | null;
      approvedAt: Date | null;
      approvalComment: string | null;
      rejectedBy: string | null;
      rejectedAt: Date | null;
      rejectionReason: string | null;
      publishedBy: string | null;
      publishedAt: Date | null;
      archivedBy: string | null;
      archivedAt: Date | null;
    } | null;
  }): Schedule {
    const domainAssignments = record.assignments.map(a =>
      Assignment.create({
        id: a.id,
        scheduleId: a.scheduleId,
        personnelId: a.personnelId,
        deviceId: a.deviceId,
        unitId: a.unitId,
        personnelGroupId: a.personnelGroupId,
        shiftTemplateId: a.shiftTemplateId,
        kind: a.kind as 'device' | 'person',
        source: sourceToDomain(a.source),
        date: a.date,
        shiftType: a.shiftType,
        startTime: a.startTime,
        endTime: a.endTime,
        personnelType: a.personnelType,
        isConfirmed: a.isConfirmed,
        overrideReason: a.overrideReason,
        overriddenBy: a.overriddenBy,
      }),
    );

    const approvalData: ApprovalData | null = record.approval
      ? {
          submittedBy: record.approval.submittedBy,
          submittedAt: record.approval.submittedAt?.toISOString() ?? null,
          submittedComment: record.approval.submittedComment,
          approvedBy: record.approval.approvedBy,
          approvedAt: record.approval.approvedAt?.toISOString() ?? null,
          approvalComment: record.approval.approvalComment,
          rejectedBy: record.approval.rejectedBy,
          rejectedAt: record.approval.rejectedAt?.toISOString() ?? null,
          rejectionReason: record.approval.rejectionReason,
          publishedBy: record.approval.publishedBy,
          publishedAt: record.approval.publishedAt?.toISOString() ?? null,
          archivedBy: record.approval.archivedBy,
          archivedAt: record.approval.archivedAt?.toISOString() ?? null,
        }
      : null;

    return Schedule.reconstitute(record.id, {
      unitId: record.unitId,
      month: record.month,
      year: record.year,
      status: record.status as ScheduleStatus,
      version: record.version,
      createdById: record.createdById,
      publishedAt: record.publishedAt,
      assignments: new AssignmentCollection(domainAssignments),
      approvalData,
    });
  }
}
