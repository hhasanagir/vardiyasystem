import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ConsumablesService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    category?: string;
    search?: string;
    isActive?: boolean;
  }) {
    const where: Prisma.ConsumableCatalogWhereInput = {};

    if (filters?.category) where.category = filters.category as any;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { code: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.consumableCatalog.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        stockItems: {
          include: { warehouse: { select: { id: true, name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findById(id: string) {
    const consumable = await this.prisma.consumableCatalog.findUnique({
      where: { id },
      include: {
        supplier: true,
        stockItems: {
          include: { warehouse: true },
        },
        batches: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!consumable) {
      throw new NotFoundException('Consumable not found');
    }

    return consumable;
  }

  async create(data: any) {
    return this.prisma.consumableCatalog.create({
      data: {
        code: data.code,
        barcode: data.barcode,
        qrCode: data.qrCode,
        name: data.name,
        category: data.category,
        manufacturer: data.manufacturer,
        brand: data.brand,
        supplierId: data.supplierId,
        unitOfMeasure: data.unitOfMeasure || 'piece',
        packageSize: data.packageSize,
        description: data.description,
        assetId: data.assetId,
        compatibleDeviceIds: data.compatibleDeviceIds || [],
        compatibleExamTypes: data.compatibleExamTypes || [],
        isActive: data.isActive ?? true,
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.consumableCatalog.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Consumable not found');
    }

    const updateData: Prisma.ConsumableCatalogUncheckedUpdateInput = {};

    if (data.code !== undefined) updateData.code = data.code;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.qrCode !== undefined) updateData.qrCode = data.qrCode;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.manufacturer !== undefined)
      updateData.manufacturer = data.manufacturer;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
    if (data.unitOfMeasure !== undefined)
      updateData.unitOfMeasure = data.unitOfMeasure;
    if (data.packageSize !== undefined)
      updateData.packageSize = data.packageSize;
    if (data.description !== undefined)
      updateData.description = data.description;
    if (data.assetId !== undefined) updateData.assetId = data.assetId;
    if (data.compatibleDeviceIds !== undefined)
      updateData.compatibleDeviceIds = data.compatibleDeviceIds;
    if (data.compatibleExamTypes !== undefined)
      updateData.compatibleExamTypes = data.compatibleExamTypes;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.consumableCatalog.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true } },
      },
    });
  }

  async getAllStock() {
    const stocks = await this.prisma.consumableStock.findMany({
      include: {
        catalog: {
          select: { id: true, name: true, code: true, unitOfMeasure: true },
        },
        warehouse: { select: { id: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    stocks.sort((a, b) => a.catalog.name.localeCompare(b.catalog.name));

    return stocks.map((s) => ({
      id: s.id,
      catalogId: s.catalogId,
      catalogName: s.catalog.name,
      catalogCode: s.catalog.code,
      quantity: s.currentStock,
      minStock: s.minimumStock,
      maxStock: s.maximumStock,
      unit: s.catalog.unitOfMeasure,
      location: s.warehouse.name,
      lastUpdated: s.updatedAt,
    }));
  }

  async getStock(id: string) {
    const consumable = await this.prisma.consumableCatalog.findUnique({
      where: { id },
    });
    if (!consumable) {
      throw new NotFoundException('Consumable not found');
    }

    return this.prisma.consumableStock.findMany({
      where: { catalogId: id },
      include: { warehouse: true },
    });
  }

  async getTransactions(id: string) {
    const consumable = await this.prisma.consumableCatalog.findUnique({
      where: { id },
    });
    if (!consumable) {
      throw new NotFoundException('Consumable not found');
    }

    return this.prisma.consumableTransaction.findMany({
      where: { catalogId: id },
      include: { warehouse: true, batch: true },
      orderBy: { transactionDate: 'desc' },
    });
  }

  async getAllTransactions() {
    const transactions = await this.prisma.consumableTransaction.findMany({
      include: {
        catalog: { select: { id: true, name: true } },
      },
      orderBy: { transactionDate: 'desc' },
      take: 100,
    });

    return transactions.map((t) => ({
      id: t.id,
      catalogId: t.catalogId,
      catalogName: t.catalog.name,
      type: t.type,
      quantity: t.quantity,
      unitPrice: t.unitCost ? Number(t.unitCost) : null,
      referenceNumber: t.referenceId,
      performedBy: t.performedById,
      notes: t.notes,
      createdAt: t.createdAt,
    }));
  }
}
