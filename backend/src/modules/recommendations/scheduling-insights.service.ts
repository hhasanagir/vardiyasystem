import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

interface AnalyzerResult {
  type: 'SWAP' | 'COVERAGE' | 'FAIRNESS' | 'FATIGUE';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  score: number;
  title: string;
  description: string;
  impactFatigue: number;
  impactFairness: number;
  impactCoverage: number;
  impactOverall: number;
  shiftIds: string[];
  userIds: string[];
  suggestedActionData: Record<string, unknown>;
}

@Injectable()
export class SchedulingInsightsService {
  constructor(private prisma: PrismaService) {}

  async analyzeAll(organizationId: string): Promise<AnalyzerResult[]> {
    const [
      overtime,
      consecutiveNights,
      workloadImbalance,
      staffingGaps,
      skillShortages,
      leaveConflicts,
    ] = await Promise.all([
      this.analyzeOvertime(organizationId),
      this.analyzeConsecutiveNightShifts(organizationId),
      this.analyzeWorkloadImbalance(organizationId),
      this.analyzeStaffingGaps(organizationId),
      this.analyzeSkillShortages(organizationId),
      this.analyzeLeaveConflicts(organizationId),
    ]);

    return [
      ...overtime,
      ...consecutiveNights,
      ...workloadImbalance,
      ...staffingGaps,
      ...skillShortages,
      ...leaveConflicts,
    ];
  }

  private async analyzeOvertime(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];
    const personnel = await this.prisma.personnel.findMany({
      where: { unit: { organizationId }, isActive: true },
      include: {
        assignments: {
          where: { schedule: { status: { in: ['published', 'approved'] } } },
          select: {
            startTime: true,
            endTime: true,
            date: true,
            id: true,
            shiftType: true,
          },
        },
        unit: { select: { name: true } },
      },
    });

    const now = new Date();
    for (const p of personnel) {
      const weeklyHours = this.calculateWeeklyHours(p.assignments, now);
      const threshold = p.maxWeeklyHours;

      if (weeklyHours > threshold) {
        const excess = weeklyHours - threshold;
        results.push({
          type: 'FATIGUE',
          priority: excess > 10 ? 'HIGH' : excess > 5 ? 'MEDIUM' : 'LOW',
          score: Math.min(10, Math.round((excess / threshold) * 10)),
          title: `Haftalık mesai sınırı aşıldı: ${p.name}`,
          description: `${p.name} (${p.unit?.name || 'Birimsiz'}): ${weeklyHours.toFixed(0)} saat / ${threshold} saat (${excess.toFixed(0)} saat fazla mesai)`,
          impactFatigue: Math.round((weeklyHours / threshold - 1) * 100),
          impactFairness: 0,
          impactCoverage: 0,
          impactOverall: Math.min(
            100,
            Math.round((weeklyHours / threshold) * 50),
          ),
          shiftIds: p.assignments.map((a) => a.id),
          userIds: [p.id],
          suggestedActionData: {
            type: 'adjust',
            personnelId: p.id,
            excessHours: excess,
          },
        });
      }
    }

