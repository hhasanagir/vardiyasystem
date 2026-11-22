import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { UnitScopeService } from '../rbac/services/unit-scope.service';
import { GenerateScheduleDto, ApplyGeneratedScheduleDto } from './dto/generate-schedule.dto';
import { ScheduleValidationService } from './schedule-validation.service';
import { PersonnelAvailabilityService } from './services/personnel-availability.service';
import { ScheduleCoverageService } from './services/schedule-coverage.service';
import { CoverageInput } from './domain/coverage/coverage-types';
import { isPublished } from '../../models/schedule-status';
import { tenantContext } from '../../infrastructure/prisma/middleware/tenant.middleware';
import { dayOfWeek, daysBetweenKeys, startOfWeek } from './domain/value-objects/local-date';

interface PersonnelInfo {
  id: string;
  name: string;
  role: string;
  skills: string[];
  deviceSkills: string[];
  nightShiftEligible: boolean;
  employmentStatus: string;
  offDays: number[];
  maxWeeklyHours: number;
  isActive: boolean;
  /** P2-10 — real seniority from Personnel; never inferred from array position. */
  seniority: number;
}

interface DeviceInfo {
  id: string;
  code: string;
  name: string;
  mode: string;
  requiredSkills: string[];
  workDays: number[];
  startHour: number;
  endHour: number;
}

interface DeviceShiftInfo {
  id: string;
  deviceId: string;
  type: string;
  startTime: string;
  endTime: string;
  personnelType: string;
  blockId?: string | null;
  optionalOnWeekends?: boolean;
  optionalOnHolidays?: boolean;
}

export interface GeneticAssignment {
  personnelId: string;
  personnelName?: string;
  personnelType?: string;
  deviceId: string;
  deviceCode?: string;
  deviceName?: string;
  date: string;
  shiftType: 'day' | 'evening' | 'night';
  startTime: string;
  endTime: string;
}

@Injectable()
export class ScheduleAutoGeneratorService {
  private readonly logger = new Logger(ScheduleAutoGeneratorService.name);

  private readonly SHIFT_TIMES: Record<string, { startTime: string; endTime: string }> = {
    day: { startTime: '08:00', endTime: '16:00' },
    evening: { startTime: '16:00', endTime: '00:00' },
    night: { startTime: '00:00', endTime: '08:00' },
  };

  constructor(
    private prisma: PrismaService,
    private scheduleValidation: ScheduleValidationService,
    private unitScopeService: UnitScopeService,
    private availabilityService?: PersonnelAvailabilityService,
    private coverageService?: ScheduleCoverageService,
  ) {}

  async preview(userId: string, dto: GenerateScheduleDto, organizationId?: string) {
    const result = await this.generate(userId, dto, organizationId);
    return {
      message: `${result.assignments.length} vardiya oluşturuldu`,
      summary: result.summary,
      assignments: result.assignments,
      warnings: result.warnings,
    };
  }

