import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleOptimizerService } from './domain/optimization/schedule-optimizer.service';
import { SchedulingProblem, SchedulingProblemPersonnel, SchedulingProblemDevice, SchedulingProblemShiftDef, SchedulingProblemConfig } from './domain/optimization/scheduling-problem';
import { OptimizationResult } from './domain/optimization/optimization-result';
import { DryRunOptimizationDto } from './dto/dry-run-optimization.dto';
import { AssignmentCollection } from './domain/entities/assignment-collection';
import { Assignment } from './domain/entities/assignment.entity';
import { PersonnelAvailabilityService } from './services/personnel-availability.service';
import { tenantContext } from '../../infrastructure/prisma/middleware/tenant.middleware';
import { isFeatureEnabled } from '../../config/feature-flags';

export const DDD_CANONICAL_SCHEDULING_FLAG = 'ENABLE_DDD_CANONICAL_SCHEDULING';

@Injectable()
export class ScheduleDryRunService {
  private readonly logger = new Logger(ScheduleDryRunService.name);
  private readonly optimizer = new ScheduleOptimizerService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly availabilityService: PersonnelAvailabilityService,
  ) {}

  async execute(dto: DryRunOptimizationDto, organizationId?: string): Promise<OptimizationResult> {
    // Unit TYPE is only unique inside an organization. Resolving it globally
    // allowed a tenant to preview a sibling organization's unit by guessing
    // the type code, so the lookup is pinned to the acting tenant.
    const scopeOrganizationId =
      organizationId ?? tenantContext.getStore()?.organizationId;
    const unit = await this.prisma.unit.findFirst({
      where: {
        type: dto.unitType as any,
        ...(scopeOrganizationId ? { organizationId: scopeOrganizationId } : {}),
      },
    });
    if (!unit) throw new NotFoundException(`Unit not found: ${dto.unitType}`);
    if (scopeOrganizationId && unit.organizationId && unit.organizationId !== scopeOrganizationId) {
      throw new NotFoundException(`Unit not found: ${dto.unitType}`);
    }

    // The schedule the caller asks to optimize must belong to the resolved
    // unit. Otherwise the dry-run could load another tenant's assignments.
    const schedule = await this.prisma.schedule.findFirst({
      where: { id: dto.scheduleId, unitId: unit.id },
      select: { id: true },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule not found for unit: ${dto.scheduleId}`);
    }

    const [personnelRecords, deviceRecords, shiftDefs, holidays, existingAssignments, deviceOffRecords, overrideRecords] = await Promise.all([
      this.loadPersonnel(unit.id, dto.year, dto.month),
      this.loadDevices(unit.id),
      this.loadShiftDefinitions(unit.id),
      this.loadHolidays(dto.year, dto.month),
      this.loadExistingAssignments(dto.scheduleId),
      this.loadDeviceOffDates(unit.id, dto.year, dto.month),
      this.loadShiftOverrides(dto.year, dto.month),
    ]);

    const config: SchedulingProblemConfig = {
      fairnessMode: (dto.fairnessMode as any) || 'balanced',
      maxOvertime: dto.maxOvertime ?? 20,
      includeWeekends: dto.includeWeekends ?? true,
      includeNightShifts: dto.includeNightShifts ?? true,
      minRestHours: dto.minRestHours ?? 11,
      maxConsecutiveDays: dto.maxConsecutiveDays ?? 6,
      maxConsecutiveNights: dto.maxConsecutiveNights ?? 3,
    };

    const problem: SchedulingProblem = {
      scheduleId: dto.scheduleId,
      unitId: unit.id,
      unitType: dto.unitType,
      serviceLine: dto.unitType === 'onkoloji' ? 'RADIATION_ONCOLOGY' : 'IMAGING',
      year: dto.year,
      month: dto.month,
      personnel: personnelRecords,
      devices: deviceRecords,
      shiftDefinitions: shiftDefs,
      existingAssignments,
      holidays: new Set(holidays.map((h: { date: string; name: string }) => h.date)),
      deviceOffDates: deviceOffRecords,
      configuration: config,
      // PHASE 5C.26 P1-A2 — production dry-run enforces minimum coverage as a
      // hard constraint through the single authoritative CoverageEngine.
      coverageEnabled: true,
      coverageContext: {
        shiftDateOverrides: overrideRecords,
        assistantPersonnelCount: personnelRecords.filter(p => p.role === 'assistant_technician').length,
        supervisorPersonnelCount: personnelRecords.filter(p => p.role === 'supervisor').length,
      },
    };

    const strategyId = dto.strategy || 'greedy';
    // P2-01/02/03 — gradual cutover. The flag first affects ONLY this read-only
    // preview surface: legacy write routes stay active in migration mode until
    // DB/worker parity is verified. Both modes already share the single
    // ConstraintEngine + VIOLATION_POLICY, so there is no second rule set.
    const canonicalMode = isFeatureEnabled(DDD_CANONICAL_SCHEDULING_FLAG);

    this.logger.log(
      `Dry-run: ${strategyId} strategy | ${canonicalMode ? 'canonical' : 'legacy-migration'} policy | ` +
      `${personnelRecords.length} personnel | ${deviceRecords.length} devices | ${existingAssignments.size} existing assignments`,
    );

    const result = this.optimizer.optimize(problem, strategyId);
    result.metadata.rolloutMode = canonicalMode ? 'canonical' : 'legacy-migration';
    return result;
  }

  private async loadPersonnel(unitId: string, year: number, month: number): Promise<SchedulingProblemPersonnel[]> {
    const records = await this.prisma.personnel.findMany({
      where: { unitId, isActive: true },
      select: {
        id: true,
        name: true,
        role: true,
        skills: true,
        deviceSkills: true,
        nightShiftEligible: true,
        employmentStatus: true,
        offDays: true,
        maxWeeklyHours: true,
        isActive: true,
        seniority: true,
      },
      // P2-10 — deterministic order; seniority mode must not depend on row order.
      orderBy: [{ seniority: 'desc' }, { id: 'asc' }],
    });
    const active = records.filter(r => r.employmentStatus === 'active');
    const blockedDates = await this.availabilityService.resolveMonthBlockedDates(
      active.map(r => ({ id: r.id, offDays: r.offDays || [] })),
      year,
      month,
    );
    return active.map(r => ({
      id: r.id,
      name: r.name,
      role: r.role,
      skills: r.skills || [],
      deviceSkills: r.deviceSkills || [],
      nightShiftEligible: r.nightShiftEligible,
      employmentStatus: r.employmentStatus,
      offDays: r.offDays || [],
      maxWeeklyHours: r.maxWeeklyHours || 40,
      isActive: r.isActive,
      seniority: r.seniority || 0,
      blockedDates: Array.from(blockedDates.get(r.id) || []),
    }));
  }

  private async loadDevices(unitId: string): Promise<SchedulingProblemDevice[]> {
    const records = await this.prisma.device.findMany({
      where: { unitId, isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        mode: true,
        requiredSkills: true,
        workDays: true,
        startHour: true,
        endHour: true,
      },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
    });
    return records.map(r => ({
      id: r.id,
      code: r.code,
      name: r.name,
      mode: r.mode || 'continuous',
      requiredSkills: r.requiredSkills || [],
      workDays: r.workDays || [1, 2, 3, 4, 5],
      startHour: r.startHour ?? 8,
      endHour: r.endHour ?? 16,
    }));
  }

  private async loadShiftDefinitions(unitId: string): Promise<SchedulingProblemShiftDef[]> {
    const records = await this.prisma.shifts.findMany({
      where: { unitId, isActive: true, deviceId: { not: null } },
      select: {
        id: true,
        deviceId: true,
        type: true,
        startTime: true,
        endTime: true,
        personnelType: true,
        blockId: true,
        optionalOnWeekends: true,
        optionalOnHolidays: true,
      },
      orderBy: [{ deviceId: 'asc' }, { type: 'asc' }, { startTime: 'asc' }, { id: 'asc' }],
    });
    // PHASE 5C.26 P1-A2 — carry row id + assistant gating fields so the coverage
    // engine can mirror the generator's optional/block semantics inside the optimizer.
    return records
      .filter(r => r.deviceId !== null)
      .map(r => ({
        id: r.id,
        deviceId: r.deviceId!,
        shiftType: r.type,
        startTime: r.startTime || '08:00',
        endTime: r.endTime || '16:00',
        personnelType: r.personnelType || 'technician',
        blockId: r.blockId,
        optionalOnWeekends: r.optionalOnWeekends,
        optionalOnHolidays: r.optionalOnHolidays,
      }));
  }

  private async loadShiftOverrides(year: number, month: number): Promise<Set<string>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const overrides = await this.prisma.shiftDateOverride.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        isEnabled: true,
      },
      select: { shiftId: true, date: true },
      orderBy: [{ date: 'asc' }, { shiftId: 'asc' }],
    });
    return new Set(overrides.map(o => `${o.shiftId}|${o.date}`));
  }

  private async loadHolidays(year: number, month: number): Promise<Array<{ date: string; name: string }>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    return this.prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true, name: true },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });
  }

  private async loadExistingAssignments(scheduleId: string): Promise<AssignmentCollection> {
    const records = await this.prisma.assignment.findMany({
      where: { scheduleId },
      select: {
        id: true,
        scheduleId: true,
        personnelId: true,
        deviceId: true,
        unitId: true,
        personnelGroupId: true,
        shiftTemplateId: true,
        kind: true,
        date: true,
        shiftType: true,
        startTime: true,
        endTime: true,
        personnelType: true,
      },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const collection = new AssignmentCollection();
    for (const r of records) {
      try {
        collection.add(Assignment.create({
          scheduleId: r.scheduleId,
          personnelId: r.personnelId,
          deviceId: r.deviceId,
          unitId: r.unitId || undefined,
          personnelGroupId: r.personnelGroupId || undefined,
          shiftTemplateId: r.shiftTemplateId || undefined,
          kind: (r.kind as 'device' | 'person') || 'device',
          date: r.date,
          shiftType: r.shiftType,
          startTime: r.startTime,
          endTime: r.endTime,
          personnelType: r.personnelType || 'technician',
        }));
      } catch {
        this.logger.warn(`Skipping assignment ${r.id}: ${r.personnelId} on ${r.date}`);
      }
    }
    return collection;
  }

  private async loadDeviceOffDates(unitId: string, year: number, month: number): Promise<Set<string>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const records = await this.prisma.deviceOffDate.findMany({
      where: {
        device: { unitId },
        isActive: true,
        date: { gte: startDate, lte: endDate },
      },
      select: { deviceId: true, date: true },
      orderBy: [{ date: 'asc' }, { deviceId: 'asc' }],
    });
    return new Set(records.map(r => `${r.deviceId}:${r.date}`));
  }
}
