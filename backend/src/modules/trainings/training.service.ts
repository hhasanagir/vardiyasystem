import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { NotificationEventService } from '../notifications/notification-event.service';
import { CreateTrainingDto } from './dto/create-training.dto';
import { UpdateTrainingDto } from './dto/update-training.dto';
import { AssignTrainingDto } from './dto/assign-training.dto';
import { TrainingQueryDto } from './dto/training-query.dto';

@Injectable()
export class TrainingService {
  constructor(
    private prisma: PrismaService,
    private notificationEvents: NotificationEventService,
  ) {}

  async create(dto: CreateTrainingDto) {
    const existing = await this.prisma.training.findFirst({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Bu eğitim zaten mevcut');
    return this.prisma.training.create({ data: dto });
  }

  async findAll(query: TrainingQueryDto) {
    const where: any = { isActive: true };

    if (query.status) {
      where.personnelTrainings = { some: { status: query.status } };
    }
    if (query.category) {
      where.category = query.category;
    }
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { provider: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.personnelId) {
      where.personnelTrainings = {
        ...where.personnelTrainings,
        some: {
          ...(where.personnelTrainings?.some || {}),
          personnelId: query.personnelId,
        },
      };
    }

    return this.prisma.training.findMany({
      where,
      include: {
        _count: { select: { personnelTrainings: true } },
        personnelTrainings: {
          where: { isActive: true },
          include: {
            personnel: {
              select: { id: true, name: true, role: true, employeeNo: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const training = await this.prisma.training.findUnique({
      where: { id },
      include: {
        personnelTrainings: {
          where: { isActive: true },
          include: {
            personnel: {
              select: { id: true, name: true, role: true, employeeNo: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!training) throw new NotFoundException('Eğitim bulunamadı');
    return training;
  }

  async update(id: string, dto: UpdateTrainingDto) {
    const training = await this.prisma.training.findUnique({ where: { id } });
    if (!training) throw new NotFoundException('Eğitim bulunamadı');
    return this.prisma.training.update({ where: { id }, data: dto });
  }

  async delete(id: string) {
    const training = await this.prisma.training.findUnique({ where: { id } });
    if (!training) throw new NotFoundException('Eğitim bulunamadı');
    return this.prisma.training.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async assign(personnelId: string, dto: AssignTrainingDto) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { id: personnelId },
    });
    if (!personnel) throw new NotFoundException('Personel bulunamadı');

    const training = await this.prisma.training.findUnique({
      where: { id: dto.trainingId },
    });
    if (!training) throw new NotFoundException('Eğitim bulunamadı');

    const status = this.computeStatus(dto.expiryDate);

    return this.prisma.personnelTraining.create({
      data: {
        personnelId,
        trainingId: dto.trainingId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        documentUrl: dto.documentUrl,
        status,
      },
      include: {
        training: true,
        personnel: {
          select: { id: true, name: true, role: true, employeeNo: true },
        },
      },
    });
  }

  async getPersonnelTrainings(personnelId: string) {
    return this.prisma.personnelTraining.findMany({
      where: { personnelId, isActive: true },
      include: { training: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateAssignment(id: string, dto: Partial<AssignTrainingDto>) {
    const pt = await this.prisma.personnelTraining.findUnique({
      where: { id },
    });
    if (!pt) throw new NotFoundException('Eğitim kaydı bulunamadı');

    const data: any = {};
    if (dto.issueDate !== undefined) data.issueDate = new Date(dto.issueDate);
    if (dto.expiryDate !== undefined)
      data.expiryDate = new Date(dto.expiryDate);
    if (dto.documentUrl !== undefined) data.documentUrl = dto.documentUrl;
    if (dto.status !== undefined) data.status = dto.status;

    if (data.expiryDate || dto.expiryDate === null) {
      data.status = this.computeStatus(data.expiryDate || null);
    }

    return this.prisma.personnelTraining.update({
      where: { id },
      data,
      include: {
        training: true,
        personnel: { select: { id: true, name: true, role: true } },
      },
    });
  }

  async removeAssignment(id: string) {
    const pt = await this.prisma.personnelTraining.findUnique({
      where: { id },
    });
    if (!pt) throw new NotFoundException('Eğitim kaydı bulunamadı');
    return this.prisma.personnelTraining.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async getExpiringCertifications(daysThreshold = 30) {
    const now = new Date();
    const threshold = new Date(now.getTime() + daysThreshold * 86400000);

    return this.prisma.personnelTraining.findMany({
      where: {
        isActive: true,
        expiryDate: { not: null, lte: threshold },
      },
      include: {
        personnel: {
          select: { id: true, name: true, role: true, employeeNo: true },
        },
        training: true,
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async getRiskSummary() {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);
    const in90Days = new Date(now.getTime() + 90 * 86400000);

    const total = await this.prisma.personnelTraining.count({
      where: { isActive: true },
    });
    const valid = await this.prisma.personnelTraining.count({
      where: { isActive: true, status: 'valid' },
    });
    const expired = await this.prisma.personnelTraining.count({
      where: { isActive: true, expiryDate: { not: null, lt: now } },
    });
    const expiring30 = await this.prisma.personnelTraining.count({
      where: {
        isActive: true,
        expiryDate: { not: null, gte: now, lte: in30Days },
      },
    });
    const expiring90 = await this.prisma.personnelTraining.count({
      where: {
        isActive: true,
        expiryDate: { not: null, gte: now, lte: in90Days },
      },
    });
    const noExpiry = await this.prisma.personnelTraining.count({
      where: { isActive: true, expiryDate: null },
    });

    return {
      total,
      valid,
      expired,
      expiring30,
      expiring90,
      noExpiry,
      riskScore:
        total > 0 ? Math.round(((expired + expiring30) / total) * 100) : 0,
    };
  }

  async checkAndSendExpiryNotifications(organizationId: string) {
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 86400000);
    const in90Days = new Date(now.getTime() + 90 * 86400000);

    const expired = await this.prisma.personnelTraining.findMany({
      where: {
        isActive: true,
        status: { not: 'expired' },
        expiryDate: { not: null, lt: now },
      },
      include: { personnel: true, training: true },
    });

    for (const pt of expired) {
      if (!pt.training) continue;
      await this.prisma.personnelTraining.update({
        where: { id: pt.id },
        data: { status: 'expired' },
      });
    }

    const expiring30 = await this.prisma.personnelTraining.findMany({
      where: {
        isActive: true,
        status: 'valid',
        expiryDate: { not: null, gte: now, lte: in30Days },
      },
      include: { personnel: true, training: true },
    });

    for (const pt of expiring30) {
      if (!pt.training || !pt.expiryDate) continue;
      const daysUntilExpiry = Math.ceil(
        (pt.expiryDate.getTime() - now.getTime()) / 86400000,
      );
      await this.prisma.personnelTraining.update({
        where: { id: pt.id },
        data: { status: 'expiring' },
      });
    }

    const expiring90 = await this.prisma.personnelTraining.findMany({
      where: {
        isActive: true,
        status: 'valid',
        expiryDate: { not: null, gte: in30Days, lte: in90Days },
      },
      include: { personnel: true, training: true },
    });

    for (const pt of expiring90) {
      if (!pt.training || !pt.expiryDate) continue;
      const daysUntilExpiry = Math.ceil(
        (pt.expiryDate.getTime() - now.getTime()) / 86400000,
      );
    }

    return {
      expired: expired.length,
      expiring30: expiring30.length,
      expiring90: expiring90.length,
    };
  }

  private computeStatus(expiryDate: string | null | undefined): string {
    if (!expiryDate) return 'valid';
    const now = new Date();
    const expiry = new Date(expiryDate);
    if (expiry < now) return 'expired';
    const in30Days = new Date(now.getTime() + 30 * 86400000);
    if (expiry <= in30Days) return 'expiring';
    return 'valid';
  }
}
