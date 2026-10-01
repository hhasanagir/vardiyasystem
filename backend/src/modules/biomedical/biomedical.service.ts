import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class BiomedicalService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    type?: string;
    status?: string;
    assetId?: string;
  }) {
    const where: Prisma.MaintenanceRecordWhereInput = {};

    if (filters?.type) where.type = filters.type as any;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.assetId) where.assetId = filters.assetId;

    return this.prisma.maintenanceRecord.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        parts: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const record = await this.prisma.maintenanceRecord.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        parts: true,
        documents: true,
      },
    });

    if (!record) {
      throw new NotFoundException('Maintenance record not found');
    }

    return record;
  }

  async create(data: any) {
    return this.prisma.maintenanceRecord.create({
      data: {
        assetId: data.assetId,
        type: data.type,
        priority: data.priority || 'medium',
        status: data.status || 'open',
        title: data.title,
        description: data.description,
        reportedById: data.reportedById,
        assignedToId: data.assignedToId,
        vendorId: data.vendorId,
        startDate: data.startDate ? new Date(data.startDate) : undefined,
        endDate: data.endDate ? new Date(data.endDate) : undefined,
        downtimeHours: data.downtimeHours,
        cost: data.cost,
        mtbf: data.mtbf,
        mttr: data.mttr,
        rootCause: data.rootCause,
        resolution: data.resolution,
        closingNotes: data.closingNotes,
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.maintenanceRecord.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Maintenance record not found');
    }

    const updateData: Prisma.MaintenanceRecordUpdateInput = {};

    if (data.type !== undefined) updateData.type = data.type;
    if (data.priority !== undefined) updateData.priority = data.priority;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.reportedById !== undefined)
      updateData.reportedById = data.reportedById;
    if (data.assignedToId !== undefined)
      updateData.assignedToId = data.assignedToId;
    if (data.vendorId !== undefined) updateData.vendorId = data.vendorId;
    if (data.startDate !== undefined)
      updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.downtimeHours !== undefined)
      updateData.downtimeHours = data.downtimeHours;
    if (data.cost !== undefined) updateData.cost = data.cost;
    if (data.mtbf !== undefined) updateData.mtbf = data.mtbf;
    if (data.mttr !== undefined) updateData.mttr = data.mttr;
    if (data.rootCause !== undefined) updateData.rootCause = data.rootCause;
    if (data.resolution !== undefined) updateData.resolution = data.resolution;
    if (data.closingNotes !== undefined)
      updateData.closingNotes = data.closingNotes;
    if (data.verifiedById !== undefined)
      updateData.verifiedById = data.verifiedById;
    if (data.verifiedAt !== undefined)
      updateData.verifiedAt = new Date(data.verifiedAt);

    return this.prisma.maintenanceRecord.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        parts: true,
        documents: true,
      },
    });
  }

  async getByAsset(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.maintenanceRecord.findMany({
      where: { assetId },
      include: {
        parts: true,
        documents: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
