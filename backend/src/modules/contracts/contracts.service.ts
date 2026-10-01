import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ContractsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    type?: string;
    status?: string;
    supplierId?: string;
  }) {
    const where: Prisma.ServiceContractWhereInput = {};

    if (filters?.type) where.type = filters.type as any;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.supplierId) where.supplierId = filters.supplierId;

    return this.prisma.serviceContract.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        supplier: { select: { id: true, name: true } },
        documents: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const contract = await this.prisma.serviceContract.findUnique({
      where: { id },
      include: {
        asset: true,
        supplier: true,
        documents: true,
      },
    });

    if (!contract) {
      throw new NotFoundException('Contract not found');
    }

    return contract;
  }

  async create(data: any) {
    return this.prisma.serviceContract.create({
      data: {
        contractNumber: data.contractNumber,
        assetId: data.assetId,
        supplierId: data.supplierId,
        type: data.type,
        status: data.status || 'draft',
        title: data.title,
        description: data.description,
        startDate: new Date(data.startDate),
        endDate: new Date(data.endDate),
        renewalDate: data.renewalDate ? new Date(data.renewalDate) : undefined,
        value: data.value,
        currency: data.currency || 'TRY',
        slaResponseTime: data.slaResponseTime,
        slaResolutionTime: data.slaResolutionTime,
        slaPenalty: data.slaPenalty,
        paymentTerms: data.paymentTerms,
        scope: data.scope,
        exclusions: data.exclusions,
        notes: data.notes,
        isActive: data.isActive ?? true,
      },
      include: {
        asset: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.serviceContract.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contract not found');
    }

    const updateData: Prisma.ServiceContractUncheckedUpdateInput = {};

    if (data.contractNumber !== undefined)
      updateData.contractNumber = data.contractNumber;
    if (data.assetId !== undefined) updateData.assetId = data.assetId;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.title !== undefined) updateData.title = data.title;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.startDate !== undefined)
      updateData.startDate = new Date(data.startDate);
    if (data.endDate !== undefined) updateData.endDate = new Date(data.endDate);
    if (data.renewalDate !== undefined)
      updateData.renewalDate = new Date(data.renewalDate);
    if (data.value !== undefined) updateData.value = data.value;
    if (data.currency !== undefined) updateData.currency = data.currency;
    if (data.slaResponseTime !== undefined)
      updateData.slaResponseTime = data.slaResponseTime;
    if (data.slaResolutionTime !== undefined)
      updateData.slaResolutionTime = data.slaResolutionTime;
    if (data.slaPenalty !== undefined) updateData.slaPenalty = data.slaPenalty;
    if (data.paymentTerms !== undefined)
      updateData.paymentTerms = data.paymentTerms;
    if (data.scope !== undefined) updateData.scope = data.scope;
    if (data.exclusions !== undefined) updateData.exclusions = data.exclusions;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.serviceContract.update({
      where: { id },
      data: updateData,
      include: {
        asset: { select: { id: true, name: true } },
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async getExpiring(days: number = 30) {
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(now.getDate() + days);

    return this.prisma.serviceContract.findMany({
      where: {
        isActive: true,
        endDate: {
          gte: now,
          lte: expiryDate,
        },
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { endDate: 'asc' },
    });
  }
}
