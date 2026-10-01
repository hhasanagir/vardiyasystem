import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async listWarehouses(filters?: { hospitalId?: string; isActive?: boolean }) {
    const where: Prisma.WarehouseWhereInput = {};

    if (filters?.hospitalId) where.hospitalId = filters.hospitalId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    return this.prisma.warehouse.findMany({
      where,
      include: {
        _count: { select: { stockItems: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(data: any) {
    return this.prisma.warehouse.create({
      data: {
        code: data.code,
        name: data.name,
        location: data.location,
        type: data.type,
        hospitalId: data.hospitalId,
        isActive: data.isActive ?? true,
      },
    });
  }

  async getStock(filters?: { warehouseId?: string; catalogId?: string }) {
    const where: Prisma.ConsumableStockWhereInput = {};

    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.catalogId) where.catalogId = filters.catalogId;

    return this.prisma.consumableStock.findMany({
      where,
      include: {
        catalog: {
          select: { id: true, code: true, name: true, category: true },
        },
        warehouse: { select: { id: true, code: true, name: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async getTransactions(filters?: {
    warehouseId?: string;
    catalogId?: string;
    type?: string;
  }) {
    const where: Prisma.ConsumableTransactionWhereInput = {};

    if (filters?.warehouseId) where.warehouseId = filters.warehouseId;
    if (filters?.catalogId) where.catalogId = filters.catalogId;
    if (filters?.type) where.type = filters.type as any;

    return this.prisma.consumableTransaction.findMany({
      where,
      include: {
        catalog: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
        batch: true,
      },
      orderBy: { transactionDate: 'desc' },
    });
  }

  async adjustStock(data: {
    catalogId: string;
    warehouseId: string;
    type: string;
    quantity: number;
    unitCost?: number;
    batchId?: string;
    referenceType?: string;
    referenceId?: string;
    notes?: string;
    performedById?: string;
  }) {
    const stock = await this.prisma.consumableStock.findUnique({
      where: {
        catalogId_warehouseId: {
          catalogId: data.catalogId,
          warehouseId: data.warehouseId,
        },
      },
    });

    if (!stock) {
      throw new NotFoundException(
        'Stock record not found for this catalog and warehouse combination',
      );
    }

    const newStock =
      data.type === 'in' || data.type === 'adjustment'
        ? stock.currentStock + Math.abs(data.quantity)
        : stock.currentStock - Math.abs(data.quantity);

    if (newStock < 0) {
      throw new BadRequestException('Insufficient stock for this operation');
    }

    const totalCost = data.unitCost
      ? data.unitCost * Math.abs(data.quantity)
      : undefined;

    await this.prisma.consumableStock.update({
      where: {
        catalogId_warehouseId: {
          catalogId: data.catalogId,
          warehouseId: data.warehouseId,
        },
      },
      data: { currentStock: newStock },
    });

    return this.prisma.consumableTransaction.create({
      data: {
        catalogId: data.catalogId,
        warehouseId: data.warehouseId,
        type: data.type as any,
        quantity: Math.abs(data.quantity),
        unitCost: data.unitCost,
        totalCost,
        batchId: data.batchId,
        referenceType: data.referenceType,
        referenceId: data.referenceId,
        notes: data.notes,
        performedById: data.performedById,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
        warehouse: { select: { id: true, code: true, name: true } },
      },
    });
  }
}