  async generate(userId: string, dto: GenerateScheduleDto, organizationId?: string) {
    // Defense in depth: never resolve a unit TYPE globally. A type is only
    // unique per organization, so the lookup is pinned to the acting tenant
    // (explicit argument first, request-scoped AsyncLocalStorage as fallback).
    const scopeOrganizationId =
      organizationId ?? tenantContext.getStore()?.organizationId;
    const unit = await this.prisma.unit.findFirst({
      where: {
        type: dto.unitType as any,
        ...(scopeOrganizationId ? { organizationId: scopeOrganizationId } : {}),
      },
    });
    if (!unit) throw new NotFoundException(`Birim bulunamadı: ${dto.unitType}`);
    if (scopeOrganizationId && unit.organizationId && unit.organizationId !== scopeOrganizationId) {
      throw new NotFoundException(`Birim bulunamadı: ${dto.unitType}`);
    }

    const options = {
      fairnessMode: dto.fairnessMode || 'balanced',
      maxOvertime: dto.maxOvertime ?? 20,
      includeWeekends: dto.includeWeekends ?? true,
      includeNightShifts: dto.includeNightShifts ?? true,
      minRestHours: dto.minRestHours ?? 11,
      maxConsecutiveDays: dto.maxConsecutiveDays ?? 6,
      maxConsecutiveNights: dto.maxConsecutiveNights ?? 3,
      unitId: unit.id,
      // P2-11 — the monthly cap must use the requested month/year. Previously
      // these were absent and findAvailablePersonnel always fell back to Jan 2026.
      year: dto.year,
      month: dto.month,
    };

    const [allPersonnel, devices, holidays] = await Promise.all([
      this.loadPersonnel(unit.id),
      this.loadDevices(unit.id),
      this.loadHolidays(dto.year, dto.month),
    ]);

    const startDate = `${dto.year}-${String(dto.month).padStart(2, '0')}-01`;
    const endDate = `${dto.year}-${String(dto.month).padStart(2, '0')}-31`;
    const deviceOffRecords = await this.prisma.deviceOffDate.findMany({
      where: {
        device: { unitId: unit.id },
        isActive: true,
        date: { gte: startDate, lte: endDate },
      },
      select: { deviceId: true, date: true },
      // P2-10 — DB row order is not stable; pin it before building the Set.
      orderBy: [{ date: 'asc' }, { deviceId: 'asc' }],
    });
    const deviceOffSet = new Set(deviceOffRecords.map(r => `${r.deviceId}:${r.date}`));
    const personnel = allPersonnel.filter(p => p.role === 'technician' || p.role === 'senior_technician');
    const assistantPersonnel = allPersonnel.filter(p => p.role === 'assistant_technician');
    const supervisorPersonnel = allPersonnel.filter(p => p.role === 'supervisor');

    // Phase 5C.23: authoritative personnel availability (explicit date rows override
    // weekly offDays). Consumed here so the generator never re-implements the logic.
    const personnelBlockedDates = this.availabilityService
      ? await this.availabilityService.resolveMonthBlockedDates(
          allPersonnel.map(p => ({ id: p.id, offDays: p.offDays })),
          dto.year,
          dto.month,
        )
      : PersonnelAvailabilityService.blockedByWeeklyOffDays(
          allPersonnel.map(p => ({ id: p.id, offDays: p.offDays })),
          dto.year,
          dto.month,
        );

    const personnelMap = new Map(personnel.map(p => [p.id, p.name]));
    const deviceMap = new Map(devices.map(d => [d.id, d.name]));
    const deviceCodeMap = new Map(devices.map(d => [d.id, d.code]));
    const assistantPersonnelMap = new Map(assistantPersonnel.map(p => [p.id, p.name]));
    const supervisorPersonnelMap = new Map(supervisorPersonnel.map(p => [p.id, p.name]));

    if (personnel.length === 0 && assistantPersonnel.length === 0 && supervisorPersonnel.length === 0) {
      return { assignments: [] as GeneticAssignment[], summary: { total: 0, warnings: ['Birimde aktif personel bulunamadı'] }, warnings: ['Birimde aktif personel bulunamadı'] };
    }

    if (devices.length === 0) {
      return { assignments: [] as GeneticAssignment[], summary: { total: 0, warnings: ['Birimde aktif cihaz bulunamadı'] }, warnings: ['Birimde aktif cihaz bulunamadı'] };
    }

    const deviceShifts = await this.loadDeviceShifts(unit.id);
    const techShiftsMap = new Map<string, DeviceShiftInfo[]>();
    const assistShiftsMap = new Map<string, DeviceShiftInfo[]>();
    const supervisorShiftsMap = new Map<string, DeviceShiftInfo[]>();
    for (const ds of deviceShifts) {
      let targetMap: Map<string, DeviceShiftInfo[]>;
      if (ds.personnelType === 'assistant_technician') targetMap = assistShiftsMap;
      else if (ds.personnelType === 'supervisor') targetMap = supervisorShiftsMap;
      else if (!ds.personnelType || ds.personnelType === 'technician' || ds.personnelType === 'senior_technician' || ds.personnelType.startsWith('technician_')) targetMap = techShiftsMap;
      else continue;
      const existing = targetMap.get(ds.deviceId) || [];
      existing.push(ds);
      targetMap.set(ds.deviceId, existing);
    }

    const holidayDates = new Set(holidays.map(h => h.date));
    const overrideMap = await this.loadShiftOverrides(dto.year, dto.month);
    const devicesWithShiftDefs = new Set(deviceShifts.map(ds => ds.deviceId));
    const daysInMonth = new Date(dto.year, dto.month, 0).getDate();

    // P2-11 — weekly hour ledgers, keyed by Monday-based week then personnel id.
    const weeklyHours: Record<string, Record<string, number>> = {};
    const assistantWeeklyHours: Record<string, Record<string, number>> = {};
    const supervisorWeeklyHours: Record<string, Record<string, number>> = {};

    const workload: Record<string, number> = {};
    const nightCount: Record<string, number> = {};
    const consecutiveDays: Record<string, number> = {};
    const lastShiftDate: Record<string, string | null> = {};
    const lastShiftType: Record<string, string | null> = {};
    // P2-18 — canonical 48h rest anchor: the last actual night, independent of
    // intervening day/evening shifts (RequiredRestConstraintNew semantics).
    const lastNightDate: Record<string, string | null> = {};
    const assignments: GeneticAssignment[] = [];
    const warnings: string[] = [];

    const assistantWorkload: Record<string, number> = {};
    const assistantNightCount: Record<string, number> = {};
    const assistantConsecutiveDays: Record<string, number> = {};
    const assistantLastShiftDate: Record<string, string | null> = {};
    const assistantLastShiftType: Record<string, string | null> = {};
    const assistantLastNightDate: Record<string, string | null> = {};

    const supervisorWorkload: Record<string, number> = {};
    const supervisorNightCount: Record<string, number> = {};
    const supervisorConsecutiveDays: Record<string, number> = {};
    const supervisorLastShiftDate: Record<string, string | null> = {};
    const supervisorLastShiftType: Record<string, string | null> = {};
    const supervisorLastNightDate: Record<string, string | null> = {};

    for (const p of personnel) {
      workload[p.id] = 0;
      nightCount[p.id] = 0;
      consecutiveDays[p.id] = 0;
      lastShiftDate[p.id] = null;
      lastShiftType[p.id] = null;
      lastNightDate[p.id] = null;
    }

    for (const p of assistantPersonnel) {
      assistantWorkload[p.id] = 0;
      assistantNightCount[p.id] = 0;
      assistantConsecutiveDays[p.id] = 0;
      assistantLastShiftDate[p.id] = null;
      assistantLastShiftType[p.id] = null;
      assistantLastNightDate[p.id] = null;
    }

    for (const p of supervisorPersonnel) {
      supervisorWorkload[p.id] = 0;
      supervisorNightCount[p.id] = 0;
      supervisorConsecutiveDays[p.id] = 0;
      supervisorLastShiftDate[p.id] = null;
      supervisorLastShiftType[p.id] = null;
      supervisorLastNightDate[p.id] = null;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${dto.year}-${String(dto.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const week = this.weekKey(dateStr);
      const weekday = dayOfWeek(dateStr);
      const isWeekend = weekday === 0 || weekday === 6;
      const isHoliday = holidayDates.has(dateStr);
      const dayType = isWeekend ? 'weekend' : isHoliday ? 'holiday' : 'weekday';

      if (isWeekend && !options.includeWeekends) continue;

      const sharedAssistDone = new Set<string>();

      for (const device of devices) {
        if (!device.workDays.includes(weekday)) continue;
        if (deviceOffSet.has(`${device.id}:${dateStr}`)) continue;
        if (device.mode === 'polyclinic' && isHoliday) continue;
        if (device.mode === 'polyclinic' && isWeekend && !options.includeWeekends) continue;

        const techShiftDefs = techShiftsMap.get(device.id);
        const techShiftTypes = techShiftDefs && techShiftDefs.length > 0
          ? techShiftDefs
          : !devicesWithShiftDefs.has(device.id)
            ? this.getShiftTypesForDevice(device, dayType, options).map(s => ({
                id: '', deviceId: device.id, type: s,
                startTime: this.SHIFT_TIMES[s]?.startTime || '08:00',
                endTime: this.SHIFT_TIMES[s]?.endTime || '20:00',
                personnelType: 'technician',
              }))
            : [];

        for (const ts of techShiftTypes) {
          const shiftType = ts.type as 'day' | 'evening' | 'night';
          const shiftHours = this.shiftDurationHours(ts.startTime, ts.endTime);
          const available = this.findAvailablePersonnel(
            personnel, device, dateStr, shiftType, options,
            workload, nightCount, consecutiveDays, lastShiftDate, lastShiftType, assignments, personnelBlockedDates,
            weeklyHours, week, shiftHours, lastNightDate,
          );

          if (available.length === 0) {
            if (shiftType === 'day') {
              warnings.push(`${dateStr}: ${device.name} için uygun personel bulunamadı (${shiftType})`);
            }
            if (personnel.some(p => p.employmentStatus === 'active' && this.exceedsWeeklyHours(p, week, shiftHours, weeklyHours))) {
              warnings.push(`${dateStr}: MAX_WORK_EXCEEDED — haftalık çalışma limiti dolan personel var`);
            }
            continue;
          }

          const selected = this.scoreCandidates(available, workload, nightCount, shiftType, options.fairnessMode);

          assignments.push({
            personnelId: selected.id,
            personnelName: personnelMap.get(selected.id) || selected.id,
            personnelType: ts.personnelType || 'technician',
            deviceId: device.id,
            deviceCode: deviceCodeMap.get(device.id) || device.code,
            deviceName: deviceMap.get(device.id) || device.id,
            date: dateStr,
            shiftType,
            startTime: ts.startTime,
            endTime: ts.endTime,
          });

          workload[selected.id] = (workload[selected.id] || 0) + 1;
          (weeklyHours[week] ??= {})[selected.id] = (weeklyHours[week]?.[selected.id] || 0) + shiftHours;

          // P2-18 — evening is not a night shift; only nights anchor the 48h rule.
          if (shiftType === 'night') {
            nightCount[selected.id] = (nightCount[selected.id] || 0) + 1;
            lastNightDate[selected.id] = dateStr;
          } else {
            nightCount[selected.id] = 0;
          }

          if (lastShiftDate[selected.id] === dateStr) {
            consecutiveDays[selected.id] = (consecutiveDays[selected.id] || 0);
          } else {
            consecutiveDays[selected.id] = (consecutiveDays[selected.id] || 0) + 1;
          }
          lastShiftDate[selected.id] = dateStr;
          lastShiftType[selected.id] = shiftType;
        }

        const deviceAssistShifts = assistShiftsMap.get(device.id);
        if (deviceAssistShifts && deviceAssistShifts.length > 0 && assistantPersonnel.length > 0) {
          for (const ds of deviceAssistShifts) {
            const isOptionalDay = (ds.optionalOnWeekends && isWeekend) || (ds.optionalOnHolidays && isHoliday);
            if (isOptionalDay) {
              const enabled = overrideMap.has(`${ds.id}|${dateStr}`);
              if (!enabled) continue;
            }

            if (ds.blockId) {
              const sharedKey = `${ds.blockId}|${dateStr}|${ds.type}`;
              if (sharedAssistDone.has(sharedKey)) continue;
              sharedAssistDone.add(sharedKey);
            }

            const shiftHours = this.shiftDurationHours(ds.startTime, ds.endTime);
            const available = this.findAvailablePersonnel(
              assistantPersonnel, device, dateStr, ds.type, options,
              assistantWorkload, assistantNightCount, assistantConsecutiveDays,
              assistantLastShiftDate, assistantLastShiftType, assignments, personnelBlockedDates,
              assistantWeeklyHours, week, shiftHours, assistantLastNightDate,
            );

            if (available.length === 0) {
              if (ds.type === 'day') {
                warnings.push(`${dateStr}: ${device.name} için uygun yardımcı tekniker bulunamadı`);
              }
              if (assistantPersonnel.some(p => p.employmentStatus === 'active' && this.exceedsWeeklyHours(p, week, shiftHours, assistantWeeklyHours))) {
                warnings.push(`${dateStr}: MAX_WORK_EXCEEDED — haftalık çalışma limiti dolan yardımcı tekniker var`);
              }
              continue;
            }

            const selected = this.scoreCandidates(available, assistantWorkload, assistantNightCount, ds.type, options.fairnessMode);

            assignments.push({
              personnelId: selected.id,
              personnelName: assistantPersonnelMap.get(selected.id) || selected.id,
              personnelType: 'assistant_technician',
              deviceId: device.id,
              deviceCode: deviceCodeMap.get(device.id) || device.code,
              deviceName: deviceMap.get(device.id) || device.id,
              date: dateStr,
              shiftType: ds.type as 'day' | 'evening' | 'night',
              startTime: ds.startTime,
              endTime: ds.endTime,
            });

            assistantWorkload[selected.id] = (assistantWorkload[selected.id] || 0) + 1;
            (assistantWeeklyHours[week] ??= {})[selected.id] = (assistantWeeklyHours[week]?.[selected.id] || 0) + shiftHours;

            if (ds.type === 'night') {
              assistantNightCount[selected.id] = (assistantNightCount[selected.id] || 0) + 1;
              assistantLastNightDate[selected.id] = dateStr;
            } else {
              assistantNightCount[selected.id] = 0;
            }

            if (assistantLastShiftDate[selected.id] === dateStr) {
              assistantConsecutiveDays[selected.id] = (assistantConsecutiveDays[selected.id] || 0);
            } else {
              assistantConsecutiveDays[selected.id] = (assistantConsecutiveDays[selected.id] || 0) + 1;
            }
            assistantLastShiftDate[selected.id] = dateStr;
            assistantLastShiftType[selected.id] = ds.type;
          }
        }

        const deviceSupShifts = supervisorShiftsMap.get(device.id);
        if (deviceSupShifts && deviceSupShifts.length > 0 && supervisorPersonnel.length > 0) {
          for (const ds of deviceSupShifts) {
            const shiftHours = this.shiftDurationHours(ds.startTime, ds.endTime);
            const available = this.findAvailablePersonnel(
              supervisorPersonnel, device, dateStr, ds.type, options,
              supervisorWorkload, supervisorNightCount, supervisorConsecutiveDays,
              supervisorLastShiftDate, supervisorLastShiftType, assignments, personnelBlockedDates,
              supervisorWeeklyHours, week, shiftHours, supervisorLastNightDate,
            );

            if (available.length === 0) {
              if (ds.type === 'day') {
                warnings.push(`${dateStr}: ${device.name} için uygun süpervizör bulunamadı`);
              }
              if (supervisorPersonnel.some(p => p.employmentStatus === 'active' && this.exceedsWeeklyHours(p, week, shiftHours, supervisorWeeklyHours))) {
                warnings.push(`${dateStr}: MAX_WORK_EXCEEDED — haftalık çalışma limiti dolan süpervizör var`);
              }
              continue;
            }

            const selected = this.scoreCandidates(available, supervisorWorkload, supervisorNightCount, ds.type, options.fairnessMode);

            assignments.push({
              personnelId: selected.id,
              personnelName: supervisorPersonnelMap.get(selected.id) || selected.id,
              personnelType: 'supervisor',
              deviceId: device.id,
              deviceCode: deviceCodeMap.get(device.id) || device.code,
              deviceName: deviceMap.get(device.id) || device.id,
              date: dateStr,
              shiftType: ds.type as 'day' | 'evening' | 'night',
              startTime: ds.startTime,
              endTime: ds.endTime,
            });

            supervisorWorkload[selected.id] = (supervisorWorkload[selected.id] || 0) + 1;
            (supervisorWeeklyHours[week] ??= {})[selected.id] = (supervisorWeeklyHours[week]?.[selected.id] || 0) + shiftHours;

            if (ds.type === 'night') {
              supervisorNightCount[selected.id] = (supervisorNightCount[selected.id] || 0) + 1;
              supervisorLastNightDate[selected.id] = dateStr;
            } else {
              supervisorNightCount[selected.id] = 0;
            }

            if (supervisorLastShiftDate[selected.id] === dateStr) {
              supervisorConsecutiveDays[selected.id] = (supervisorConsecutiveDays[selected.id] || 0);
            } else {
              supervisorConsecutiveDays[selected.id] = (supervisorConsecutiveDays[selected.id] || 0) + 1;
            }
            supervisorLastShiftDate[selected.id] = dateStr;
            supervisorLastShiftType[selected.id] = ds.type;
          }
        }
      }

      for (const p of personnel) {
        const assignedToday = assignments.some(a => a.personnelId === p.id && a.date === dateStr);
        if (!assignedToday) {
          consecutiveDays[p.id] = 0;
        }
      }

      for (const p of assistantPersonnel) {
        const assignedToday = assignments.some(a => a.personnelId === p.id && a.date === dateStr);
        if (!assignedToday) {
          assistantConsecutiveDays[p.id] = 0;
        }
      }

      for (const p of supervisorPersonnel) {
        const assignedToday = assignments.some(a => a.personnelId === p.id && a.date === dateStr);
        if (!assignedToday) {
          supervisorConsecutiveDays[p.id] = 0;
        }
      }
    }

    const summary = {
      total: assignments.length,
      personnelCount: new Set(assignments.map(a => a.personnelId)).size,
      deviceCount: new Set(assignments.map(a => a.deviceId)).size,
      daysInMonth,
      avgPerPerson: allPersonnel.length > 0 ? (assignments.length / (allPersonnel.length || 1)).toFixed(1) : '0',
      technicianAssignments: assignments.filter(a => a.personnelType === 'technician').length,
      assistantAssignments: assignments.filter(a => a.personnelType === 'assistant_technician').length,
      supervisorAssignments: assignments.filter(a => a.personnelType === 'supervisor').length,
      warnings: warnings.length,
    };

    // PHASE 5C.26 P1-A2 — reflect the single authoritative coverage calculation
    // on the proposed plan (deterministic warnings + summary; never alters the set).
    if (this.coverageService) {
      const coverageInput: CoverageInput = {
        year: dto.year,
        month: dto.month,
        includeWeekends: options.includeWeekends,
        includeNightShifts: options.includeNightShifts,
        devices: devices.map(d => ({ id: d.id, name: d.name, mode: d.mode, workDays: d.workDays || [] })),
        shiftDefs: deviceShifts.map(ds => ({
          id: ds.id,
          deviceId: ds.deviceId,
          shiftType: ds.type,
          startTime: ds.startTime || undefined,
          endTime: ds.endTime || undefined,
          personnelType: ds.personnelType || 'technician',
          blockId: ds.blockId,
          optionalOnWeekends: ds.optionalOnWeekends,
          optionalOnHolidays: ds.optionalOnHolidays,
        })),
        holidays: holidayDates,
        deviceOffDates: deviceOffSet,
        shiftDateOverrides: overrideMap,
        technicianPersonnelCount: personnel.length,
        assistantPersonnelCount: assistantPersonnel.length,
        supervisorPersonnelCount: supervisorPersonnel.length,
        assignments: assignments.map(a => ({
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          personnelType: a.personnelType || 'technician',
        })),
        blockedPersonnelDates: personnelBlockedDates,
      };
      const coverageResult = this.coverageService.evaluateCoverage(coverageInput);
      for (const line of coverageResult.underCoverage.slice(0, 20)) {
        warnings.push(
          `Minimum kadro karşılanmıyor: ${line.deviceName} ${line.date} ${line.shiftType} (${line.personnelType}) — gerekli ${line.required}, atanmış ${line.assigned}.`,
        );
      }
      if (coverageResult.underCoverage.length > 20) {
        warnings.push(
          `Minimum kadro eksik: ${coverageResult.underCoverage.length - 20} kadro slotu daha doldurulmamış (toplam ${coverageResult.underCoverage.length}).`,
        );
      }
      (summary as any).coverage = {
        requiredSlots: coverageResult.requiredSlots,
        assignedSlots: coverageResult.assignedSlots,
        coveragePercent: coverageResult.coveragePercent,
        underCoveredSlots: coverageResult.underCoverage.length,
        uncoveredDates: coverageResult.uncoveredDates,
      };
    }

    return { assignments, summary, warnings };
  }

  async apply(dto: ApplyGeneratedScheduleDto, userId: string, user?: any) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: dto.scheduleId },
      select: {
        unitId: true,
        id: true,
        status: true,
        version: true,
        year: true,
        month: true,
        unit: { select: { organizationId: true } },
      },
    });
    if (!schedule) {
      throw new NotFoundException(`Schedule ${dto.scheduleId} not found`);
    }

    // PHASE 5C.25 P1-A5 — published/archived schedules are immutable.
    if (isPublished(schedule.status)) {
      throw new ConflictException(
        'Yayınlanmış programlara otomatik atama yapılamaz. Revizyon oluşturun.',
      );
    }

    const allowed = await this.unitScopeService.canAccessUnit(
      user,
      schedule.unitId,
      schedule.unit?.organizationId ?? null,
    );
    if (!allowed) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }

    const unitId = schedule.unitId;
    // Every bulk row carries the owning tenant explicitly. The Prisma tenant
    // middleware also stamps createMany, but explicit data keeps the invariant
    // true even when the write runs outside a request-scoped context (jobs).
    const organizationId =
      schedule.unit?.organizationId
      ?? user?.organizationId
      ?? tenantContext.getStore()?.organizationId
      ?? null;

    const existing = await this.prisma.assignment.findMany({
      where: { scheduleId: dto.scheduleId },
      select: { personnelId: true, deviceId: true, date: true, shiftType: true, personnelType: true },
      orderBy: [{ date: 'asc' }, { id: 'asc' }],
    });

    const personConflictSet = new Set(existing.map(e => `${e.personnelId}|${e.date}|${e.shiftType}`));
    const deviceConflictSet = new Set(existing.map(e => `${e.deviceId}|${e.date}|${e.shiftType}|${e.personnelType}`));

    // PHASE 5C.25 P1-A5 — optimistic-lock baseline for the version bump.
    const expectedVersion = dto.expectedVersion ?? schedule.version ?? 0;

    let skipped = 0;
    const candidateParams: Array<{
      personnelId: string;
      deviceId: string;
      unitId: string;
      kind: string;
      date: string;
      shiftType: string;
      startTime: string;
      endTime: string;
      personnelType: string;
    }> = [];

    for (const a of dto.assignments) {
      if (personConflictSet.has(`${a.personnelId}|${a.date}|${a.shiftType}`)) { skipped++; continue; }
      if (deviceConflictSet.has(`${a.deviceId}|${a.date}|${a.shiftType}|${a.personnelType || 'technician'}`)) { skipped++; continue; }

      candidateParams.push({
        personnelId: a.personnelId,
        deviceId: a.deviceId,
        unitId,
        kind: 'device',
        date: a.date,
        shiftType: a.shiftType,
        startTime: a.startTime,
        endTime: a.endTime,
        personnelType: a.personnelType || 'technician',
      });

      // PHASE 5C.25 P1-A5 — evolve the in-memory conflict sets so two candidates
      // inside the same batch can never collide (person or device double-booked).
      personConflictSet.add(`${a.personnelId}|${a.date}|${a.shiftType}`);
      deviceConflictSet.add(`${a.deviceId}|${a.date}|${a.shiftType}|${a.personnelType || 'technician'}`);
    }

    // P2-15 — one context load for the whole proposal. Every candidate is still
    // checked with the same engine, and any blocking rule rejects the ENTIRE
    // batch before a single row is written.
    const reports = await this.scheduleValidation.validateAssignmentsBatch(
      dto.scheduleId,
      candidateParams,
      { unitId, year: schedule.year, month: schedule.month },
    );
    for (const report of reports) {
      if (report.hasBlocking) {
        throw new ConflictException({
          message: 'Otomatik atama doğrulama hatası: engelleyici kural ihlali',
          violations: report.violations,
          hasBlocking: true,
          canOverride: false,
        });
      }
    }

    const toCreate: any[] = candidateParams.map(a => ({
      scheduleId: dto.scheduleId,
      organizationId,
      personnelId: a.personnelId,
      deviceId: a.deviceId,
      date: a.date,
      shiftType: a.shiftType,
      startTime: a.startTime,
      endTime: a.endTime,
      personnelType: a.personnelType,
    }));

    // PHASE 5C.28 P1-1 — mandatory minimum coverage is a HARD gate on the exact
    // final proposal (persisted assignments + this batch). Evaluate the merged
    // set through the single authoritative ScheduleCoverageService before any
    // row is written; under-coverage rejects the ENTIRE apply (409, canOverride
    // false) so an unresolved schedule is never persisted via auto-apply.
    let coverageSummary:
      | {
          requiredSlots: number;
          assignedSlots: number;
          coveragePercent: number;
          underCoveredSlots: number;
          uncoveredDates: string[];
        }
      | undefined;

    if (this.coverageService && toCreate.length > 0) {
      const coverage = await this.coverageService.evaluateScheduleCoverage(
        { unitId, scheduleId: dto.scheduleId, year: schedule.year, month: schedule.month },
        toCreate.map(a => ({
          personnelId: a.personnelId,
          deviceId: a.deviceId,
          date: a.date,
          shiftType: a.shiftType,
          personnelType: a.personnelType || 'technician',
        })),
      );

      coverageSummary = {
        requiredSlots: coverage.requiredSlots,
        assignedSlots: coverage.assignedSlots,
        coveragePercent: coverage.coveragePercent,
        underCoveredSlots: coverage.underCoverage.length,
        uncoveredDates: coverage.uncoveredDates,
      };

      if (coverage.underCoverage.length > 0) {
        const example = coverage.underCoverage[0];
        throw new ConflictException({
          statusCode: 409,
          message:
            `Otomatik atama reddedildi: ${coverage.underCoverage.length} vardiya kadrosu minimum personel sayısını karşılamıyor ` +
            `(gerekli ${coverage.requiredSlots}, karşılanan ${coverage.assignedSlots}; ör. ${example.deviceName} ${example.date} ${example.shiftType} ${example.personnelType} → gerekli ${example.required}, atanmış ${example.assigned}). ` +
            `Eksik kadroları doldurup tekrar deneyin.`,
          canOverride: false,
          hasBlocking: true,
          coverage: coverageSummary,
        });
      }
    }

    let created = 0;
    if (toCreate.length > 0) {
      // P3-09 — provenance is server-derived. The client DTO never carries
      // actor, time, algorithm, score or coverage metadata; all of it is
      // computed here and persisted in the SAME transaction as the CAS bump
      // and the assignment inserts. A concurrent writer can no longer produce
      // a snapshot that describes a different schedule version.
      const generatedAt = new Date().toISOString();

      await this.prisma.$transaction(async (tx) => {
        // Atomic CAS version bump BEFORE the inserts: any concurrent writer that
        // already bumped the version makes this fail and rolls back the batch.
        const cas = await tx.schedule.updateMany({
          where: { id: dto.scheduleId, version: expectedVersion },
          data: { version: { increment: 1 } },
        });
        if (cas.count === 0) {
          throw new ConflictException(
            `Program ${dto.scheduleId} versiyonu eşzamanlı olarak değişmiş (beklenen ${expectedVersion}). Lütfen güncel sürümle tekrar deneyin.`,
          );
        }
        await tx.assignment.createMany({ data: toCreate });

        // Authoritative names/codes come from the persisted rows, not from the
        // client proposal. The assignment set is also the exact final state the
        // snapshot must describe.
        const persisted = await tx.assignment.findMany({
          where: { scheduleId: dto.scheduleId },
          include: {
            personnel: { select: { name: true } },
            device: { select: { name: true, code: true } },
          },
          orderBy: [{ date: 'asc' }, { id: 'asc' }],
        });

        const lastSnapshot = await tx.scheduleSnapshot.findFirst({
          where: { scheduleId: dto.scheduleId },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        // Same rule as SchedulesWorkflowService.createSnapshot(): never reuse
        // a version, and never write a snapshot older than the schedule row.
        const nextVersion = Math.max(
          expectedVersion + 1,
          (lastSnapshot?.version ?? 0) + 1,
        );

        await tx.scheduleSnapshot.create({
          data: {
            scheduleId: dto.scheduleId,
            version: nextVersion,
            createdById: userId,
            data: {
              assignments: persisted.map(a => ({
                id: a.id,
                personnelId: a.personnelId,
                personnelName: a.personnel?.name ?? '',
                deviceId: a.deviceId,
                deviceCode: a.device?.code ?? null,
                unitId: a.unitId,
                personnelGroupId: a.personnelGroupId,
                shiftTemplateId: a.shiftTemplateId,
                kind: String(a.kind),
                date: a.date,
                shiftType: String(a.shiftType),
                startTime: a.startTime,
                endTime: a.endTime,
                personnelType: a.personnelType,
                isConfirmed: a.isConfirmed,
              })),
              metadata: {
                totalAssignments: persisted.length,
                totalWorkingDays: new Set(persisted.map(a => a.date)).size,
                personnelCount: new Set(persisted.map(a => a.personnelId)).size,
                deviceCount: new Set(
                  persisted.map(a => a.deviceId).filter((id): id is string => Boolean(id)),
                ).size,
                coveragePercent: coverageSummary?.coveragePercent ?? 0,
                generatedBy: userId,
                generatedAt,
                algorithm: 'auto-generator.apply',
                score: coverageSummary?.coveragePercent ?? 0,
                ...(coverageSummary
                  ? {
                      coverage: {
                        requiredSlots: coverageSummary.requiredSlots,
                        assignedSlots: coverageSummary.assignedSlots,
                        coveragePercent: coverageSummary.coveragePercent,
                        underCoveredSlots: coverageSummary.underCoveredSlots,
                      },
                    }
                  : {}),
              },
            },
          },
        });
      });
      created = toCreate.length;
    }

    return { created, skipped, message: `${created} vardiya oluşturuldu, ${skipped} atlandı (çakışma)` };
  }

  private async loadPersonnel(unitId: string): Promise<PersonnelInfo[]> {
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
      // P2-10 — deterministic personnel order independent of insertion order.
      orderBy: [{ seniority: 'desc' }, { id: 'asc' }],
    });
    return records.filter(r => r.employmentStatus === 'active');
  }

  private async loadDevices(unitId: string): Promise<DeviceInfo[]> {
    return this.prisma.device.findMany({
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
  }

  private async loadHolidays(year: number, month: number): Promise<{ date: string; name: string }[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const holidays = await this.prisma.holiday.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      select: { date: true, name: true },
      orderBy: [{ date: 'asc' }, { name: 'asc' }],
    });
    return holidays;
  }

  private async loadDeviceShifts(unitId: string): Promise<DeviceShiftInfo[]> {
    const shifts = await this.prisma.shifts.findMany({
      where: {
        deviceId: { not: null },
        isActive: true,
        unitId,
      },
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
    return shifts.filter(s => s.deviceId !== null).map(s => ({
      id: s.id,
      deviceId: s.deviceId!,
      type: s.type,
      startTime: s.startTime || '',
      endTime: s.endTime || '',
      personnelType: s.personnelType || 'technician',
      blockId: s.blockId,
      optionalOnWeekends: s.optionalOnWeekends,
      optionalOnHolidays: s.optionalOnHolidays,
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

  /** P2-11 — derive worked hours from local shift strings (no UTC conversion). */
  private shiftDurationHours(startTime: string, endTime: string): number {
    const toMinutes = (value: string): number => {
      const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
      if (!match) return 0;
      const hours = Number(match[1]);
      const minutes = Number(match[2]);
      if (hours > 23 || minutes > 59) return 0;
      return hours * 60 + minutes;
    };
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);
    if (start === 0 && end === 0) return 0;
    const duration = end > start ? end - start : end + 24 * 60 - start;
    return duration / 60;
  }

  /** P2-11/P2-12 — Monday-based local week key via the shared calendar helper. */
  private weekKey(dateStr: string): string {
    return startOfWeek(dateStr);
  }

  private exceedsWeeklyHours(
    p: PersonnelInfo,
    week: string,
    hours: number,
    weeklyHours: Record<string, Record<string, number>>,
  ): boolean {
    if (!p.maxWeeklyHours || p.maxWeeklyHours <= 0) return false;
    return (weeklyHours[week]?.[p.id] || 0) + hours > p.maxWeeklyHours;
  }

  private getShiftTypesForDevice(device: DeviceInfo, dayType: string, options: any): Array<'day' | 'evening' | 'night'> {
    if (device.mode === 'polyclinic') return ['day'];
    if (!options.includeNightShifts) return ['day'];
    if (dayType === 'weekend' || dayType === 'holiday') return ['day'];
    return ['day', 'evening', 'night'];
  }

  private findAvailablePersonnel(
    personnel: PersonnelInfo[],
    device: DeviceInfo,
    dateStr: string,
    shiftType: string,
    options: any,
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    consecutiveDays: Record<string, number>,
    lastShiftDate: Record<string, string | null>,
    lastShiftType: Record<string, string | null>,
    existingAssignments: GeneticAssignment[],
    blockedDates: Map<string, Set<string>>,
    weeklyHours: Record<string, Record<string, number>>,
    week: string,
    shiftHours: number,
    lastNightDate?: Record<string, string | null>,
  ): PersonnelInfo[] {
    return personnel.filter(p => {
      if (p.employmentStatus !== 'active') return false;

      // P2-11 — maxWeeklyHours is a hard per-calendar-week cap, not a suggestion.
      if (this.exceedsWeeklyHours(p, week, shiftHours, weeklyHours)) return false;

      // Phase 5C.23: authoritative eligibility — explicit date availability rows
      // take precedence over weekly offDays (AVAILABLE overrides a weekly off-day).
      if (blockedDates.get(p.id)?.has(dateStr)) return false;

      if ((shiftType === 'night' || shiftType === 'evening') && !p.nightShiftEligible) return false;

      if (device.requiredSkills.length > 0) {
        const hasSkill = device.requiredSkills.some(s => p.skills.includes(s) || p.deviceSkills.includes(s));
        if (!hasSkill) return false;
      }

      const alreadyAssigned = existingAssignments.some(a =>
        a.personnelId === p.id && a.date === dateStr,
      );
      if (alreadyAssigned) return false;

      const alreadyOnShift = existingAssignments.some(a =>
        a.personnelId === p.id && a.date === dateStr && a.shiftType === shiftType,
      );
      if (alreadyOnShift) return false;

      if (lastShiftDate[p.id] && lastShiftType[p.id]) {
        const prevDate = new Date(lastShiftDate[p.id]!);
        const currDate = new Date(dateStr);
        const diffHours = (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);

        if (lastShiftType[p.id] === 'night' && shiftType === 'day') {
          if (diffHours < 24) return false;
        }

        if (diffHours < options.minRestHours) return false;
      }

      // P2-18 — DDD canonical: 48h between consecutive nights, measured from
      // the last real night even when day/evening shifts happened in between.
      // `evening` is no longer counted as a night and no longer inherits the
      // night-streak cap.
      if (shiftType === 'night') {
        const previousNight = lastNightDate?.[p.id];
        if (previousNight && daysBetweenKeys(previousNight, dateStr) < 2) return false;
        if ((nightCount[p.id] || 0) >= options.maxConsecutiveNights) return false;
      }

      if (consecutiveDays[p.id] >= options.maxConsecutiveDays) return false;

      const currentWorkload = workload[p.id] || 0;
      const daysInMonth = new Date(options.year || 2026, options.month || 1, 0).getDate();
      // P2-11 — `??` keeps an explicit maxOvertime: 0; `||` silently restored 20.
      const maxShifts = Math.ceil(daysInMonth / 2) + (options.maxOvertime ?? 20);
      if (currentWorkload >= maxShifts) return false;

      return true;
    });
  }

  private scoreCandidates(
    candidates: PersonnelInfo[],
    workload: Record<string, number>,
    nightCount: Record<string, number>,
    shiftType: string,
    fairnessMode: string,
  ): PersonnelInfo {
    const scored = candidates.map(p => {
      let score = 1000 - (workload[p.id] || 0) * 10;

      if (shiftType === 'night' || shiftType === 'evening') {
        score -= (nightCount[p.id] || 0) * 20;
      }

      if (fairnessMode === 'seniority') {
        // P2-10 — use the real Personnel.seniority field. The old positional
        // `candidates.indexOf(p) % 5` made the winner depend on DB insertion order.
        score += Math.min(Math.max(p.seniority || 0, 0), 20);
      } else if (fairnessMode === 'skill') {
        score += p.skills.length * 3 + p.deviceSkills.length * 5;
      }

      return { person: p, score };
    });

    // P2-10 — stable id tie-break so equal scores never depend on input order.
    scored.sort((a, b) => b.score - a.score || a.person.id.localeCompare(b.person.id));
    return scored[0].person;
  }
}
