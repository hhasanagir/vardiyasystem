import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { CreateHandoverNoteDto } from './dto/create-handover-note.dto';
import { UpdateHandoverNoteDto } from './dto/update-handover-note.dto';
import { HandoverNoteQueryDto } from './dto/handover-note-query.dto';

@Injectable()
export class HandoverNotesService {
  constructor(
    private prisma: PrismaService,
    private gateway: ScheduleGateway,
  ) {}

  async create(userId: string, dto: CreateHandoverNoteDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true, name: true, organizationId: true },
    });
    if (!unit) throw new NotFoundException('Birim bulunamadı');

    const note = await this.prisma.handoverNote.create({
      data: {
        userId,
        unitId: dto.unitId,
        deviceId: dto.deviceId || null,
        shiftType: dto.shiftType || null,
        title: dto.title,
        content: dto.content,
        priority: dto.priority || 'info',
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    this.gateway
      .broadcastHandoverNote({
        organizationId: note.unit.organizationId || '',
        unitId: note.unitId,
        note: {
          id: note.id,
          title: note.title,
          priority: note.priority,
          authorName: note.user.name,
          unitName: note.unit.name,
          createdAt: note.createdAt.toISOString(),
        },
      })
      .catch(() => {});

    return note;
  }

  async findAll(
    userId: string,
    userUnitId: string | undefined,
    query: HandoverNoteQueryDto,
  ) {
    const where: any = {};

    if (query.unitId) {
      where.unitId = query.unitId;
    } else if (userUnitId) {
      where.unitId = userUnitId;
    }

    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.shiftType) where.shiftType = query.shiftType;
    if (query.status) where.status = query.status;
    if (query.priority) where.priority = query.priority;

    if (query.date) {
      const startDate = new Date(query.date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(query.date);
      endDate.setHours(23, 59, 59, 999);
      where.createdAt = { gte: startDate, lte: endDate };
    }

    const [data, total] = await Promise.all([
      this.prisma.handoverNote.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
          unit: { select: { id: true, name: true } },
          device: { select: { id: true, name: true, code: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.handoverNote.count({ where }),
    ]);

    const dataWithReadStatus = data.map((note) => ({
      ...note,
      isReadByMe: note.readBy.includes(userId),
    }));

    return { data: dataWithReadStatus, total };
  }

  async findOne(id: string, userId: string) {
    const note = await this.prisma.handoverNote.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');

    return { ...note, isReadByMe: note.readBy.includes(userId) };
  }

  async update(id: string, userId: string, dto: UpdateHandoverNoteDto) {
    const note = await this.prisma.handoverNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');
    if (note.userId !== userId)
      throw new ForbiddenException(
        'Yalnızca kendi notlarınızı düzenleyebilirsiniz',
      );

    const updated = await this.prisma.handoverNote.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.content !== undefined && { content: dto.content }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    return { ...updated, isReadByMe: updated.readBy.includes(userId) };
  }

  async markAsRead(id: string, userId: string) {
    const note = await this.prisma.handoverNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');

    if (note.readBy.includes(userId)) {
      return this.findOne(id, userId);
    }

    const updated = await this.prisma.handoverNote.update({
      where: { id },
      data: { readBy: { push: userId } },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    return { ...updated, isReadByMe: true };
  }

  async getUnreadCount(userId: string, userUnitId: string | undefined) {
    const where: any = {
      status: 'active',
      NOT: { readBy: { has: userId } },
    };
    if (userUnitId) where.unitId = userUnitId;

    const count = await this.prisma.handoverNote.count({ where });
    return { count };
  }
}
