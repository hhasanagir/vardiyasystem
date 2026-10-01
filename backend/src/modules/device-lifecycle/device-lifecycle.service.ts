import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DeviceLifecycleService {
  constructor(private prisma: PrismaService) {}

  async findAll(assetId?: string, eventType?: string) {
    const where: Prisma.DeviceLifecycleEventWhereInput = {};
    if (assetId) where.assetId = assetId;
    if (eventType) where.eventType = eventType as any;

    return this.prisma.deviceLifecycleEvent.findMany({
      where,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { eventDate: 'desc' },
    });
  }

  async findById(id: string) {
    const event = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
    if (!event) throw new NotFoundException('Lifecycle event not found');
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
  }) {
    return this.prisma.deviceLifecycleEvent.create({
      data: {
        assetId: data.assetId,
        eventType: data.eventType as any,
        eventDate: new Date(data.eventDate),
        title: data.title,
        completedDate: data.completedDate
          ? new Date(data.completedDate)
          : undefined,
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

  async update(
    id: string,
    data: Prisma.DeviceLifecycleEventUncheckedUpdateInput,
  ) {
    const existing = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Lifecycle event not found');

    return this.prisma.deviceLifecycleEvent.update({
      where: { id },
      data,
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.deviceLifecycleEvent.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Lifecycle event not found');

    await this.prisma.deviceLifecycleEvent.delete({ where: { id } });
    return { success: true };
  }

  async getByAsset(assetId: string) {
    return this.prisma.deviceLifecycleEvent.findMany({
      where: { assetId },
      include: {
        asset: { select: { id: true, name: true, assetNumber: true } },
      },
      orderBy: { eventDate: 'desc' },
    });
  }
}
