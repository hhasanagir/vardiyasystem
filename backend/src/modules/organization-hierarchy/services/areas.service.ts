import { Injectable } from '@nestjs/common';
import { AreaType } from '@prisma/client';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class AreasService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    code: string;
    unitId: string;
    type?: AreaType;
  }) {
    const area = await this.prisma.area.create({
      data: { ...data, type: data.type ?? AreaType.scanning },
    });
    await this.prisma.$queryRawUnsafe(
      `UPDATE areas SET path = text2ltree(u.path || '.' || replace(lower(areas.code), ' ', '_')) FROM units u WHERE u.id = areas.unit_id AND areas.id = $1`,
      area.id,
    );
    return this.prisma.area.findUnique({ where: { id: area.id } });
  }

  async findAll() {
    return this.prisma.area.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.area.findUnique({
      where: { id },
      include: { unit: true, rooms: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      code: string;
      type: AreaType;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.area.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.area.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
