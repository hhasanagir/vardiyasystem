import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SchedulingInsightsService } from './scheduling-insights.service';

@Injectable()
export class RecommendationsService {
  constructor(
    private prisma: PrismaService,
    private insights: SchedulingInsightsService,
  ) {}

  async findAll(organizationId: string) {
    const recommendations = await this.prisma.recommendation.findMany({
      where: { organizationId, status: 'ACTIVE' },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: [{ priority: 'asc' }, { score: 'desc' }],
    });

    return {
      data: recommendations.map((r) => ({
        id: r.id,
        type: r.type,
        priority: r.priority,
        score: r.score,
        title: r.title,
        description: r.description,
        impactFatigue: r.impactFatigue,
        impactFairness: r.impactFairness,
        impactCoverage: r.impactCoverage,
        impactOverall: r.impactOverall,
        shiftIds: r.shiftIds,
        userIds: r.userIds,
        suggestedActionData: r.suggestedActionData,
        createdAt: r.createdAt,
      })),
    };
  }

  async generateAll(organizationId: string, userId?: string) {
    const results = await this.insights.analyzeAll(organizationId);

    const created = await this.prisma.$transaction(
      results.map((r) =>
        this.prisma.recommendation.create({
          data: {
            organizationId,
            createdById: userId || null,
            type: r.type as any,
            priority: r.priority as any,
            score: r.score,
            title: r.title,
            description: r.description,
            impactFatigue: r.impactFatigue,
            impactFairness: r.impactFairness,
            impactCoverage: r.impactCoverage,
            impactOverall: r.impactOverall,
            shiftIds: r.shiftIds,
            userIds: r.userIds,
            suggestedActionType: (r.suggestedActionData.type as string) || null,
            suggestedActionData: r.suggestedActionData as any,
            status: 'ACTIVE',
          },
        }),
      ),
    );

    return { generated: created.length };
  }

  async apply(id: string) {
    const rec = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Öneri bulunamadı');

    return this.prisma.recommendation.update({
      where: { id },
      data: { status: 'APPLIED', appliedAt: new Date() },
    });
  }

  async dismiss(id: string) {
    const rec = await this.prisma.recommendation.findUnique({ where: { id } });
    if (!rec) throw new NotFoundException('Öneri bulunamadı');

    return this.prisma.recommendation.update({
      where: { id },
      data: { status: 'DISMISSED', dismissedAt: new Date() },
    });
  }

  async findAllConflicts(organizationId: string) {
    const conflicts = await this.prisma.conflict.findMany({
      where: { organizationId, resolvedAt: null },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });

    return {
      data: conflicts.map((c) => ({
        id: c.id,
        type: c.type,
        severity: c.severity,
        title: c.title,
        description: c.description,
        suggestedFix: c.suggestedFix,
        shiftIds: c.shiftIds,
        userIds: c.userIds,
        affectedDate: c.affectedDate,
        resolvedAt: c.resolvedAt,
      })),
    };
  }

  async resolveConflict(id: string) {
    const conflict = await this.prisma.conflict.findUnique({ where: { id } });
    if (!conflict) throw new NotFoundException('Çakışma bulunamadı');

    return this.prisma.conflict.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
  }

  async runValidation(organizationId: string) {
    const units = await this.prisma.unit.findMany({
      where: { organizationId },
      select: { id: true },
    });
    const unitIds = units.map((u) => u.id);

    const assignments = await this.prisma.assignment.findMany({
      where: {
        schedule: {
          unitId: { in: unitIds },
          status: { in: ['draft', 'under_review'] },
        },
      },
      include: {
        personnel: {
          select: {
            id: true,
            name: true,
            offDays: true,
            skills: true,
            deviceSkills: true,
          },
        },
        device: { select: { id: true, name: true, requiredSkills: true } },
      },
    });

    const errors: string[] = [];
    const warnings: string[] = [];

    for (const a of assignments) {
      const p = a.personnel;
      const d = a.device;
      if (p.offDays?.includes(new Date(a.date).getDay())) {
        errors.push(`${p.name} izin gününde (${a.date}) atanmış`);
      }
      if (!d) continue;
      const missing = (d.requiredSkills || []).filter(
        (s) => !p.skills.includes(s) && !p.deviceSkills.includes(s),
      );
      if (missing.length > 0) {
        warnings.push(
          `${p.name} için ${d.name} cihazında yetkinlik eksik: ${missing.join(', ')}`,
        );
      }
    }

    return {
      isValid: errors.length === 0,
      totalShifts: assignments.length,
      validatedShifts: assignments.length,
      conflictsFound: errors.length + warnings.length,
      warnings,
      errors,
      timestamp: new Date(),
    };
  }

  async rebalance(organizationId: string) {
    const personnel = await this.prisma.personnel.findMany({
      where: { unit: { organizationId }, isActive: true },
      include: {
        assignments: {
          where: { schedule: { status: { in: ['published', 'approved'] } } },
          select: { id: true, date: true, shiftType: true },
        },
      },
    });

    let totalAssignments = 0;
    const nightCounts: number[] = [];

    for (const p of personnel) {
      totalAssignments += p.assignments.length;
      nightCounts.push(
        p.assignments.filter((a) => a.shiftType === 'night').length,
      );
    }

    const avg = personnel.length > 0 ? totalAssignments / personnel.length : 0;
    const variance =
      nightCounts.length > 0
        ? nightCounts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) /
          nightCounts.length
        : 0;
    const stdDev = Math.sqrt(variance);
    const fairnessScore = Math.max(0, 100 - stdDev * 20);
    const totalNightShifts = nightCounts.reduce((a, b) => a + b, 0);
    const fatigueScore =
      personnel.length > 0
        ? 100 - (totalNightShifts / (personnel.length * 7)) * 100
        : 100;

    return {
      success: true,
      shiftsModified: 0,
      fairnessImprovement: 0,
      fatigueReduction: 0,
      coverageImprovement: 0,
      swapsPerformed: 0,
      beforeStats: {
        fairnessScore: Math.round(fairnessScore),
        fatigueScore: Math.round(fatigueScore),
        coveragePercent: 0,
      },
      afterStats: {
        fairnessScore: Math.round(fairnessScore),
        fatigueScore: Math.round(fatigueScore),
        coveragePercent: 0,
      },
    };
  }
}
