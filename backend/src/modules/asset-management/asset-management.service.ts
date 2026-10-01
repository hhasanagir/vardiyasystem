import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AssetManagementService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: {
    category?: string;
    status?: string;
    unitId?: string;
    departmentId?: string;
    hospitalId?: string;
    supplierId?: string;
    isActive?: boolean;
    search?: string;
  }) {
    const where: Prisma.EnterpriseAssetWhereInput = {};

    if (filters?.category) where.category = filters.category as any;
    if (filters?.status) where.status = filters.status as any;
    if (filters?.unitId) where.unitId = filters.unitId;
    if (filters?.departmentId) where.departmentId = filters.departmentId;
    if (filters?.hospitalId) where.hospitalId = filters.hospitalId;
    if (filters?.supplierId) where.supplierId = filters.supplierId;
    if (filters?.isActive !== undefined) where.isActive = filters.isActive;

    if (filters?.search) {
      where.OR = [
        { name: { contains: filters.search, mode: 'insensitive' } },
        { assetNumber: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { manufacturer: { contains: filters.search, mode: 'insensitive' } },
        { barcode: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.enterpriseAsset.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
        department: { select: { id: true, name: true } },
        hospital: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id },
      include: {
        supplier: true,
        unit: true,
        department: true,
        hospital: true,
        documents: true,
        movements: { orderBy: { movedAt: 'desc' }, take: 20 },
        maintenanceRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }

  async getFullDetail(id: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id },
      include: {
        supplier: true,
        unit: true,
        department: true,
        ownerDepartment: true,
        room: true,
        hospital: true,
        device: true,
        documents: true,
        movements: { orderBy: { movedAt: 'desc' }, take: 50 },
        maintenanceRecords: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { parts: true },
        },
        calibrationRecords: { orderBy: { scheduledDate: 'desc' }, take: 20 },
        lifecycleEvents: { orderBy: { eventDate: 'desc' }, take: 30 },
        serviceContracts: true,
        consumables: { take: 10 },
        qualityRecords: { orderBy: { createdAt: 'desc' }, take: 10 },
        radiationMeasurements: { orderBy: { createdAt: 'desc' }, take: 10 },
        consumptionRecords: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return asset;
  }

  async getDashboard() {
    const [
      totalAssets,
      activeCount,
      maintenanceCount,
      faultCount,
      outOfServiceCount,
      categoryDistribution,
      statusDistribution,
      assetsWithWarranty,
      assetsExpiringWarranty,
      assetsWithNoQR,
    ] = await Promise.all([
      this.prisma.enterpriseAsset.count(),
      this.prisma.enterpriseAsset.count({ where: { status: 'active' } }),
      this.prisma.enterpriseAsset.count({
        where: { status: 'under_maintenance' },
      }),
      this.prisma.enterpriseAsset.count({ where: { status: 'fault' } }),
      this.prisma.enterpriseAsset.count({
        where: { status: 'out_of_service' },
      }),
      this.prisma.enterpriseAsset.groupBy({
        by: ['category'],
        _count: true,
      }),
      this.prisma.enterpriseAsset.groupBy({
        by: ['status'],
        _count: true,
      }),
      this.prisma.enterpriseAsset.count({
        where: { warrantyEnd: { not: null } },
      }),
      this.prisma.enterpriseAsset.count({
        where: {
          warrantyEnd: {
            not: null,
            lte: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      this.prisma.enterpriseAsset.count({
        where: { qrCode: null },
      }),
    ]);

    return {
      totalAssets,
      activeCount,
      maintenanceCount,
      faultCount,
      outOfServiceCount,
      categoryDistribution,
      statusDistribution,
      assetsWithWarranty,
      assetsExpiringWarranty,
      assetsWithNoQR,
    };
  }

  async generateQR(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetNumber: true, qrCode: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    const qrPayload = JSON.stringify({
      id: asset.id,
      assetNumber: asset.assetNumber,
      name: asset.name,
    });
    const qrHash = crypto
      .createHash('sha256')
      .update(qrPayload)
      .digest('hex')
      .slice(0, 16);
    const qrValue = `vardiya://asset/${asset.assetNumber}?v=${qrHash}`;

    await this.prisma.enterpriseAsset.update({
      where: { id: assetId },
      data: { qrCode: qrValue },
    });

    return {
      qrCode: qrValue,
      qrPayload,
      qrHash,
      assetNumber: asset.assetNumber,
    };
  }

  async create(data: any) {
    if (!data.assetNumber) {
      const count = await this.prisma.enterpriseAsset.count();
      data.assetNumber = `VAR-${String(count + 1).padStart(6, '0')}`;
    }

    return this.prisma.enterpriseAsset.create({
      data: {
        assetNumber: data.assetNumber,
        barcode: data.barcode,
        qrCode: data.qrCode,
        rfidTag: data.rfidTag,
        name: data.name,
        category: data.category,
        status: data.status || 'active',
        manufacturer: data.manufacturer,
        model: data.model,
        serialNumber: data.serialNumber,
        brand: data.brand,
        yearOfManufacture: data.yearOfManufacture,
        installationDate: data.installationDate
          ? new Date(data.installationDate)
          : undefined,
        acceptanceDate: data.acceptanceDate
          ? new Date(data.acceptanceDate)
          : undefined,
        commissioningDate: data.commissioningDate
          ? new Date(data.commissioningDate)
          : undefined,
        warrantyStart: data.warrantyStart
          ? new Date(data.warrantyStart)
          : undefined,
        warrantyEnd: data.warrantyEnd ? new Date(data.warrantyEnd) : undefined,
        expectedLifetimeYears: data.expectedLifetimeYears,
        purchaseCost: data.purchaseCost,
        currentValue: data.currentValue,
        supplierId: data.supplierId,
        contractNumber: data.contractNumber,
        invoiceNumber: data.invoiceNumber,
        purchaseOrderNumber: data.purchaseOrderNumber,
        notes: data.notes,
        departmentId: data.departmentId,
        block: data.block,
        floor: data.floor,
        roomId: data.roomId,
        unitId: data.unitId,
        hospitalId: data.hospitalId,
        ownerDepartmentId: data.ownerDepartmentId,
        responsibleEngineerId: data.responsibleEngineerId,
        organizationId: data.organizationId,
        deviceId: data.deviceId,
        isActive: data.isActive ?? true,
      },
      include: {
        supplier: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });
  }

  async update(id: string, data: any) {
    const existing = await this.prisma.enterpriseAsset.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    const updateData: Prisma.EnterpriseAssetUncheckedUpdateInput = {};

    if (data.assetNumber !== undefined)
      updateData.assetNumber = data.assetNumber;
    if (data.barcode !== undefined) updateData.barcode = data.barcode;
    if (data.qrCode !== undefined) updateData.qrCode = data.qrCode;
    if (data.rfidTag !== undefined) updateData.rfidTag = data.rfidTag;
    if (data.name !== undefined) updateData.name = data.name;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.manufacturer !== undefined)
      updateData.manufacturer = data.manufacturer;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.serialNumber !== undefined)
      updateData.serialNumber = data.serialNumber;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.yearOfManufacture !== undefined)
      updateData.yearOfManufacture = data.yearOfManufacture;
    if (data.installationDate !== undefined)
      updateData.installationDate = new Date(data.installationDate);
    if (data.acceptanceDate !== undefined)
      updateData.acceptanceDate = new Date(data.acceptanceDate);
    if (data.commissioningDate !== undefined)
      updateData.commissioningDate = new Date(data.commissioningDate);
    if (data.warrantyStart !== undefined)
      updateData.warrantyStart = new Date(data.warrantyStart);
    if (data.warrantyEnd !== undefined)
      updateData.warrantyEnd = new Date(data.warrantyEnd);
    if (data.expectedLifetimeYears !== undefined)
      updateData.expectedLifetimeYears = data.expectedLifetimeYears;
    if (data.purchaseCost !== undefined)
      updateData.purchaseCost = data.purchaseCost;
    if (data.currentValue !== undefined)
      updateData.currentValue = data.currentValue;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;
    if (data.contractNumber !== undefined)
      updateData.contractNumber = data.contractNumber;
    if (data.invoiceNumber !== undefined)
      updateData.invoiceNumber = data.invoiceNumber;
    if (data.purchaseOrderNumber !== undefined)
      updateData.purchaseOrderNumber = data.purchaseOrderNumber;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.departmentId !== undefined)
      updateData.departmentId = data.departmentId;
    if (data.block !== undefined) updateData.block = data.block;
    if (data.floor !== undefined) updateData.floor = data.floor;
    if (data.roomId !== undefined) updateData.roomId = data.roomId;
    if (data.unitId !== undefined) updateData.unitId = data.unitId;
    if (data.hospitalId !== undefined) updateData.hospitalId = data.hospitalId;
    if (data.ownerDepartmentId !== undefined)
      updateData.ownerDepartmentId = data.ownerDepartmentId;
    if (data.responsibleEngineerId !== undefined)
      updateData.responsibleEngineerId = data.responsibleEngineerId;
    if (data.organizationId !== undefined)
      updateData.organizationId = data.organizationId;
    if (data.deviceId !== undefined) updateData.deviceId = data.deviceId;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;

    return this.prisma.enterpriseAsset.update({
      where: { id },
      data: updateData,
      include: {
        supplier: { select: { id: true, name: true } },
        unit: { select: { id: true, name: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.enterpriseAsset.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Asset not found');
    }

    await this.prisma.enterpriseAsset.delete({ where: { id } });
    return { success: true };
  }

  async getDocuments(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.assetDocument.findMany({
      where: { assetId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMovements(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException('Asset not found');
    }

    return this.prisma.assetMovement.findMany({
      where: { assetId },
      orderBy: { movedAt: 'desc' },
    });
  }

  async getDeviceCompatibleConsumables(assetId: string) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
      select: { id: true, category: true, model: true },
    });
    if (!asset) throw new NotFoundException('Asset not found');

    return this.prisma.consumableCatalog.findMany({
      where: {
        compatibleDeviceIds: {
          hasSome: [asset.id],
        },
      },
      include: {
        supplier: { select: { id: true, name: true } },
      },
      take: 50,
    });
  }

  async getWarrantyStatus() {
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const [active, expiringSoon, expired, noWarranty, byMonth] =
      await Promise.all([
        this.prisma.enterpriseAsset.count({
          where: { warrantyEnd: { gte: in90Days } },
        }),
        this.prisma.enterpriseAsset.count({
          where: { warrantyEnd: { gte: now, lte: in90Days } },
        }),
        this.prisma.enterpriseAsset.count({
          where: { warrantyEnd: { lt: now } },
        }),
        this.prisma.enterpriseAsset.count({
          where: { warrantyEnd: null },
        }),
        this.prisma.$queryRaw`
        SELECT
          DATE_TRUNC('month', "warrantyEnd")::date AS month,
          COUNT(*)::int AS count
        FROM enterprise_assets
        WHERE "warrantyEnd" IS NOT NULL
          AND "warrantyEnd" >= NOW()
          AND "warrantyEnd" <= NOW() + INTERVAL '12 months'
        GROUP BY DATE_TRUNC('month', "warrantyEnd")
        ORDER BY month ASC
      `,
      ]);

    return { active, expiringSoon, expired, noWarranty, byMonth };
  }
}
