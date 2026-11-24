import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { UnitScopeService } from '../rbac/services/unit-scope.service';

@Injectable()
export class QualityService {
  constructor(
    private prisma: PrismaService,
    private unitScopeService: UnitScopeService,
  ) {}

  private async assertRecordAccess(
    record: {
      unitId?: string | null;
      assetId?: string | null;
      asset?: { unitId?: string | null; organizationId?: string | null } | null;
    },
    user: any,
  ) {
    const effUnitId = record.unitId ?? record.asset?.unitId ?? null;
    const effOrg = record.asset?.organizationId
      ?? (effUnitId ? (await this.prisma.unit.findUnique({ where: { id: effUnitId }, select: { organizationId: true } }))?.organizationId ?? null : null);
    const allowed = await this.unitScopeService.canAccessUnit(user, effUnitId, effOrg);
    if (!allowed) {
      throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
    }
  }

  private async resolveContainment(user: any): Promise<Prisma.QualityRecordWhereInput> {
    const scope = await this.unitScopeService.resolveScope(user);
    if (scope.strictUnitId) {
      return { unitId: scope.strictUnitId };
    }
    const org = scope.organizationId;
    if (!org) {
      throw new ForbiddenException('Kuruluş atanmamış kullanıcı kayıt listeleyemez');
    }
    const orgUnitIds = (await this.prisma.unit.findMany({ where: { organizationId: org }, select: { id: true } })).map(u => u.id);
    return { OR: [{ unitId: { in: orgUnitIds } }, { asset: { organizationId: org } }] };
  }

  async listRecords(filters?: { type?: string; status?: string; severity?: string }, user?: any) {
    const where: Prisma.QualityRecordWhereInput = {};

    if (filters?.type) where.type = filters.type as any;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.severity) where.severity = filters.severity;

    if (user) {
      const containment = await this.resolveContainment(user);
      where.AND = Array.isArray(where.AND) ? [...where.AND, containment] : [containment];
    }

    return this.prisma.qualityRecord.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        actions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRecord(data: any, user?: any) {
    let unitId = data.unitId;
    if (user) {
      const scope = await this.unitScopeService.resolveScope(user);
      const effUnitId = data.unitId ?? (data.assetId
        ? (await this.prisma.enterpriseAsset.findUnique({ where: { id: data.assetId }, select: { unitId: true } }))?.unitId
        : null);
      const effOrg = data.assetId
        ? (await this.prisma.enterpriseAsset.findUnique({ where: { id: data.assetId }, select: { organizationId: true } }))?.organizationId ?? null
        : (effUnitId ? (await this.prisma.unit.findUnique({ where: { id: effUnitId }, select: { organizationId: true } }))?.organizationId ?? null : null);
      const allowed = await this.unitScopeService.canAccessUnit(user, effUnitId, effOrg);
      if (!allowed) {
        throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
      }
      if (scope.strictUnitId) {
        unitId = scope.strictUnitId;
      }
    }

    return this.prisma.qualityRecord.create({
      data: {
        recordNumber: data.recordNumber,
        type: data.type,
        status: data.status || 'open',
        title: data.title,
        description: data.description,
        severity: data.severity,
        source: data.source,
        departmentId: data.departmentId,
        unitId,
        assetId: data.assetId,
        reportedById: data.reportedById,
        assignedToId: data.assignedToId,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        notes: data.notes,
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async getRecord(id: string, user?: any) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true, unitId: true, organizationId: true } },
        actions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!record) {
      throw new NotFoundException('Quality record not found');
    }
    if (user) await this.assertRecordAccess(record, user);

    return record;
  }

