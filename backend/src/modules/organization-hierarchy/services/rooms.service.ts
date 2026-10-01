import { Injectable } from '@nestjs/common';
import { RoomType } from '@prisma/client';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    code: string;
    areaId: string;
    type?: RoomType;
    capacity?: number;
  }) {
    const room = await this.prisma.room.create({
      data: {
        ...data,
        type: data.type ?? RoomType.patient_exam,
        capacity: data.capacity ?? 1,
      },
    });
    await this.prisma.$queryRawUnsafe(
      `UPDATE rooms SET path = text2ltree(a.path || '.' || replace(lower(rooms.code), ' ', '_')) FROM areas a WHERE a.id = rooms.area_id AND rooms.id = $1`,
      room.id,
    );
    return this.prisma.room.findUnique({ where: { id: room.id } });
  }

  async findAll() {
    return this.prisma.room.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.room.findUnique({
      where: { id },
      include: { area: true, devices: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      code: string;
      type: RoomType;
      capacity: number;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.room.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.room.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
