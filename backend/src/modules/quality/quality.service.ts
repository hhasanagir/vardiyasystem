import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class QualityService {
  constructor(private prisma: PrismaService) {}

  async listRecords(filters?: {
    type?: string;
    status?: string;
    severity?: string;
  }) {
    const where: Prisma.QualityRecordWhereInput = {};

    if (filters?.type) where.type = filters.type as any;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.severity) where.severity = filters.severity;

    return this.prisma.qualityRecord.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        actions: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createRecord(data: any) {
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
        unitId: data.unitId,
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

  async getRecord(id: string) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id },
      include: {
        asset: true,
        actions: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!record) {
      throw new NotFoundException('Quality record not found');
    }

    return record;
  }

  async updateRecord(id: string, data: any) {
    const existing = await this.prisma.qualityRecord.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Quality record not found');
    }

    const updateData: Prisma.QualityRecordUncheckedUpdateInput = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.severity !== undefined) updateData.severity = data.severity;
    if (data.source !== undefined) updateData.source = data.source;
    if (data.departmentId !== undefined)
      updateData.departmentId = data.departmentId;
    if (data.unitId !== undefined) updateData.unitId = data.unitId;
    if (data.assetId !== undefined) updateData.assetId = data.assetId;
    if (data.reportedById !== undefined)
      updateData.reportedById = data.reportedById;
    if (data.assignedToId !== undefined)
      updateData.assignedToId = data.assignedToId;
    if (data.targetDate !== undefined)
      updateData.targetDate = new Date(data.targetDate);
    if (data.closedAt !== undefined)
      updateData.closedAt = new Date(data.closedAt);
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

  async addAction(recordId: string, data: any) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) {
      throw new NotFoundException('Quality record not found');
    }

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
    });
    if (!existing) {
      throw new NotFoundException('Quality record not found');
    }

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

  async updateAction(actionId: string, data: any) {
    const existing = await this.prisma.qualityAction.findUnique({
      where: { id: actionId },
    });
    if (!existing) {
      throw new NotFoundException('Quality action not found');
    }

    const updateData: Prisma.QualityActionUncheckedUpdateInput = {};

    if (data.actionNumber !== undefined)
      updateData.actionNumber = data.actionNumber;
    if (data.actionType !== undefined) updateData.actionType = data.actionType;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.responsibleId !== undefined)
      updateData.responsibleId = data.responsibleId;
    if (data.targetDate !== undefined)
      updateData.targetDate = new Date(data.targetDate);
    if (data.status !== undefined) updateData.status = data.status;
    if (data.completedAt !== undefined)
      updateData.completedAt = new Date(data.completedAt);
    if (data.notes !== undefined) updateData.notes = data.notes;

    return this.prisma.qualityAction.update({
      where: { id: actionId },
      data: updateData,
      include: {
        record: { select: { id: true, recordNumber: true, title: true } },
      },
    });
  }

  async deleteAction(actionId: string) {
    const existing = await this.prisma.qualityAction.findUnique({
      where: { id: actionId },
    });
    if (!existing) {
      throw new NotFoundException('Quality action not found');
    }

    return this.prisma.qualityAction.delete({ where: { id: actionId } });
  }

  async listActions(recordId: string) {
    const record = await this.prisma.qualityRecord.findUnique({
      where: { id: recordId },
    });
    if (!record) {
      throw new NotFoundException('Quality record not found');
    }

    return this.prisma.qualityAction.findMany({
      where: { recordId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