  async updateRecord(id: string, data: any, user?: any) {
    const existing = await this.prisma.qualityRecord.findUnique({
      where: { id },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Quality record not found');
    }
    if (user) await this.assertRecordAccess(existing, user);

    const updateData: Prisma.QualityRecordUncheckedUpdateInput = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId;
    if (data.unitId !== undefined) updateData.unitId = data.unitId;
    if (data.assetId !== undefined) updateData.assetId = data.assetId;
    if (data.reportedById !== undefined) updateData.reportedById = data.reportedById;
    if (data.assignedToId !== undefined) updateData.assignedToId = data.assignedToId;
    if (data.targetDate !== undefined) updateData.targetDate = new Date(data.targetDate);
    if (data.closedAt !== undefined) updateData.closedAt = new Date(data.closedAt);
    if (data.notes !== undefined) updateData.notes = data.notes;

    return this.prisma.qualityRecord.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        actions: true,
      },
    });
  }

  async addAction(recordId: string, data: any, user?: any) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id: recordId },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!record) {
      throw new NotFoundException('Quality record not found');
    }
    if (user) await this.assertRecordAccess(record, user);

    return this.prisma.qualityAction.create({
      data: {
        recordId,
        actionNumber: data.actionNumber,
        actionType: data.actionType,
        description: data.description,
        responsibleId: data.responsibleId,
        targetDate: data.targetDate ? new Date(data.targetDate) : undefined,
        status: data.status || 'open',
        notes: data.notes,
      },
      include: {
        record: { select: { id: true, recordNumber: true, title: true } },
      },
    });
  }

  async approveRecord(id: string, approvedById: string) {
    const existing = await this.prisma.qualityRecord.findUnique({
      where: { id },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!existing) {
      throw new NotFoundException('Quality record not found');
    }

    await this.assertApproverOrg(existing, approvedById);

    return this.prisma.qualityRecord.update({
      where: { id },
      data: {
        status: 'closed',
        closedAt: new Date(),
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        actions: true,
      },
    });
  }

  private async assertApproverOrg(
    record: {
      asset?: { unitId?: string | null; organizationId?: string | null } | null;
    },
    approvedById: string,
  ) {
    const approver = await this.prisma.user.findUnique({
      where: { id: approvedById },
      select: { organizationId: true, unitId: true },
    });
    if (!approver) throw new NotFoundException('Approver not found');

    const effUnitId = !approver.organizationId && approver.unitId ? approver.unitId : record.asset?.unitId ?? null;
    const effOrg = record.asset?.organizationId
      ?? (effUnitId ? (await this.prisma.unit.findUnique({ where: { id: effUnitId }, select: { organizationId: true } }))?.organizationId ?? null : null);

    if (effOrg !== undefined && effOrg !== null && approver.organizationId !== undefined && approver.organizationId !== null && effOrg !== approver.organizationId) {
      throw new ForbiddenException('Başka kuruluşun kaydı onaylanamaz');
    }
    if (approver.unitId && effUnitId && effUnitId !== approver.unitId && !approver.organizationId) {
      throw new ForbiddenException('Bu kayda erişim yetkiniz yok');
    }
  }

  async updateAction(actionId: string, data: any, user?: any) {
    const existing = await this.prisma.qualityAction.findUnique({
      where: { id: actionId },
      include: { record: { include: { asset: { select: { unitId: true, organizationId: true } } } } },
    });
    if (!existing) {
      throw new NotFoundException('Quality action not found');
    }
    if (user) await this.assertRecordAccess(existing.record, user);

    const updateData: Prisma.QualityActionUncheckedUpdateInput = {};

    if (data.actionNumber !== undefined) updateData.actionNumber = data.actionNumber;
    if (data.actionType !== undefined) updateData.actionType = data.actionType;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.responsibleId !== undefined) updateData.responsibleId = data.responsibleId;
    if (data.targetDate !== undefined) updateData.targetDate = new Date(data.targetDate);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.completedAt !== undefined) updateData.completedAt = new Date(data.completedAt);
    if (data.notes !== undefined) updateData.notes = data.notes;

    return this.prisma.qualityAction.update({
      where: { id: actionId },
      data: updateData,
      include: {
        record: { select: { id: true, recordNumber: true, title: true } },
      },
    });
  }

  async deleteAction(actionId: string, user?: any) {
    const existing = await this.prisma.qualityAction.findUnique({
      where: { id: actionId },
      include: { record: { include: { asset: { select: { unitId: true, organizationId: true } } } } },
    });
    if (!existing) {
      throw new NotFoundException('Quality action not found');
    }
    if (user) await this.assertRecordAccess(existing.record, user);

    return this.prisma.qualityAction.delete({ where: { id: actionId } });
  }

  async listActions(recordId: string, user?: any) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id: recordId },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!record) {
      throw new NotFoundException('Quality record not found');
    }
    if (user) await this.assertRecordAccess(record, user);

    return this.prisma.qualityAction.findMany({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
