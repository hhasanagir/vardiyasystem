import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { CreatePersonnelGroupDto } from './dto/create-personnel-group.dto';
import { UpdatePersonnelGroupDto } from './dto/update-personnel-group.dto';
import { CreateShiftTemplateDto } from './dto/create-shift-template.dto';
import { UpdateShiftTemplateDto } from './dto/update-shift-template.dto';

@Injectable()
export class PersonnelGroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId?: string, unitId?: string) {
    const where: Prisma.PersonnelGroupWhereInput = { isActive: true };
    if (organizationId) where.organizationId = organizationId;
    if (unitId) where.unitId = unitId;

    const groups = await this.prisma.personnelGroup.findMany({
      where,
      include: {
        shiftTemplates: {
          where: { isActive: true },
          orderBy: [{ startTime: 'asc' }, { shiftType: 'asc' }],
        },
        _count: { select: { personnel: true } },
        unit: { select: { id: true, name: true, type: true } },
      },
      orderBy: { name: 'asc' },
    });

    return groups.map((g) => this.toResponse(g));
  }

  async findOne(id: string) {
    const group = await this.prisma.personnelGroup.findUnique({
      where: { id },
      include: {
        shiftTemplates: {
          orderBy: [{ startTime: 'asc' }, { shiftType: 'asc' }],
        },
        personnel: {
          select: { id: true, name: true, role: true, isActive: true },
          orderBy: { name: 'asc' },
        },
        unit: { select: { id: true, name: true, type: true } },
      },
    });
    if (!group) {
      throw new NotFoundException('Personel grubu bulunamadı');
    }
    return this.toResponse(group);
  }

  async create(
    dto: CreatePersonnelGroupDto,
    organizationId?: string,
    userId?: string,
  ) {
    const existing = await this.prisma.personnelGroup.findFirst({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException('Bu kod ile bir personel grubu zaten mevcut');
    }

    if (dto.unitId) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: dto.unitId },
      });
      if (!unit) {
        throw new BadRequestException('Seçilen birim bulunamadı');
      }
    }

    const group = await this.prisma.personnelGroup.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        unitId: dto.unitId ?? null,
        organizationId: dto.organizationId ?? organizationId ?? null,
        isActive: dto.isActive ?? true,
      },
      include: {
        shiftTemplates: true,
        _count: { select: { personnel: true } },
        unit: { select: { id: true, name: true, type: true } },
      },
    });

    return this.toResponse(group);
  }

  async update(id: string, dto: UpdatePersonnelGroupDto) {
    const existing = await this.prisma.personnelGroup.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Personel grubu bulunamadı');
    }

    if (dto.code && dto.code !== existing.code) {
      const duplicate = await this.prisma.personnelGroup.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (duplicate) {
        throw new ConflictException(
          'Bu kod ile bir personel grubu zaten mevcut',
        );
      }
    }

    const group = await this.prisma.personnelGroup.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.unitId !== undefined && { unitId: dto.unitId ?? null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      include: {
        shiftTemplates: true,
        _count: { select: { personnel: true } },
        unit: { select: { id: true, name: true, type: true } },
      },
    });

    return this.toResponse(group);
  }

  async remove(id: string) {
    const existing = await this.prisma.personnelGroup.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Personel grubu bulunamadı');
    }

    // Soft-deactivate to preserve assignment history
    await this.prisma.personnelGroup.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true, id };
  }

  async createTemplate(
    groupId: string,
    dto: CreateShiftTemplateDto,
    organizationId?: string,
  ) {
    const group = await this.prisma.personnelGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Personel grubu bulunamadı');
    }

    const existing = await this.prisma.personShiftTemplate.findFirst({
      where: {
        personnelGroupId: groupId,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
      },
    });
    if (existing) {
      throw new ConflictException(
        'Bu grup için aynı saat aralığında bu vardiya şablonu zaten mevcut',
      );
    }

    const template = await this.prisma.personShiftTemplate.create({
      data: {
        organizationId: organizationId ?? group.organizationId ?? null,
        unitId: group.unitId!,
        personnelGroupId: groupId,
        name: dto.name,
        shiftType: dto.shiftType,
        startTime: dto.startTime,
        endTime: dto.endTime,
        isActive: dto.isActive ?? true,
      },
    });

    return template;
  }

  async findTemplates(groupId: string) {
    const group = await this.prisma.personnelGroup.findUnique({
      where: { id: groupId },
    });
    if (!group) {
      throw new NotFoundException('Personel grubu bulunamadı');
    }
    return this.prisma.personShiftTemplate.findMany({
      where: { personnelGroupId: groupId },
      orderBy: [{ startTime: 'asc' }, { shiftType: 'asc' }],
    });
  }

  async updateTemplate(templateId: string, dto: UpdateShiftTemplateDto) {
    const template = await this.prisma.personShiftTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Vardiya şablonu bulunamadı');
    }

    const updated = await this.prisma.personShiftTemplate.update({
      where: { id: templateId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.shiftType !== undefined && { shiftType: dto.shiftType }),
        ...(dto.startTime !== undefined && { startTime: dto.startTime }),
        ...(dto.endTime !== undefined && { endTime: dto.endTime }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });

    return updated;
  }

  async removeTemplate(templateId: string) {
    const template = await this.prisma.personShiftTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new NotFoundException('Vardiya şablonu bulunamadı');
    }

    // Soft-deactivate to preserve assignment history
    await this.prisma.personShiftTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });
    return { success: true, id: templateId };
  }

  private toResponse(group: any) {
    return {
      id: group.id,
      code: group.code,
      name: group.name,
      description: group.description,
      unitId: group.unitId,
      unit: group.unit ?? undefined,
      organizationId: group.organizationId,
      isActive: group.isActive,
      personnelCount: group._count?.personnel ?? 0,
      templates: (group.shiftTemplates || []).map((t: any) => ({
        id: t.id,
        name: t.name,
        shiftType: t.shiftType,
        startTime: t.startTime,
        endTime: t.endTime,
        isActive: t.isActive,
      })),
      personnel: group.personnel ?? undefined,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
