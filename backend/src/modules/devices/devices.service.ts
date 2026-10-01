import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, UnitType } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { UnitsService } from '../units/units.service';

export interface DeviceResponse {
  id: string;
  code: string;
  name: string;
  mode: string;
  isActive: boolean;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
  unit: string;
}

@Injectable()
export class DevicesService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  async findAll(params?: {
    unit?: string;
    isActive?: boolean;
  }): Promise<{ devices: DeviceResponse[]; total: number }> {
    const where: Prisma.DeviceWhereInput = {};

    if (params?.unit) {
      const unit = await this.prisma.unit.findFirst({
        where: { type: params.unit as UnitType },
      });
      if (unit) {
        where.unitId = unit.id;
      }
    }

    if (params?.isActive !== undefined) {
      where.isActive = params.isActive;
    }

    const devices = await this.prisma.device.findMany({
      where,
      orderBy: { code: 'asc' },
    });

    return {
      devices: devices.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        mode: d.mode,
        isActive: d.isActive,
        requiredSkills: d.requiredSkills,
        workDays: d.workDays,
        startHour: d.startHour,
        endHour: d.endHour,
        unit: d.unitId,
      })),
      total: devices.length,
    };
  }

  async findByUnitCode(
    unitCode: string,
  ): Promise<{ devices: DeviceResponse[]; total: number }> {
    const unit = await this.prisma.unit.findFirst({
      where: { type: unitCode as UnitType },
    });

    if (!unit) {
      throw new NotFoundException(`Birim bulunamadı: ${unitCode}`);
    }

    const devices = await this.unitsService.getDevices(unit.id);

    return {
      devices: devices.map((d) => ({
        id: d.id,
        code: d.code,
        name: d.name,
        mode: d.mode,
        isActive: d.isActive,
        requiredSkills: d.requiredSkills,
        workDays: d.workDays,
        startHour: d.startHour,
        endHour: d.endHour,
        unit: unitCode,
      })),
      total: devices.length,
    };
  }
}
