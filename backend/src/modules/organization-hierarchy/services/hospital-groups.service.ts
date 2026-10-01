import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class HospitalGroupsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; code: string }) {
    const group = await this.prisma.hospitalGroup.create({ data });
    await this.prisma.$queryRawUnsafe(
      "UPDATE hospital_groups SET path = text2ltree(replace(lower(name), ' ', '_')) WHERE id = $1",
      group.id,
    );
    return this.prisma.hospitalGroup.findUnique({ where: { id: group.id } });
  }

  async findAll() {
    return this.prisma.hospitalGroup.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.hospitalGroup.findUnique({ where: { id } });
  }

  async update(
    id: string,
    data: Partial<{ name: string; code: string; isActive: boolean }>,
  ) {
    return this.prisma.hospitalGroup.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.hospitalGroup.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
