import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class HospitalsService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; code: string; groupId?: string }) {
    const hospital = await this.prisma.hospital.create({ data });
    if (data.groupId) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE hospitals SET path = text2ltree(hg.path || '.' || replace(lower(hospitals.code), ' ', '_')) FROM hospital_groups hg WHERE hg.id = hospitals.group_id AND hospitals.id = $1`,
        hospital.id,
      );
    } else {
      await this.prisma.$queryRawUnsafe(
        "UPDATE hospitals SET path = text2ltree(replace(lower(code), ' ', '_')) WHERE id = $1",
        hospital.id,
      );
    }
    return this.prisma.hospital.findUnique({ where: { id: hospital.id } });
  }

  async findAll() {
    return this.prisma.hospital.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.hospital.findUnique({
      where: { id },
      include: { group: true },
    });
  }

  async update(
    id: string,
    data: Partial<{
      name: string;
      code: string;
      groupId: string;
      isActive: boolean;
    }>,
  ) {
    return this.prisma.hospital.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.hospital.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
