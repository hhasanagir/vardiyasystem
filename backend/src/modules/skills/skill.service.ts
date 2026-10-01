import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateSkillDto } from './dto/create-skill.dto';
import { AssignSkillDto } from './dto/assign-skill.dto';

@Injectable()
export class SkillService {
  constructor(private prisma: PrismaService) {}

  async createSkill(dto: CreateSkillDto) {
    const existing = await this.prisma.skill.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Bu yetkinlik zaten mevcut');
    return this.prisma.skill.create({ data: dto });
  }

  async getAllSkills() {
    return this.prisma.skill.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { personnelSkills: true } } },
    });
  }

  async getSkill(id: string) {
    const skill = await this.prisma.skill.findUnique({ where: { id } });
    if (!skill) throw new NotFoundException('Yetkinlik bulunamadı');
    return skill;
  }

  async deleteSkill(id: string) {
    const skill = await this.getSkill(id);
    return this.prisma.skill.delete({ where: { id } });
  }

  async assignSkill(personnelId: string, dto: AssignSkillDto) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { id: personnelId },
    });
    if (!personnel) throw new NotFoundException('Personel bulunamadı');

    const skill = await this.prisma.skill.findUnique({
      where: { id: dto.skillId },
    });
    if (!skill) throw new NotFoundException('Yetkinlik bulunamadı');

    const existing = await this.prisma.personnelSkill.findUnique({
      where: { personnelId_skillId: { personnelId, skillId: dto.skillId } },
    });
    if (existing)
      throw new ConflictException('Bu personel zaten bu yetkinliğe sahip');

    return this.prisma.personnelSkill.create({
      data: {
        personnelId,
        skillId: dto.skillId,
        certificationLevel: dto.certificationLevel || 'certified',
        certifiedAt: dto.certifiedAt ? new Date(dto.certifiedAt) : null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: { skill: true },
    });
  }

  async updatePersonnelSkill(id: string, dto: Partial<AssignSkillDto>) {
    const record = await this.prisma.personnelSkill.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Personel yetkinliği bulunamadı');

    return this.prisma.personnelSkill.update({
      where: { id },
      data: {
        ...(dto.certificationLevel && {
          certificationLevel: dto.certificationLevel,
        }),
        ...(dto.certifiedAt !== undefined && {
          certifiedAt: dto.certifiedAt ? new Date(dto.certifiedAt) : null,
        }),
        ...(dto.expiresAt !== undefined && {
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
        }),
      },
      include: { skill: true },
    });
  }

  async removePersonnelSkill(id: string) {
    const record = await this.prisma.personnelSkill.findUnique({
      where: { id },
    });
    if (!record) throw new NotFoundException('Personel yetkinliği bulunamadı');
    return this.prisma.personnelSkill.delete({ where: { id } });
  }

  async getPersonnelSkills(personnelId: string) {
    return this.prisma.personnelSkill.findMany({
      where: { personnelId },
      include: { skill: true },
      orderBy: { skill: { name: 'asc' } },
    });
  }

  async getAllPersonnelSkills(params?: { unitId?: string }) {
    const where: any = {};
    if (params?.unitId) where.personnel = { unitId: params.unitId };

    const records = await this.prisma.personnelSkill.findMany({
      where,
      include: {
        personnel: {
          select: { id: true, name: true, role: true, unitId: true },
        },
        skill: true,
      },
      orderBy: [{ personnel: { name: 'asc' } }, { skill: { name: 'asc' } }],
    });
    return records;
  }

  async getSkillMatrix(params?: { unitId?: string }) {
    const personnelWhere: any = { isActive: true };
    if (params?.unitId) personnelWhere.unitId = params.unitId;

    const [personnel, skills, assignments] = await Promise.all([
      this.prisma.personnel.findMany({
        where: personnelWhere,
        select: { id: true, name: true, role: true, unitId: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.skill.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.personnelSkill.findMany({
        where: { personnel: personnelWhere },
        select: {
          id: true,
          personnelId: true,
          skillId: true,
          certificationLevel: true,
          expiresAt: true,
          certifiedAt: true,
          isActive: true,
        },
      }),
    ]);

    return { personnel, skills, assignments };
  }

  async getExpiringCertifications(daysThreshold = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 86400000);

    return this.prisma.personnelSkill.findMany({
      where: {
        isActive: true,
        expiresAt: { not: null, lte: threshold, gte: now },
      },
      include: {
        personnel: { select: { id: true, name: true, role: true } },
        skill: true,
      },
      orderBy: { expiresAt: 'asc' },
    });
  }

  async validateAssignments(scheduleId: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        assignments: {
          include: {
            personnel: {
              select: {
                id: true,
                name: true,
                skills: true,
                deviceSkills: true,
              },
            },
            device: { select: { id: true, name: true, requiredSkills: true } },
          },
        },
      },
    });
    if (!schedule) throw new NotFoundException('Program bulunamadı');

    const errors: Array<{
      assignmentId: string;
      personnelName: string;
      deviceName: string;
      missingSkills: string[];
    }> = [];

    for (const assignment of schedule.assignments) {
      const requiredSkills = assignment.device?.requiredSkills;
      if (
        !requiredSkills ||
        !Array.isArray(requiredSkills) ||
        requiredSkills.length === 0
      )
        continue;
      if (!assignment.personnel) continue;

      const personnelSkills = await this.prisma.personnelSkill.findMany({
        where: {
          personnelId: assignment.personnel.id,
          isActive: true,
          expiresAt: { gte: new Date() },
        },
        include: { skill: true },
      });

      const activeSkillNames = new Set(
        personnelSkills.filter((ps) => ps.skill).map((ps) => ps.skill.name),
      );

      const personnelFields = assignment.personnel.skills || [];
      const personnelDeviceFields = assignment.personnel.deviceSkills || [];

      const hasFromPersonnelField = requiredSkills.some(
        (s) => personnelFields.includes(s) || personnelDeviceFields.includes(s),
      );
      const hasFromStructured = requiredSkills.every((s) =>
        activeSkillNames.has(s),
      );

      if (!hasFromPersonnelField && !hasFromStructured) {
        errors.push({
          assignmentId: assignment.id,
          personnelName: assignment.personnel?.name || 'Unknown',
          deviceName: assignment.device?.name || 'Unknown',
          missingSkills: requiredSkills.filter(
            (s) =>
              !activeSkillNames.has(s) &&
              !personnelFields.includes(s) &&
              !personnelDeviceFields.includes(s),
          ),
        });
      }
    }

    return { valid: errors.length === 0, errors };
  }
}
