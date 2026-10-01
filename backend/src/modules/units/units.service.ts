import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class UnitsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filters?: { organizationId?: string; type?: string }) {
    return this.prisma.unit.findMany({
      where: {
        ...(filters?.organizationId && {
          organizationId: filters.organizationId,
        }),
        ...(filters?.type && { type: filters.type as UnitType }),
      },
      include: {
        _count: {
          select: { devices: true, personnel: true },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const unit = await this.prisma.unit.findUnique({
      where: { id },
      include: {
        devices: {
          where: { isActive: true },
        },
        personnel: {
          where: { isActive: true },
        },
        organization: true,
      },
    });

    if (!unit) {
      throw new NotFoundException('Unit not found');
    }

    return unit;
  }

  async getDevices(unitId: string, includeInactive = false) {
    const where: Prisma.DeviceWhereInput = { unitId };
    if (!includeInactive) where.isActive = true;
    return this.prisma.device.findMany({
      where,
      orderBy: { code: 'asc' },
    });
  }

  async create(data: {
    name: string;
    code: string;
    type: string;
    organizationId?: string;
  }) {
    return this.prisma.unit.create({
      data: {
        name: data.name,
        code: data.code,
        type: data.type as UnitType,
        organizationId: data.organizationId,
      },
    });
  }

  async update(id: string, data: Partial<{ name: string; isActive: boolean }>) {
    return this.prisma.unit.update({
      where: { id },
      data,
    });
  }
}