    return results;
  }

  private async analyzeConsecutiveNightShifts(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];
    const personnel = await this.prisma.personnel.findMany({
      where: { unit: { organizationId }, isActive: true },
      include: {
        assignments: {
          where: { schedule: { status: { in: ['published', 'approved'] } } },
          select: { date: true, shiftType: true, id: true },
          orderBy: { date: 'asc' },
        },
        unit: { select: { name: true } },
      },
    });

    for (const p of personnel) {
      const nightShifts = p.assignments.filter((a) => a.shiftType === 'night');
      const streaks = this.findConsecutiveDates(nightShifts.map((a) => a.date));

      for (const streak of streaks) {
        if (streak.length >= 3) {
          const nightShiftIds = nightShifts
            .filter((a) => streak.includes(a.date))
            .map((a) => a.id);

          results.push({
            type: 'FATIGUE',
            priority:
              streak.length >= 5
                ? 'HIGH'
                : streak.length >= 4
                  ? 'MEDIUM'
                  : 'LOW',
            score: Math.min(10, Math.round((streak.length / 7) * 10)),
            title: `Ardışık gece vardiyası: ${p.name}`,
            description: `${p.name} (${p.unit?.name || 'Birimsiz'}): ${streak.length} ardışık gece vardiyası (${streak[0]} - ${streak[streak.length - 1]})`,
            impactFatigue: Math.round((streak.length / 5) * 100),
            impactFairness: 0,
            impactCoverage: 0,
            impactOverall: Math.min(100, Math.round((streak.length / 7) * 80)),
            shiftIds: nightShiftIds,
            userIds: [p.id],
            suggestedActionData: {
              type: 'swap',
              personnelId: p.id,
              consecutiveCount: streak.length,
            },
          });
        }
      }
    }

    return results;
  }

  private async analyzeWorkloadImbalance(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];
    const units = await this.prisma.unit.findMany({
      where: { organizationId },
      include: {
        personnel: {
          where: { isActive: true },
          include: {
            assignments: {
              where: {
                schedule: { status: { in: ['published', 'approved'] } },
              },
              select: { id: true, date: true },
            },
          },
        },
      },
    });

    for (const unit of units) {
      if (unit.personnel.length < 2) continue;

      const workloads = unit.personnel.map((p) => ({
        id: p.id,
        name: p.name,
        count: p.assignments.length,
      }));

      const maxCount = Math.max(...workloads.map((w) => w.count));
      const minCount = Math.min(...workloads.map((w) => w.count));
      const avgCount =
        workloads.reduce((s, w) => s + w.count, 0) / workloads.length;

      if (maxCount - minCount >= 3 && unit.personnel.length >= 2) {
        const overloaded = workloads.filter((w) => w.count > avgCount + 2);
        const underloaded = workloads.filter((w) => w.count < avgCount - 2);

        if (overloaded.length > 0 && underloaded.length > 0) {
          const diff = maxCount - minCount;
          results.push({
            type: 'FAIRNESS',
            priority: diff >= 6 ? 'HIGH' : diff >= 4 ? 'MEDIUM' : 'LOW',
            score: Math.min(10, Math.round((diff / 10) * 10)),
            title: `İş yükü dengesizliği: ${unit.name}`,
            description: `${unit.name} biriminde iş yükü dağılımı dengesiz. En yoğun: ${overloaded.map((w) => `${w.name} (${w.count})`).join(', ')} - En az: ${underloaded.map((w) => `${w.name} (${w.count})`).join(', ')}`,
            impactFatigue: 0,
            impactFairness: Math.round((diff / avgCount) * 100),
            impactCoverage: 0,
            impactOverall: Math.min(100, Math.round((diff / 10) * 60)),
            shiftIds: [],
            userIds: workloads.map((w) => w.id),
            suggestedActionData: {
              type: 'adjust',
              unitId: unit.id,
              overloadedIds: overloaded.map((w) => w.id),
              underloadedIds: underloaded.map((w) => w.id),
            },
          });
        }
      }
    }

    return results;
  }

  private async analyzeStaffingGaps(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];
    const currentDate = new Date().toISOString().slice(0, 10);
    const endDate = new Date(Date.now() + 14 * 86400000)
      .toISOString()
      .slice(0, 10);

    const units = await this.prisma.unit.findMany({
      where: { organizationId },
      include: {
        devices: {
          where: { isActive: true },
          select: {
            id: true,
            name: true,
            code: true,
            mode: true,
            requiredSkills: true,
          },
        },
        personnel: {
          where: { isActive: true },
          select: { id: true, name: true, skills: true, deviceSkills: true },
        },
      },
    });

    const schedules = await this.prisma.schedule.findMany({
      where: {
        unit: { organizationId },
        status: { in: ['published', 'approved', 'draft'] },
      },
      include: {
        assignments: {
          select: {
            id: true,
            date: true,
            deviceId: true,
            shiftType: true,
            personnelId: true,
          },
        },
      },
    });

    for (const unit of units) {
      const unitSchedules = schedules.filter((s) => s.unitId === unit.id);

      for (const device of unit.devices) {
        const slotsPerDay = device.mode === 'polyclinic' ? 1 : 2;
        const assignedPerDay: Record<string, number> = {};

        for (const sched of unitSchedules) {
          for (const a of sched.assignments) {
            if (
              a.deviceId === device.id &&
              a.date >= currentDate &&
              a.date <= endDate
            ) {
              assignedPerDay[a.date] = (assignedPerDay[a.date] || 0) + 1;
            }
          }
        }

        for (const date of this.getDateRange(currentDate, endDate)) {
          const assigned = assignedPerDay[date] || 0;
          if (assigned < slotsPerDay) {
            const gap = slotsPerDay - assigned;
            results.push({
              type: 'COVERAGE',
              priority: gap >= slotsPerDay ? 'HIGH' : 'MEDIUM',
              score: Math.min(10, Math.round((gap / slotsPerDay) * 10)),
              title: `Personel açığı: ${device.name}`,
              description: `${unit.name} - ${device.name}: ${date} tarihinde ${gap} personel eksik (gerekli: ${slotsPerDay}, mevcut: ${assigned})`,
              impactFatigue: 0,
              impactFairness: 0,
              impactCoverage: Math.round((gap / slotsPerDay) * 100),
              impactOverall: Math.min(
                100,
                Math.round((gap / slotsPerDay) * 70),
              ),
              shiftIds: [],
              userIds: unit.personnel.map((p) => p.id),
              suggestedActionData: {
                type: 'assign',
                deviceId: device.id,
                date,
                gap,
              },
            });
          }
        }
      }
    }

    return results;
  }

  private async analyzeSkillShortages(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];

    const units = await this.prisma.unit.findMany({
      where: { organizationId },
      include: {
        devices: {
          where: { isActive: true },
          select: { id: true, name: true, code: true, requiredSkills: true },
        },
        personnel: {
          where: { isActive: true },
          select: { id: true, name: true, skills: true, deviceSkills: true },
        },
      },
    });

    const schedules = await this.prisma.schedule.findMany({
      where: {
        unit: { organizationId },
        status: { in: ['published', 'approved', 'draft'] },
      },
      include: {
        assignments: {
          select: { id: true, date: true, deviceId: true, personnelId: true },
          include: {
            personnel: {
              select: {
                id: true,
                name: true,
                skills: true,
                deviceSkills: true,
              },
            },
          },
        },
      },
    });

    for (const unit of units) {
      for (const device of unit.devices) {
        if (!device.requiredSkills || device.requiredSkills.length === 0)
          continue;

        for (const sched of schedules) {
          if (sched.unitId !== unit.id) continue;

          for (const assignment of sched.assignments) {
            if (assignment.deviceId !== device.id) continue;
            const p = assignment.personnel;
            if (!p) continue;

            const missingSkills = device.requiredSkills.filter(
              (s) => !p.skills.includes(s) && !p.deviceSkills.includes(s),
            );

            if (missingSkills.length > 0) {
              results.push({
                type: 'COVERAGE',
                priority: 'HIGH',
                score: Math.min(
                  10,
                  Math.round(
                    (missingSkills.length / device.requiredSkills.length) * 10,
                  ),
                ),
                title: `Yetkinlik eksikliği: ${p.name} - ${device.name}`,
                description: `${p.name}, ${device.name} cihazı için gerekli yetkinliklere sahip değil. Eksik: ${missingSkills.join(', ')}`,
                impactFatigue: 0,
                impactFairness: 0,
                impactCoverage: -Math.round(
                  (missingSkills.length / device.requiredSkills.length) * 100,
                ),
                impactOverall: -Math.min(
                  100,
                  Math.round(
                    (missingSkills.length / device.requiredSkills.length) * 80,
                  ),
                ),
                shiftIds: [assignment.id],
                userIds: [p.id],
                suggestedActionData: {
                  type: 'unassign',
                  assignmentId: assignment.id,
                  missingSkills,
                },
              });
            }
          }
        }
      }
    }

    return results;
  }

  private async analyzeLeaveConflicts(
    organizationId: string,
  ): Promise<AnalyzerResult[]> {
    const results: AnalyzerResult[] = [];

    const schedules = await this.prisma.schedule.findMany({
      where: {
        unit: { organizationId },
        status: { in: ['published', 'approved', 'draft'] },
      },
      include: {
        assignments: {
          include: {
            personnel: {
              select: {
                id: true,
                name: true,
                offDays: true,
                unit: { select: { name: true } },
              },
            },
          },
          where: { personnel: { isActive: true } },
        },
      },
    });

    const dayNames = [
      'pazar',
      'pazartesi',
      'salı',
      'çarşamba',
      'perşembe',
      'cuma',
      'cumartesi',
    ];

    for (const sched of schedules) {
      for (const assignment of sched.assignments) {
        const p = assignment.personnel;
        if (!p || !p.offDays || p.offDays.length === 0) continue;

        const date = new Date(assignment.date);
        const dayOfWeek = date.getDay();
        const dayName = dayNames[dayOfWeek];

        if (p.offDays.includes(dayOfWeek)) {
          results.push({
            type: 'SWAP',
            priority: 'HIGH',
            score: 10,
            title: `İzin günü çakışması: ${p.name}`,
            description: `${p.name} (${p.unit?.name || 'Birimsiz'}): ${assignment.date} (${dayName}) izin gününde vardiyaya atanmış`,
            impactFatigue: 0,
            impactFairness: -50,
            impactCoverage: 0,
            impactOverall: -50,
            shiftIds: [assignment.id],
            userIds: [p.id],
            suggestedActionData: {
              type: 'swap',
              assignmentId: assignment.id,
              personnelId: p.id,
              conflictDate: assignment.date,
            },
          });
        }
      }
    }

    return results;
  }

  private calculateWeeklyHours(
    assignments: { startTime: string; endTime: string; date: string }[],
    now: Date,
  ): number {
    const weekAgo = new Date(now.getTime() - 7 * 86400000)
      .toISOString()
      .slice(0, 10);
    const recent = assignments.filter((a) => a.date >= weekAgo);
    return recent.reduce((sum, a) => {
      const [sh, sm] = a.startTime.split(':').map(Number);
      const [eh, em] = a.endTime.split(':').map(Number);
      const hours = eh + em / 60 - (sh + sm / 60);
      return sum + (hours > 0 ? hours : hours + 24);
    }, 0);
  }

  private findConsecutiveDates(dates: string[]): string[][] {
    if (dates.length === 0) return [];
    const unique = [...new Set(dates)].sort();
    const streaks: string[][] = [];
    let current: string[] = [unique[0]];

    for (let i = 1; i < unique.length; i++) {
      const prev = new Date(unique[i - 1]);
      const curr = new Date(unique[i]);
      const diffDays = (curr.getTime() - prev.getTime()) / 86400000;

      if (diffDays === 1) {
        current.push(unique[i]);
      } else {
        if (current.length >= 3) streaks.push(current);
        current = [unique[i]];
      }
    }
    if (current.length >= 3) streaks.push(current);
    return streaks;
  }

  private getDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const current = new Date(start);
    const endDate = new Date(end);
    while (current <= endDate) {
      dates.push(current.toISOString().slice(0, 10));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }
}
