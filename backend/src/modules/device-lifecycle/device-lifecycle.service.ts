import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { UnitScopeService } from '../rbac/services/unit-scope.service';

@Injectable()
export class DeviceLifecycleService {
  constructor(
    private prisma: PrismaService,
    private unitScopeService: UnitScopeService,
  ) {}

  private async assertAssetAccess(
    assetId: string,
    user: any,
  ) {
    const asset = await this.prisma.enterpriseAsset.findUnique({
      where: { id: assetId },
      select: { id: true, unitId: true, organizationId: true },
    });
    if (!asset) throw new NotFoundException('Varlık bulunamadı');
    const allowed = await this.unitScopeService.canAccessUnit(user, asset.unitId, asset.organizationId);
    if (!allowed) throw new ForbiddenException('Bu varlığa erişim yetkiniz yok');
    return asset;
  }

  async findAll(assetId?: string, eventType?: string, user?: any) {
    const where: Prisma.DeviceLifecycleEventWhereInput = {};
    if (assetId) where.assetId = assetId;
    if (eventType) where.eventType = eventType as any;

    if (user) {
      const scope = await this.unitScopeService.resolveScope(user);
      if (!scope.strictUnitId && !scope.organizationId) {
        throw new ForbiddenException('Varlık bulma işlemi için kuruluş atanmamış');
      }
      if (scope.strictUnitId) {
        where.asset = { ...(where.asset as any ?? {}), unitId: scope.strictUnitId };
      }
      if (scope.organizationId) {
        where.asset = { ...(where.asset as any ?? {}), organizationId: scope.organizationId };
      }
    }

    return this.prisma.deviceLifecycleEvent.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { eventDate: 'desc' },
    });
  }

  async findById(id: string, user?: any) {
    const event = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true, unitId: true, organizationId: true } },
      },
    });
    if (!event) throw new NotFoundException('Lifecycle event not found');
    if (user) {
      if (!event.asset) throw new NotFoundException('Varlık bulunamadı');
      const allowed = await this.unitScopeService.canAccessUnit(user, event.asset.unitId, event.asset.organizationId);
      if (!allowed) throw new ForbiddenException('Bu varlığa erişim yetkiniz yok');
    }
    return event;
  }

  async create(data: {
    assetId: string;
    eventType: string;
    eventDate: Date | string;
    title: string;
    completedDate?: Date | string;
    description?: string;
    performedById?: string;
    referenceNumber?: string;
    referenceType?: string;
    locationFrom?: string;
    locationTo?: string;
    documents?: string;
    notes?: string;
  }, user?: any) {
    if (user) {
      await this.assertAssetAccess(data.assetId, user);
    }
    return this.prisma.deviceLifecycleEvent.create({
      data: {
        assetId: data.assetId,
        eventType: data.eventType as any,
        eventDate: new Date(data.eventDate),
        title: data.title,
        completedDate: data.completedDate ? new Date(data.completedDate) : undefined,
        description: data.description,
        performedById: data.performedById,
        referenceNumber: data.referenceNumber,
        referenceType: data.referenceType,
        locationFrom: data.locationFrom,
        locationTo: data.locationTo,
        documents: data.documents,
        notes: data.notes,
      },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async update(id: string, data: Prisma.DeviceLifecycleEventUncheckedUpdateInput, user?: any) {
    const existing = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Lifecycle event not found');
    if (user) {
      if (!existing.asset) throw new NotFoundException('Varlık bulunamadı');
      const allowed = await this.unitScopeService.canAccessUnit(user, existing.asset.unitId, existing.asset.organizationId);
      if (!allowed) throw new ForbiddenException('Bu varlığa erişim yetkiniz yok');
    }

    return this.prisma.deviceLifecycleEvent.update({
      where: { id },
      data,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async remove(id: string, user?: any) {
    const existing = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
      include: { asset: { select: { unitId: true, organizationId: true } } },
    });
    if (!existing) throw new NotFoundException('Lifecycle event not found');
    if (user) {
      if (!existing.asset) throw new NotFoundException('Varlık bulunamadı');
      const allowed = await this.unitScopeService.canAccessUnit(user, existing.asset.unitId, existing.asset.organizationId);
      if (!allowed) throw new ForbiddenException('Bu varlığa erişim yetkiniz yok');
    }

    await this.prisma.deviceLifecycleEvent.delete({ where: { id } });
    return { success: true };
  }

  async getByAsset(assetId: string, user?: any) {
    if (user) {
      await this.assertAssetAccess(assetId, user);
    }
    return this.prisma.deviceLifecycleEvent.findMany({
      where: { assetId },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { eventDate: 'desc' },
    });
  }
}
