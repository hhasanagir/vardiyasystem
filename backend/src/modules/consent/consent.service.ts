import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ConsentStatus } from '@prisma/client';

@Injectable()
export class ConsentService {
  constructor(private prisma: PrismaService) {}

  async getTemplates(activeOnly = true) {
    const where = activeOnly ? { isActive: true } : {};
    return this.prisma.consentTemplate.findMany({
      where,
      orderBy: { purpose: 'asc' },
    });
  }

  async getTemplate(id: string) {
    const template = await this.prisma.consentTemplate.findUnique({
      where: { id },
    });
    if (!template) throw new NotFoundException('Consent template not found');
    return template;
  }

  async createTemplate(data: {
    purpose: string;
    version: number;
    title: string;
    description: string;
    requiredText: string;
  }) {
    return this.prisma.consentTemplate.create({ data: data as any });
  }

  async getUserConsents(userId: string) {
    return this.prisma.consentRecord.findMany({
      where: { userId },
      include: { template: true },
      orderBy: { givenAt: 'desc' },
    });
  }

  async giveConsent(
    userId: string,
    templateId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const template = await this.prisma.consentTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) throw new NotFoundException('Consent template not found');
    if (!template.isActive)
      throw new BadRequestException('Consent template is no longer active');

    const existing = await this.prisma.consentRecord.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });

    if (existing && existing.status === 'GIVEN') {
      return existing;
    }

    return this.prisma.consentRecord.upsert({
      where: { userId_templateId: { userId, templateId } },
      create: {
        userId,
        templateId,
        status: 'GIVEN' as ConsentStatus,
        consentVersion: `v${template.version}`,
        ipAddress,
        userAgent,
        expiresAt: template.validUntil,
      },
      update: {
        status: 'GIVEN' as ConsentStatus,
        consentVersion: `v${template.version}`,
        givenAt: new Date(),
        withdrawnAt: null,
        ipAddress,
        userAgent,
        expiresAt: template.validUntil,
      },
    });
  }

  async withdrawConsent(userId: string, templateId: string) {
    const record = await this.prisma.consentRecord.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });
    if (!record) throw new NotFoundException('No consent record found');

    return this.prisma.consentRecord.update({
      where: { id: record.id },
      data: { status: 'WITHDRAWN' as ConsentStatus, withdrawnAt: new Date() },
    });
  }

  async checkConsent(userId: string, purpose: string): Promise<boolean> {
    const record = await this.prisma.consentRecord.findFirst({
      where: {
        userId,
        template: { purpose: purpose as any, isActive: true },
        status: 'GIVEN' as ConsentStatus,
        OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
      },
      include: { template: true },
    });
    return !!record;
  }

  async getConsentStatus(userId: string) {
    const templates = await this.prisma.consentTemplate.findMany({
      where: { isActive: true },
    });

    const userConsents = await this.prisma.consentRecord.findMany({
      where: { userId },
    });

    return templates.map((template) => {
      const userConsent = userConsents.find(
        (c) => c.templateId === template.id,
      );
      return {
        templateId: template.id,
        purpose: template.purpose,
        title: template.title,
        version: template.version,
        status: userConsent?.status || 'NOT_GIVEN',
        givenAt: userConsent?.givenAt || null,
        withdrawnAt: userConsent?.withdrawnAt || null,
        expiresAt: userConsent?.expiresAt || template.validUntil,
      };
    });
  }

  async getConsentStatistics(organizationId?: string) {
    const where: any = organizationId ? { user: { organizationId } } : {};
    const userWhere: any = organizationId ? { organizationId } : {};

    const totalUsers = await this.prisma.user.count({ where: userWhere });
    const templates = await this.prisma.consentTemplate.findMany();
    const stats = [];

    for (const template of templates) {
      const given = await this.prisma.consentRecord.count({
        where: {
          ...where,
          templateId: template.id,
          status: 'GIVEN' as ConsentStatus,
        },
      });
      const withdrawn = await this.prisma.consentRecord.count({
        where: {
          ...where,
          templateId: template.id,
          status: 'WITHDRAWN' as ConsentStatus,
        },
      });

      stats.push({
        purpose: template.purpose,
        title: template.title,
        givenCount: given,
        withdrawnCount: withdrawn,
        pendingCount: Math.max(0, totalUsers - given - withdrawn),
        consentRate:
          totalUsers > 0 ? Math.round((given / totalUsers) * 100) : 0,
      });
    }

    return { totalUsers, templates: stats };
  }
}
