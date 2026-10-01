import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class ProcessingActivityService {
  private readonly logger = new Logger(ProcessingActivityService.name);

  constructor(private prisma: PrismaService) {}

  async create(data: {
    activityId: string;
    controller: string;
    processor?: string;
    purpose: string;
    dataCategories: string[];
    dataSubjects: string[];
    legalBasis: string;
    retentionPeriod: string;
    securityMeasures: string[];
    crossBorderTransfer?: string;
    dpiaRequired?: boolean;
  }) {
    return this.prisma.processingActivity.create({ data: data as any });
  }

  async update(
    id: string,
    data: Partial<{
      controller: string;
      processor: string;
      purpose: string;
      dataCategories: string[];
      dataSubjects: string[];
      legalBasis: string;
      retentionPeriod: string;
      securityMeasures: string[];
      crossBorderTransfer: string;
      dpiaRequired: boolean;
      dpiaCompleted: boolean;
      isActive: boolean;
    }>,
  ) {
    const existing = await this.prisma.processingActivity.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Processing activity not found');
    return this.prisma.processingActivity.update({
      where: { id },
      data: data as any,
    });
  }

  async findAll(activeOnly = true) {
    const where = activeOnly ? { isActive: true } : {};
    return this.prisma.processingActivity.findMany({
      where,
      orderBy: { purpose: 'asc' },
    });
  }

  async findById(id: string) {
    const activity = await this.prisma.processingActivity.findUnique({
      where: { id },
    });
    if (!activity) throw new NotFoundException('Processing activity not found');
    return activity;
  }

  async getRegister() {
    const activities = await this.prisma.processingActivity.findMany({
      where: { isActive: true },
      orderBy: { activityId: 'asc' },
    });

    return {
      controller: 'VardiyaOS',
      lastUpdated: new Date().toISOString(),
      totalActivities: activities.length,
      activities: activities.map((a) => ({
        id: a.activityId,
        purpose: a.purpose,
        dataCategories: a.dataCategories,
        dataSubjects: a.dataSubjects,
        legalBasis: a.legalBasis,
        retentionPeriod: a.retentionPeriod,
        dpiaStatus: a.dpiaRequired
          ? a.dpiaCompleted
            ? 'COMPLETED'
            : 'REQUIRED'
          : 'NOT_REQUIRED',
        crossBorderTransfer: a.crossBorderTransfer || 'None',
      })),
    };
  }

  async conductDpia(
    activityId: string,
    data: {
      assessor: string;
      risks: Record<string, unknown>;
      mitigations: Record<string, unknown>;
      residualRisk: string;
    },
  ) {
    const activity = await this.prisma.processingActivity.findUnique({
      where: { id: activityId },
    });
    if (!activity) throw new NotFoundException('Processing activity not found');

    const dpia = await this.prisma.dataProtectionImpactAssessment.create({
      data: {
        activityId,
        assessor: data.assessor,
        risks: data.risks as any,
        mitigations: data.mitigations as any,
        residualRisk: data.residualRisk,
      } as any,
    });

    await this.prisma.processingActivity.update({
      where: { id: activityId },
      data: { dpiaRequired: true, dpiaCompleted: false },
    });

    return dpia;
  }

  async approveDpia(dpiaId: string, approvedBy: string) {
    const dpia = await this.prisma.dataProtectionImpactAssessment.update({
      where: { id: dpiaId },
      data: {
        approvedBy,
        approvedAt: new Date(),
        status: 'APPROVED',
      },
    });

    await this.prisma.processingActivity.update({
      where: { id: dpia.activityId },
      data: { dpiaCompleted: true },
    });

    return dpia;
  }

  async getDpias(status?: string) {
    const where: any = {};
    if (status) where.status = status;
    return this.prisma.dataProtectionImpactAssessment.findMany({
      where,
      include: { activity: true },
      orderBy: { assessmentDate: 'desc' },
    });
  }

  async getStatistics() {
    const activities = await this.prisma.processingActivity.findMany();
    const dpias = await this.prisma.dataProtectionImpactAssessment.findMany();

    return {
      totalProcessingActivities: activities.length,
      activeActivities: activities.filter((a) => a.isActive).length,
      dpiaRequired: activities.filter((a) => a.dpiaRequired).length,
      dpiaCompleted: activities.filter((a) => a.dpiaCompleted).length,
      dpiaPending: activities.filter((a) => a.dpiaRequired && !a.dpiaCompleted)
        .length,
      crossBorderTransfers: activities.filter(
        (a) => a.crossBorderTransfer && a.crossBorderTransfer !== 'None',
      ).length,
      byLegalBasis: this.groupBy(activities, 'legalBasis'),
      byPurpose: this.groupBy(activities, 'purpose'),
      dpiasByStatus: this.groupBy(dpias, 'status'),
    };
  }

  private groupBy(items: any[], key: string): Record<string, number> {
    const result: Record<string, number> = {};
    for (const item of items) {
      const val = item[key];
      result[val] = (result[val] || 0) + 1;
    }
    return result;
  }
}
