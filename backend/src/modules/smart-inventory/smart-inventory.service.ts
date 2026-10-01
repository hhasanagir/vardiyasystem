import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class SmartInventoryService {
  constructor(private prisma: PrismaService) {}

  async listTransfers(status?: string, catalogId?: string) {
    const where: Prisma.InventoryTransferWhereInput = {};
    if (status) where.status = status as any;
    if (catalogId) where.catalogId = catalogId;

    return this.prisma.inventoryTransfer.findMany({
      where,
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTransfer(id: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { id },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    return transfer;
  }

  async createTransfer(data: {
    fromWarehouseId?: string;
    toWarehouseId?: string;
    fromUnitId?: string;
    toUnitId?: string;
    catalogId: string;
    quantity: number;
    batchNumber?: string;
    notes?: string;
    requestedById?: string;
  }) {
    const transferNumber = `TF-${Date.now()}`;
    return this.prisma.inventoryTransfer.create({
      data: {
        transferNumber,
        fromWarehouseId: data.fromWarehouseId,
        toWarehouseId: data.toWarehouseId,
        fromUnitId: data.fromUnitId,
        toUnitId: data.toUnitId,
        catalogId: data.catalogId,
        quantity: data.quantity,
        batchNumber: data.batchNumber,
        notes: data.notes,
        requestedById: data.requestedById,
        status: 'draft',
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async approveTransfer(id: string, approvedById: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { id },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    return this.prisma.inventoryTransfer.update({
      where: { id },
      data: {
        status: 'approved',
        approvedById,
        approvedAt: new Date(),
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async completeTransfer(id: string, completedById: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { id },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    const updated = await this.prisma.inventoryTransfer.update({
      where: { id },
      data: {
        status: 'completed',
        completedById,
        completedAt: new Date(),
      },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });

    if (transfer.fromWarehouseId) {
      const fromStock = await this.prisma.consumableStock.findUnique({
        where: {
          catalogId_warehouseId: {
            catalogId: transfer.catalogId,
            warehouseId: transfer.fromWarehouseId,
          },
        },
      });
      if (!fromStock)
        throw new BadRequestException('Source warehouse stock not found');

      const newFromQty = fromStock.currentStock - transfer.quantity;
      if (newFromQty < 0)
        throw new BadRequestException('Insufficient stock in source warehouse');

      await this.prisma.consumableStock.update({
        where: {
          catalogId_warehouseId: {
            catalogId: transfer.catalogId,
            warehouseId: transfer.fromWarehouseId,
          },
        },
        data: { currentStock: newFromQty },
      });
    }

    if (transfer.toWarehouseId) {
      const toStock = await this.prisma.consumableStock.findUnique({
        where: {
          catalogId_warehouseId: {
            catalogId: transfer.catalogId,
            warehouseId: transfer.toWarehouseId,
          },
        },
      });

      if (toStock) {
        await this.prisma.consumableStock.update({
          where: {
            catalogId_warehouseId: {
              catalogId: transfer.catalogId,
              warehouseId: transfer.toWarehouseId,
            },
          },
          data: { currentStock: toStock.currentStock + transfer.quantity },
        });
      } else {
        await this.prisma.consumableStock.create({
          data: {
            catalogId: transfer.catalogId,
            warehouseId: transfer.toWarehouseId,
            currentStock: transfer.quantity,
          },
        });
      }
    }

    return updated;
  }

  async cancelTransfer(id: string) {
    const transfer = await this.prisma.inventoryTransfer.findUnique({
      where: { id },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');

    return this.prisma.inventoryTransfer.update({
      where: { id },
      data: { status: 'cancelled' },
      include: {
        fromWarehouse: { select: { id: true, name: true } },
        toWarehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async listConsumptions(
    catalogId?: string,
    assetId?: string,
    from?: string,
    to?: string,
  ) {
    const where: Prisma.ConsumptionRecordWhereInput = {};
    if (catalogId) where.catalogId = catalogId;
    if (assetId) where.assetId = assetId;
    if (from || to) {
      where.recordedAt = {};
      if (from) where.recordedAt.gte = new Date(from);
      if (to) where.recordedAt.lte = new Date(to);
    }

    return this.prisma.consumptionRecord.findMany({
      where,
      include: {
        catalog: { select: { id: true, code: true, name: true } },
        asset: { select: { id: true, name: true } },
      },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async createConsumption(data: {
    catalogId: string;
    quantity: number;
    consumptionType: string;
    assetId?: string;
    examinationType?: string;
    departmentId?: string;
    unitId?: string;
    batchNumber?: string;
    cost?: number;
    notes?: string;
    recordedById?: string;
  }) {
    return this.prisma.consumptionRecord.create({
      data: {
        catalogId: data.catalogId,
        quantity: data.quantity,
        consumptionType: data.consumptionType as any,
        assetId: data.assetId,
        examinationType: data.examinationType,
        departmentId: data.departmentId,
        unitId: data.unitId,
        batchNumber: data.batchNumber,
        cost: data.cost,
        notes: data.notes,
        recordedById: data.recordedById,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
        asset: { select: { id: true, name: true } },
      },
    });
  }

  async listCounts(warehouseId?: string, status?: string) {
    const where: Prisma.InventoryCountWhereInput = {};
    if (warehouseId) where.warehouseId = warehouseId;
    if (status) where.status = status;

    return this.prisma.inventoryCount.findMany({
      where,
      include: {
        warehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createCount(data: {
    warehouseId?: string;
    catalogId: string;
    expectedQty: number;
    actualQty: number;
    unitCost?: number;
    countedById?: string;
    notes?: string;
  }) {
    const countNumber = `IC-${Date.now()}`;
    const difference = data.actualQty - data.expectedQty;
    const totalDifference =
      data.unitCost != null ? difference * data.unitCost : undefined;

    return this.prisma.inventoryCount.create({
      data: {
        countNumber,
        warehouseId: data.warehouseId,
        catalogId: data.catalogId,
        expectedQty: data.expectedQty,
        actualQty: data.actualQty,
        difference,
        unitCost: data.unitCost,
        totalDifference,
        countedById: data.countedById,
        notes: data.notes,
        status: 'pending',
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async approveCount(id: string, approvedById: string) {
    const count = await this.prisma.inventoryCount.findUnique({
      where: { id },
    });
    if (!count) throw new NotFoundException('Inventory count not found');

    const updated = await this.prisma.inventoryCount.update({
      where: { id },
      data: {
        status: 'approved',
        approvedById,
        approvedAt: new Date(),
      },
      include: {
        warehouse: { select: { id: true, name: true } },
        catalog: { select: { id: true, code: true, name: true } },
      },
    });

    if (count.warehouseId) {
      const stock = await this.prisma.consumableStock.findUnique({
        where: {
          catalogId_warehouseId: {
            catalogId: count.catalogId,
            warehouseId: count.warehouseId,
          },
        },
      });

      if (stock) {
        await this.prisma.consumableStock.update({
          where: {
            catalogId_warehouseId: {
              catalogId: count.catalogId,
              warehouseId: count.warehouseId,
            },
          },
          data: { currentStock: count.actualQty },
        });
      } else {
        await this.prisma.consumableStock.create({
          data: {
            catalogId: count.catalogId,
            warehouseId: count.warehouseId,
            currentStock: count.actualQty,
          },
        });
      }
    }

    return updated;
  }

  async listWaste(wasteType?: string, from?: string, to?: string) {
    const where: Prisma.WasteRecordWhereInput = {};
    if (wasteType) where.wasteType = wasteType as any;
    if (from || to) {
      where.disposedAt = {};
      if (from) where.disposedAt.gte = new Date(from);
      if (to) where.disposedAt.lte = new Date(to);
    }

    return this.prisma.wasteRecord.findMany({
      where,
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createWaste(data: {
    catalogId: string;
    quantity: number;
    wasteType: string;
    batchNumber?: string;
    reason: string;
    disposalMethod?: string;
    cost?: number;
    notes?: string;
    disposedById?: string;
  }) {
    const wasteNumber = `WS-${Date.now()}`;

    const stockItems = await this.prisma.consumableStock.findMany({
      where: { catalogId: data.catalogId },
    });

    for (const stock of stockItems) {
      const newQty = stock.currentStock - data.quantity;
      if (newQty >= 0) {
        await this.prisma.consumableStock.update({
          where: {
            catalogId_warehouseId: {
              catalogId: data.catalogId,
              warehouseId: stock.warehouseId,
            },
          },
          data: { currentStock: newQty },
        });
        break;
      }
    }

    return this.prisma.wasteRecord.create({
      data: {
        wasteNumber,
        catalogId: data.catalogId,
        quantity: data.quantity,
        wasteType: data.wasteType as any,
        batchNumber: data.batchNumber,
        reason: data.reason,
        disposalMethod: data.disposalMethod,
        cost: data.cost,
        notes: data.notes,
        disposedById: data.disposedById,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async listAlerts(isResolved?: boolean, alertType?: string) {
    const where: Prisma.StockAlertWhereInput = {};
    if (isResolved !== undefined) where.isResolved = isResolved;
    if (alertType) where.alertType = alertType as any;

    return this.prisma.stockAlert.findMany({
      where,
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createAlert(data: {
    catalogId: string;
    alertType: string;
    threshold?: number;
    currentValue: number;
    message: string;
    severity?: string;
    notifiedAt?: Date;
  }) {
    return this.prisma.stockAlert.create({
      data: {
        catalogId: data.catalogId,
        alertType: data.alertType as any,
        threshold: data.threshold,
        currentValue: data.currentValue,
        message: data.message,
        severity: data.severity ?? 'warning',
        notifiedAt: data.notifiedAt,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async resolveAlert(id: string, resolvedById: string) {
    const alert = await this.prisma.stockAlert.findUnique({ where: { id } });
    if (!alert) throw new NotFoundException('Stock alert not found');

    return this.prisma.stockAlert.update({
      where: { id },
      data: {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedById,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async checkStockLevels() {
    const stocks = await this.prisma.consumableStock.findMany({
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
    });

    const createdAlerts: any[] = [];

    for (const stock of stocks) {
      if (stock.currentStock <= stock.minimumStock) {
        const existingAlert = await this.prisma.stockAlert.findFirst({
          where: {
            catalogId: stock.catalogId,
            alertType: 'low_stock',
            isResolved: false,
          },
        });

        if (!existingAlert) {
          const alert = await this.prisma.stockAlert.create({
            data: {
              catalogId: stock.catalogId,
              alertType: 'low_stock',
              threshold: stock.minimumStock,
              currentValue: stock.currentStock,
              message: `Low stock alert for ${stock.catalog.name} (${stock.catalog.code}): ${stock.currentStock} units remaining, minimum is ${stock.minimumStock}`,
              severity: stock.currentStock === 0 ? 'critical' : 'warning',
            },
            include: {
              catalog: { select: { id: true, code: true, name: true } },
            },
          });
          createdAlerts.push(alert);
        }
      }
    }

    const batches = await this.prisma.consumableBatch.findMany({
      where: {
        expirationDate: { not: null },
        isActive: true,
      },
      include: {
        catalog: { select: { id: true, code: true, name: true } },
      },
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    for (const batch of batches) {
      if (!batch.expirationDate) continue;

      const isExpired = batch.expirationDate < now;
      const isExpiringSoon =
        batch.expirationDate <= thirtyDaysFromNow && batch.expirationDate > now;

      if (isExpired) {
        const existingAlert = await this.prisma.stockAlert.findFirst({
          where: {
            catalogId: batch.catalogId,
            alertType: 'expired',
            isResolved: false,
          },
        });

        if (!existingAlert) {
          const alert = await this.prisma.stockAlert.create({
            data: {
              catalogId: batch.catalogId,
              alertType: 'expired',
              currentValue: batch.quantity,
              message: `Expired batch ${batch.lotNumber} for ${batch.catalog.name}: expired on ${batch.expirationDate.toISOString().split('T')[0]}`,
              severity: 'critical',
            },
            include: {
              catalog: { select: { id: true, code: true, name: true } },
            },
          });
          createdAlerts.push(alert);
        }
      } else if (isExpiringSoon) {
        const existingAlert = await this.prisma.stockAlert.findFirst({
          where: {
            catalogId: batch.catalogId,
            alertType: 'expiring_soon',
            isResolved: false,
          },
        });

        if (!existingAlert) {
          const alert = await this.prisma.stockAlert.create({
            data: {
              catalogId: batch.catalogId,
              alertType: 'expiring_soon',
              currentValue: batch.quantity,
              message: `Expiring soon: batch ${batch.lotNumber} for ${batch.catalog.name} expires on ${batch.expirationDate.toISOString().split('T')[0]}`,
              severity: 'warning',
            },
            include: {
              catalog: { select: { id: true, code: true, name: true } },
            },
          });
          createdAlerts.push(alert);
        }
      }
    }

    return {
      createdAlerts,
      checkedStocks: stocks.length,
      checkedBatches: batches.length,
    };
  }
}
