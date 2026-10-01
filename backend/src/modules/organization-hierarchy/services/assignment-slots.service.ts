import { Injectable } from '@nestjs/common';
import { ShiftType, AssignmentSlotStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class AssignmentSlotsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    roomId?: string;
    deviceId?: string;
    date: string;
    startTime: string;
    endTime: string;
    shiftType: ShiftType;
    status?: AssignmentSlotStatus;
    assignedTo?: string;
    scheduleId?: string;
  }) {
    return this.prisma.assignmentSlot.create({
      data: { ...data, status: data.status ?? AssignmentSlotStatus.available },
    });
  }

  async findAll(query?: { date?: string; status?: string }) {
    return this.prisma.assignmentSlot.findMany({
      where: {
        ...(query?.date && { date: query.date }),
        ...(query?.status && {
          status: query.status.toUpperCase() as AssignmentSlotStatus,
        }),
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  }

  async findOne(id: string) {
    return this.prisma.assignmentSlot.findUnique({
      where: { id },
      include: { room: true, device: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      startTime: string;
      endTime: string;
      shiftType: ShiftType;
      status: AssignmentSlotStatus;
      assignedTo: string;
      scheduleId: string;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.assignmentSlot.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.assignmentSlot.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async findByDate(date: string) {
    return this.prisma.assignmentSlot.findMany({
      where: { date },
      orderBy: { startTime: 'asc' },
    });
  }

  async findByRoom(roomId: string, date: string) {
    return this.prisma.assignmentSlot.findMany({
      where: { roomId, date },
      orderBy: { startTime: 'asc' },
    });
  }

  async findByDevice(deviceId: string, date: string) {
    return this.prisma.assignmentSlot.findMany({
      where: { deviceId, date },
      orderBy: { startTime: 'asc' },
    });
  }
}
