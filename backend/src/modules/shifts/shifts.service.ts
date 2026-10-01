import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma, ShiftType, ScheduleStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreateShiftDto } from './dto/create-shift.dto';
import { UpdateShiftDto } from './dto/update-shift.dto';

export interface ShiftResponse {
  id: string;
  name: string;
  type: ShiftType;
  startTime: string;
  endTime: string;
  durationHours: number;
  organizationId: string;
  unitId: string | null;
  deviceId: string | null;
  personnelType: string | null;
  blockId: string | null;
  optionalOnWeekends: boolean;
  optionalOnHolidays: boolean;
  isMaster: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ShiftsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateShiftDto, userId: string): Promise<ShiftResponse> {
    const existing = await this.prisma.shifts.findFirst({
      where: {
        name: dto.name,
        organizationId: dto.organizationId,
        unitId: dto.unitId ?? null,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Bu birimde aynı isimde bir vardiya zaten mevcut',
      );
    }

    const masterCollision = await this.prisma.shifts.findFirst({
      where: {
        isMaster: true,
        deviceId: dto.deviceId ?? null,
        type: dto.type,
        personnelType: dto.personnelType ?? null,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
    if (masterCollision) {
      throw new ConflictException(
        'Bu cihaz için aynı kalıcı (master) vardiya şablonu zaten mevcut',
      );
    }

    const shift = await this.prisma.shifts.create({
      data: {
        name: dto.name,
        type: dto.type,
        startTime: dto.startTime,
        endTime: dto.endTime,
        durationHours: dto.durationHours,
        organizationId: dto.organizationId,
        unitId: dto.unitId ?? null,
        deviceId: dto.deviceId ?? null,
        personnelType: dto.personnelType ?? null,
      },
    });

    return this.toResponse(shift);
  }

  async findAll(
    organizationId: string,
    unitId?: string,
    deviceId?: string,
    personnelType?: string,
  ): Promise<ShiftResponse[]> {
    const where: Prisma.ShiftsWhereInput = { organizationId };
    if (unitId) {
      where.OR = [{ unitId }, { unitId: null }];
    }
    if (deviceId) {
      where.deviceId = deviceId;
    }
    if (personnelType) {
      where.personnelType = personnelType;
    }

    const shifts = await this.prisma.shifts.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    return shifts.map((s) => this.toResponse(s));
  }

  async findOne(id: string, organizationId: string): Promise<ShiftResponse> {
    const shift = await this.prisma.shifts.findFirst({
      where: { id, organizationId },
    });
    if (!shift) {
      throw new NotFoundException('Vardiya bulunamadı');
    }
    return this.toResponse(shift);
  }

  async update(
    id: string,
    dto: UpdateShiftDto,
    userId: string,
  ): Promise<ShiftResponse> {
    const existing = await this.prisma.shifts.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Vardiya bulunamadı');
    }
    if (existing.isMaster) {
      throw new ForbiddenException(
        'Kalıcı (master) vardiya şablonları değiştirilemez. Sadece sistemsel konfigürasyon ile güncellenebilir.',
      );
    }

    if (
      dto.name &&
      (dto.name !== existing.name || dto.unitId !== existing.unitId)
    ) {
      const duplicate = await this.prisma.shifts.findFirst({
        where: {
          name: dto.name,
          organizationId: existing.organizationId,
          unitId: dto.unitId ?? existing.unitId ?? null,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'Bu birimde aynı isimde bir vardiya zaten mevcut',
        );
      }
    }

    const shift = await this.prisma.shifts.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.durationHours !== undefined && {
          durationHours: dto.durationHours,
        }),
        ...(dto.unitId !== undefined && { unitId: dto.unitId ?? null }),
        ...(dto.deviceId !== undefined && { deviceId: dto.deviceId ?? null }),
        ...(dto.personnelType !== undefined && {
          personnelType: dto.personnelType ?? null,
        }),
      },
    });

    return this.toResponse(shift);
  }

  async remove(id: string, organizationId: string): Promise<void> {
    const shift = await this.prisma.shifts.findFirst({
      where: { id, organizationId },
    });
    if (!shift) {
      throw new NotFoundException('Vardiya bulunamadı');
    }
    if (shift.isMaster) {
      throw new ForbiddenException(
        'Kalıcı (master) vardiya şablonları silinemez. Sadece sistemsel konfigürasyon ile pasifleştirilebilir.',
      );
    }

    await this.prisma.shifts.delete({ where: { id } });
  }

  async findLiveShifts(userId: string): Promise<any[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { organizationId: true, unitId: true },
    });
    if (!user?.organizationId) {
      return [];
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const month = today.getMonth() + 1;
    const year = today.getFullYear();

    const unitFilter: any = user.unitId ? { unitId: user.unitId } : {};

    const schedules = await this.prisma.schedule.findMany({
      where: {
        month,
        year,
        status: { in: [ScheduleStatus.published, ScheduleStatus.approved] },
        ...unitFilter,
      },
      select: { id: true, unitId: true },
    });

    if (!schedules.length) return [];

    const scheduleIds = schedules.map((s) => s.id);
    const unitMap = new Map(schedules.map((s) => [s.id, s.unitId]));

    const now = today.getTime();
    const currentHour = today.getHours();
    const currentMinute = today.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;

    const assignments = await this.prisma.assignment.findMany({
      where: { scheduleId: { in: scheduleIds }, date: dateStr },
      include: {
        personnel: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, code: true } },
        schedule: { select: { unitId: true } },
      },
    });

    const unitIds = [...new Set(assignments.map((a) => a.schedule.unitId))];
    const units = await this.prisma.unit.findMany({
      where: { id: { in: unitIds } },
      select: { id: true, name: true },
    });
    const unitNameMap = new Map(units.map((u) => [u.id, u.name]));

    return assignments.map((a) => {
      const [sh, sm] = a.startTime.split(':').map(Number);
      const [eh, em] = a.endTime.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const duration = endMin - startMin || 1;

      let status: 'upcoming' | 'active' | 'completed';
      let progress = 0;

      if (currentTotalMinutes < startMin) {
        status = 'upcoming';
      } else if (currentTotalMinutes >= endMin) {
        status = 'completed';
        progress = 100;
      } else {
        status = 'active';
        progress = Math.round(
          ((currentTotalMinutes - startMin) / duration) * 100,
        );
      }

      const typeLabel =
        a.shiftType === ShiftType.day
          ? 'Gündüz'
          : a.shiftType === ShiftType.night
            ? 'Gece'
            : 'Aktif';

      return {
        id: a.id,
        unit: unitNameMap.get(a.schedule.unitId) || '',
        device: a.device?.name || 'Personel Nöbeti',
        shiftType: typeLabel,
        personnel: { id: a.personnel.id, name: a.personnel.name, fatigue: 0 },
        status,
        startTime: a.startTime,
        endTime: a.endTime,
        progress,
      };
    });
  }

  private toResponse(shift: {
    id: string;
    name: string;
    type: ShiftType;
    startTime: string | null;
    endTime: string | null;
    durationHours: number | null;
    organizationId: string;
    unitId: string | null;
    deviceId: string | null;
    personnelType: string | null;
    blockId: string | null;
    optionalOnWeekends: boolean;
    optionalOnHolidays: boolean;
    isMaster: boolean;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): ShiftResponse {
    return {
      id: shift.id,
      name: shift.name,
      type: shift.type,
      startTime: shift.startTime || '',
      endTime: shift.endTime || '',
      durationHours: shift.durationHours || 0,
      organizationId: shift.organizationId,
      unitId: shift.unitId,
      deviceId: shift.deviceId,
      personnelType: shift.personnelType,
      blockId: shift.blockId,
      optionalOnWeekends: shift.optionalOnWeekends,
      optionalOnHolidays: shift.optionalOnHolidays,
      isMaster: shift.isMaster,
      isActive: shift.isActive,
      createdAt: shift.createdAt,
      updatedAt: shift.updatedAt,
    };
  }
}
