import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma.service';

@Injectable()
export class DirectoratesService {
  constructor(private prisma: PrismaService) {}

  async create(data: { name: string; code: string; hospitalId: string }) {
    const directorate = await this.prisma.directorate.create({ data });
    await this.prisma.$queryRawUnsafe(
      `UPDATE directorates SET path = text2ltree(h.path || '.' || replace(lower(directorates.code), ' ', '_')) FROM hospitals h WHERE h.id = directorates.hospital_id AND directorates.id = $1`,
      directorate.id,
    );
    return this.prisma.directorate.findUnique({
      where: { id: directorate.id },
    });
  }

  async findAll() {
    return this.prisma.directorate.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    return this.prisma.directorate.findUnique({
      where: { id },
      include: { hospital: true },
    });
  }

  async update(
    id: string,
    data: Partial<{ name: string; code: string; isActive: boolean }>,
  ) {
    return this.prisma.directorate.update({ where: { id }, data });
  }

  async remove(id: string) {
    return this.prisma.directorate.update({
      where: { id },
      data: { isActive: false },
    });
  }
}
