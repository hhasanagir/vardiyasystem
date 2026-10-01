import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleOptimizerService } from './domain/optimization/schedule-optimizer.service';
import {
  SchedulingProblem,
  SchedulingProblemPersonnel,
  SchedulingProblemDevice,
  SchedulingProblemShiftDef,
  SchedulingProblemConfig,
} from './domain/optimization/scheduling-problem';
import { OptimizationResult } from './domain/optimization/optimization-result';
import { DryRunOptimizationDto } from './dto/dry-run-optimization.dto';
import { AssignmentCollection } from './domain/entities/assignment-collection';
import { Assignment } from './domain/entities/assignment.entity';

@Injectable()
export class ScheduleDryRunService {
  private readonly logger = new Logger(ScheduleDryRunService.name);
  private readonly optimizer = new ScheduleOptimizerService();

  constructor(private readonly prisma: PrismaService) {}

  async execute(dto: DryRunOptimizationDto): Promise<OptimizationResult> {
    const unit = await this.prisma.unit.findFirst({
      where: { type: dto.unitType as any },
    });
    if (!unit) throw new NotFoundException(`Unit not found: ${dto.unitType}`);

    const [
      personnelRecords,
      deviceRecords,
      shiftDefs,
      holidays,
      existingAssignments,
    ] = await Promise.all([
      this.loadPersonnel(unit.id),
      this.loadDevices(unit.id),
      this.loadShiftDefinitions(unit.id),
      this.loadHolidays(dto.year, dto.month),
      this.loadExistingAssignments(dto.scheduleId),
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
      serviceLine:
        dto.unitType === 'onkoloji' ? 'RADIATION_ONCOLOGY' : 'IMAGING',
      year: dto.year,
      month: dto.month,
      personnel: personnelRecords,
      devices: deviceRecords,
      shiftDefinitions: shiftDefs,
      existingAssignments,
      holidays: new Set(
        holidays.map((h: { date: string; name: string }) => h.date),
      ),
      configuration: config,
    };

    const strategyId = dto.strategy || 'greedy';

    this.logger.log(
      `Dry-run: ${strategyId} strategy | ${personnelRecords.length} personnel | ${deviceRecords.length} devices | ${existingAssignments.size} existing assignments`,
    );

    return this.optimizer.optimize(problem, strategyId);
  }

  private async loadPersonnel(
    unitId: string,
  ): Promise<SchedulingProblemPersonnel[]> {
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
      },
    });
    return records
      .filter((r) => r.employmentStatus === 'active')
      .map((r) => ({
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
      }));
  }

  private async loadDevices(
    unitId: string,
  ): Promise<SchedulingProblemDevice[]> {
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
    });
    return records.map((r) => ({
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

  private async loadShiftDefinitions(
    unitId: string,
  ): Promise<SchedulingProblemShiftDef[]> {
    const records = await this.prisma.shifts.findMany({
      where: { unitId, isActive: true, deviceId: { not: null } },
      select: {
        deviceId: true,
        type: true,
        startTime: true,
        endTime: true,
        personnelType: true,
      },
    });
    return records
      .filter((r) => r.deviceId !== null)
      .map((r) => ({
        deviceId: r.deviceId!,
        shiftType: r.type,
        startTime: r.startTime || '08:00',
        endTime: r.endTime || '16:00',
        personnelType: r.personnelType || 'technician',
      }));
  }

  private async loadHolidays(
    year: number,
    month: number,
  ): Promise<Array<{ date: string; name: string }>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    return this.prisma.holiday.findMany({
      where: { date: { gte: startDate, lte: endDate } },
      select: { date: true, name: true },
    });
  }

  private async loadExistingAssignments(
    scheduleId: string,
  ): Promise<AssignmentCollection> {
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
    });

    const collection = new AssignmentCollection();
    for (const r of records) {
      try {
        collection.add(
          Assignment.create({
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
          }),
        );
      } catch {
        this.logger.warn(
          `Skipping assignment ${r.id}: ${r.personnelId} on ${r.date}`,
        );
      }
    }
    return collection;
  }
}
