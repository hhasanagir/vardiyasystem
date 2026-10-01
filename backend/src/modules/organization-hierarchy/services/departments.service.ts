import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class DepartmentsService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    name: string;
    code: string;
    hospitalId?: string;
    directorateId?: string;
  }) {
    const department = await this.prisma.department.create({ data });
    if (data.directorateId) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE departments SET path = text2ltree(dir.path || '.' || replace(lower(departments.code), ' ', '_')) FROM directorates dir WHERE dir.id = departments.directorate_id AND departments.id = $1`,
        department.id,
      );
    } else if (data.hospitalId) {
      await this.prisma.$queryRawUnsafe(
        `UPDATE departments SET path = text2ltree(h.path || '.' || replace(lower(departments.code), ' ', '_')) FROM hospitals h WHERE h.id = departments.hospital_id AND departments.id = $1`,
        department.id,
      );
    } else {
      await this.prisma.$queryRawUnsafe(
        "UPDATE departments SET path = text2ltree(replace(lower(code), ' ', '_')) WHERE id = $1",
        department.id,
      );
    }
    return this.prisma.department.findUnique({ where: { id: department.id } });
  }

  async findAll() {
    return this.prisma.department.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.department.findUnique({
      where: { id },
      include: { hospital: true, directorate: true },
    });
  }

  async update(
    id: string,
    data: Partial<{ name: string; code: string; isActive: boolean }>,
  ) {
    return this.prisma.department.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.department.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
