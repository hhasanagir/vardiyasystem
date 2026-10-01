import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  CreateDutyRosterEntryProps,
  UpdateDutyRosterEntryProps,
  DutyRosterFilterProps,
  DutyRosterEntryProps,
  DutyRosterCalendarProps,
} from './domain/duty-roster.types';
import { ShiftType } from '@prisma/client';

@Injectable()
export class DutyRosterService {
  private readonly logger = new Logger(DutyRosterService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    props: CreateDutyRosterEntryProps,
  ): Promise<DutyRosterEntryProps> {
    const entry = await this.prisma.dutyRoster.create({
      data: {
        organizationId: props.organizationId,
        unitId: props.unitId,
        deviceId: props.deviceId,
        personnelId: props.personnelId,
        date: props.date,
        shiftType: props.shiftType as any,
        role: props.role as any,
        startTime: props.startTime,
        endTime: props.endTime,
        notes: props.notes,
      },
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, code: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });
    return this.toDto(entry);
  }

  async findAll(
    filter: DutyRosterFilterProps,
  ): Promise<DutyRosterEntryProps[]> {
    if (!filter.organizationId) return [];

    const where: Record<string, unknown> = {
      organizationId: filter.organizationId,
      isActive: true,
    };
    if (filter.date) where.date = filter.date;
    if (filter.startDate && filter.endDate)
      where.date = { gte: filter.startDate, lte: filter.endDate } as any;
    if (filter.unitId) where.unitId = filter.unitId;
    if (filter.deviceId) where.deviceId = filter.deviceId;
    if (filter.personnelId) where.personnelId = filter.personnelId;
    if (filter.shiftType) where.shiftType = filter.shiftType;
    if (filter.role) where.role = filter.role;
    if (filter.search) {
      where.OR = [
        {
          personnel: { name: { contains: filter.search, mode: 'insensitive' } },
        },
      ] as any;
    }

    const entries = await this.prisma.dutyRoster.findMany({
      where,
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, code: true } },
        device: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
    return entries.map((e) => this.toDto(e));
  }

  async findById(id: string): Promise<DutyRosterEntryProps> {
    const entry = await this.prisma.dutyRoster.findUnique({
      where: { id },
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, code: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });
    if (!entry) throw new NotFoundException('Duty roster entry not found');
    return this.toDto(entry);
  }

  async update(
    id: string,
    props: UpdateDutyRosterEntryProps,
  ): Promise<DutyRosterEntryProps> {
    await this.findById(id);
    const entry = await this.prisma.dutyRoster.update({
      where: { id },
      data: props,
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, code: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });
    return this.toDto(entry);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.dutyRoster.delete({ where: { id } });
  }

  async softRemove(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.dutyRoster.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getCalendar(
    organizationId: string,
    month: number,
    year: number,
  ): Promise<DutyRosterCalendarProps[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    const entries = await this.findAll({ organizationId, startDate, endDate });

    const grouped = new Map<string, DutyRosterEntryProps[]>();
    for (const entry of entries) {
      const existing = grouped.get(entry.date) || [];
      existing.push(entry);
      grouped.set(entry.date, existing);
    }

    const calendar: DutyRosterCalendarProps[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${startDate.slice(0, 8)}${String(d).padStart(2, '0')}`;
      const dayEntries = grouped.get(dateStr) || [];
      const shiftSummary = { day: 0, evening: 0, night: 0 };
      for (const e of dayEntries) {
        if (e.shiftType === 'day') shiftSummary.day++;
        else if (e.shiftType === 'evening') shiftSummary.evening++;
        else if (e.shiftType === 'night') shiftSummary.night++;
      }
      calendar.push({ date: dateStr, entries: dayEntries, shiftSummary });
    }
    return calendar;
  }

  private toDto(entry: any): DutyRosterEntryProps {
    return {
      id: entry.id as string,
      organizationId: entry.organizationId as string,
      unitId: entry.unitId as string | undefined,
      deviceId: entry.deviceId as string | undefined,
      personnelId: entry.personnelId as string,
      date: entry.date as string,
      shiftType: entry.shiftType as string,
      role: entry.role as string,
      startTime: entry.startTime as string,
      endTime: entry.endTime as string,
      notes: entry.notes as string | undefined,
      isActive: entry.isActive as boolean,
      personnel: entry.personnel as
        | { id: string; name: string; role: string }
        | undefined,
      unit: entry.unit as
        | { id: string; name: string; code: string }
        | undefined,
      device: entry.device as
        | { id: string; name: string; code: string }
        | undefined,
    };
  }
}
