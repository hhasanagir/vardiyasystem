import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { CreateHandoverNoteDto } from './dto/create-handover-note.dto';
import { UpdateHandoverNoteDto } from './dto/update-handover-note.dto';
import { HandoverNoteQueryDto } from './dto/handover-note-query.dto';

interface HandoverScopeUser {
  id: string;
  role?: string | null;
  unitId?: string | null;
  organizationId?: string | null;
  rbacRoles?: Array<{ roleName: string; unitId: string | null; organizationId: string | null }>;
}

@Injectable()
export class HandoverNotesService {
  constructor(
    private prisma: PrismaService,
    private gateway: ScheduleGateway,
    private unitScopeService: UnitScopeService,
  ) {}

  async create(user: HandoverScopeUser, dto: CreateHandoverNoteDto) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true, name: true, organizationId: true },
    });
    if (!unit) throw new NotFoundException('Birim bulunamadı');

    const allowed = await this.unitScopeService.canAccessUnit(user, unit.id, unit.organizationId);
    if (!allowed) throw new ForbiddenException('Bu birime erişim yetkiniz yok');

    const note = await this.prisma.handoverNote.create({
      data: {
        userId: user.id,
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

    this.gateway.broadcastHandoverNote({
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
    }).catch(() => {});

    return note;
  }

  async findAll(user: HandoverScopeUser, query: HandoverNoteQueryDto) {
    const where: any = {};

    if (query.unitId) {
      const target = await this.prisma.unit.findUnique({
        where: { id: query.unitId },
        select: { id: true, organizationId: true },
      });
      const allowed = target
        ? await this.unitScopeService.canAccessUnit(user, target.id, target.organizationId)
        : false;
      if (!allowed) throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      where.unitId = query.unitId;
    } else {
      const scope = await this.unitScopeService.resolveReadScope(user);
      if (scope.denyAll) {
        throw new ForbiddenException('Bu birime erişim yetkiniz yok');
      }
      if (scope.unitId) {
        where.unitId = scope.unitId;
      } else if (scope.organizationId) {
        const orgUnits = await this.prisma.unit.findMany({
          where: { organizationId: scope.organizationId },
          select: { id: true },
        });
        where.unitId = { in: orgUnits.map((u) => u.id) };
      }
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

    const dataWithReadStatus = data.map(note => ({
      ...note,
      isReadByMe: note.readBy.includes(user.id),
    }));

    return { data: dataWithReadStatus, total };
  }

  async findOne(id: string, user: HandoverScopeUser) {
    const note = await this.prisma.handoverNote.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');

    const allowed = await this.unitScopeService.canAccessUnit(user, note.unitId, note.unit?.organizationId ?? null);
    if (!allowed) throw new ForbiddenException('Bu birime erişim yetkiniz yok');

    return { ...note, isReadByMe: note.readBy.includes(user.id) };
  }

  async update(id: string, user: HandoverScopeUser, dto: UpdateHandoverNoteDto) {
    const note = await this.prisma.handoverNote.findUnique({ where: { id } });
    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');
    if (note.userId !== user.id) throw new ForbiddenException('Yalnızca kendi notlarınızı düzenleyebilirsiniz');

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

    return { ...updated, isReadByMe: updated.readBy.includes(user.id) };
  }

  async markAsRead(id: string, user: HandoverScopeUser) {
    const note = await this.prisma.handoverNote.findUnique({
      where: { id },
      include: { unit: { select: { id: true, organizationId: true } } },
    });
    if (!note) throw new NotFoundException('Devir teslim notu bulunamadı');

    const allowed = await this.unitScopeService.canAccessUnit(user, note.unitId, note.unit?.organizationId ?? null);
    if (!allowed) throw new ForbiddenException('Bu birime erişim yetkiniz yok');

    if (note.readBy.includes(user.id)) {
      return this.findOne(id, user);
    }

    const updated = await this.prisma.handoverNote.update({
      where: { id },
      data: { readBy: { push: user.id } },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    return { ...updated, isReadByMe: true };
  }

  async getUnreadCount(user: HandoverScopeUser) {
    const scope = await this.unitScopeService.resolveReadScope(user);
    if (scope.denyAll) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }

    const where: any = {
      status: 'active',
      NOT: { readBy: { has: user.id } },
    };
    if (scope.unitId) {
      where.unitId = scope.unitId;
    } else if (scope.organizationId) {
      const orgUnits = await this.prisma.unit.findMany({
        where: { organizationId: scope.organizationId },
        select: { id: true },
      });
      where.unitId = { in: orgUnits.map((u) => u.id) };
    }

    const count = await this.prisma.handoverNote.count({ where });
    return { count };
  }
}