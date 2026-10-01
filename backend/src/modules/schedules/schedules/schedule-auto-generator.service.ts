import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import {
  GenerateScheduleDto,
  ApplyGeneratedScheduleDto,
} from './dto/generate-schedule.dto';

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

  private readonly SHIFT_TIMES: Record<
    string,
    { startTime: string; endTime: string }
  > = {
    day: { startTime: '08:00', endTime: '16:00' },
    evening: { startTime: '16:00', endTime: '00:00' },
    night: { startTime: '00:00', endTime: '08:00' },
  };

  constructor(private prisma: PrismaService) {}

  async preview(userId: string, dto: GenerateScheduleDto) {
    const result = await this.generate(userId, dto);
    return {
      message: `${result.assignments.length} vardiya oluşturuldu`,
      summary: result.summary,
      assignments: result.assignments,
      warnings: result.warnings,
    };
  }

  async generate(userId: string, dto: GenerateScheduleDto) {
    const unit = await this.prisma.unit.findFirst({
      where: { type: dto.unitType as any },
    });
    if (!unit) throw new NotFoundException(`Birim bulunamadı: ${dto.unitType}`);

    const options = {
      fairnessMode: dto.fairnessMode || 'balanced',
      maxOvertime: dto.maxOvertime ?? 20,
      includeWeekends: dto.includeWeekends ?? true,
      includeNightShifts: dto.includeNightShifts ?? true,
      minRestHours: dto.minRestHours ?? 11,
      maxConsecutiveDays: dto.maxConsecutiveDays ?? 6,
      maxConsecutiveNights: dto.maxConsecutiveNights ?? 3,
      unitId: unit.id,
    };

    const [allPersonnel, devices, holidays] = await Promise.all([
      this.loadPersonnel(unit.id),
      this.loadDevices(unit.id),
      this.loadHolidays(dto.year, dto.month),
    ]);
    const personnel = allPersonnel.filter(
      (p) => p.role === 'technician' || p.role === 'senior_technician',
    );
    const assistantPersonnel = allPersonnel.filter(
      (p) => p.role === 'assistant_technician',
    );
    const supervisorPersonnel = allPersonnel.filter(
      (p) => p.role === 'supervisor',
    );

    const personnelMap = new Map(personnel.map((p) => [p.id, p.name]));
    const deviceMap = new Map(devices.map((d) => [d.id, d.name]));
    const deviceCodeMap = new Map(devices.map((d) => [d.id, d.code]));
    const assistantPersonnelMap = new Map(
      assistantPersonnel.map((p) => [p.id, p.name]),
    );
    const supervisorPersonnelMap = new Map(
      supervisorPersonnel.map((p) => [p.id, p.name]),
    );

    if (
      personnel.length === 0 &&
      assistantPersonnel.length === 0 &&
      supervisorPersonnel.length === 0
    ) {
      return {
        assignments: [],
        summary: { total: 0, warnings: ['Birimde aktif personel bulunamadı'] },
        warnings: ['Birimde aktif personel bulunamadı'],
      };
    }

    if (devices.length === 0) {
      return {
        assignments: [],
        summary: { total: 0, warnings: ['Birimde aktif cihaz bulunamadı'] },
        warnings: ['Birimde aktif cihaz bulunamadı'],
      };
    }

    const deviceShifts = await this.loadDeviceShifts(unit.id);
    const techShiftsMap = new Map<string, DeviceShiftInfo[]>();
    const assistShiftsMap = new Map<string, DeviceShiftInfo[]>();
    const supervisorShiftsMap = new Map<string, DeviceShiftInfo[]>();
    for (const ds of deviceShifts) {
      let targetMap: Map<string, DeviceShiftInfo[]>;
      if (ds.personnelType === 'assistant_technician')
        targetMap = assistShiftsMap;
      else if (ds.personnelType === 'supervisor')
        targetMap = supervisorShiftsMap;
      else if (
        !ds.personnelType ||
        ds.personnelType === 'technician' ||
        ds.personnelType === 'senior_technician' ||
        ds.personnelType.startsWith('technician_')
      )
        targetMap = techShiftsMap;
      else continue;
      const existing = targetMap.get(ds.deviceId) || [];
      existing.push(ds);
      targetMap.set(ds.deviceId, existing);
    }

    const holidayDates = new Set(holidays.map((h) => h.date));
    const overrideMap = await this.loadShiftOverrides(dto.year, dto.month);
    const devicesWithShiftDefs = new Set(deviceShifts.map((ds) => ds.deviceId));
    const daysInMonth = new Date(dto.year, dto.month, 0).getDate();

    const workload: Record<string, number> = {};
    const nightCount: Record<string, number> = {};
    const consecutiveDays: Record<string, number> = {};
    const lastShiftDate: Record<string, string | null> = {};
    const lastShiftType: Record<string, string | null> = {};
    const assignments: GeneticAssignment[] = [];
    const warnings: string[] = [];

    const assistantWorkload: Record<string, number> = {};
    const assistantNightCount: Record<string, number> = {};
    const assistantConsecutiveDays: Record<string, number> = {};
    const assistantLastShiftDate: Record<string, string | null> = {};
    const assistantLastShiftType: Record<string, string | null> = {};

    const supervisorWorkload: Record<string, number> = {};
    const supervisorNightCount: Record<string, number> = {};
    const supervisorConsecutiveDays: Record<string, number> = {};
    const supervisorLastShiftDate: Record<string, string | null> = {};
    const supervisorLastShiftType: Record<string, string | null> = {};

    for (const p of personnel) {
      workload[p.id] = 0;
      nightCount[p.id] = 0;
      consecutiveDays[p.id] = 0;
      lastShiftDate[p.id] = null;
      lastShiftType[p.id] = null;
    }

    for (const p of assistantPersonnel) {
      assistantWorkload[p.id] = 0;
      assistantNightCount[p.id] = 0;
      assistantConsecutiveDays[p.id] = 0;
      assistantLastShiftDate[p.id] = null;
      assistantLastShiftType[p.id] = null;
    }

    for (const p of supervisorPersonnel) {
      supervisorWorkload[p.id] = 0;
      supervisorNightCount[p.id] = 0;
      supervisorConsecutiveDays[p.id] = 0;
      supervisorLastShiftDate[p.id] = null;
      supervisorLastShiftType[p.id] = null;
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${dto.year}-${String(dto.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dateObj = new Date(dateStr);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHoliday = holidayDates.has(dateStr);
      const dayType = isWeekend ? 'weekend' : isHoliday ? 'holiday' : 'weekday';

      if (isWeekend && !options.includeWeekends) continue;

      const sharedAssistDone = new Set<string>();

      for (const device of devices) {
        if (!device.workDays.includes(dayOfWeek)) continue;
        if (device.mode === 'polyclinic' && isHoliday) continue;
        if (
          device.mode === 'polyclinic' &&
          isWeekend &&
          !options.includeWeekends
        )
          continue;

        const techShiftDefs = techShiftsMap.get(device.id);
        const techShiftTypes =
          techShiftDefs && techShiftDefs.length > 0
            ? techShiftDefs
            : !devicesWithShiftDefs.has(device.id)
              ? this.getShiftTypesForDevice(device, dayType, options).map(
                  (s) => ({
                    id: '',
                    deviceId: device.id,
                    type: s,
                    startTime: this.SHIFT_TIMES[s]?.startTime || '08:00',
                    endTime: this.SHIFT_TIMES[s]?.endTime || '20:00',
                    personnelType: 'technician',
                  }),
                )
              : [];

        for (const ts of techShiftTypes) {
          const shiftType = ts.type as 'day' | 'evening' | 'night';
          const available = this.findAvailablePersonnel(
            personnel,
            device,
            dateStr,
            shiftType,
            options,
            workload,
            nightCount,
            consecutiveDays,
            lastShiftDate,
            lastShiftType,
            assignments,
          );

          if (available.length === 0) {
            if (shiftType === 'day') {
              warnings.push(
                `${dateStr}: ${device.name} için uygun personel bulunamadı (${shiftType})`,
              );
            }
            continue;
          }

          const selected = this.scoreCandidates(
            available,
            workload,
            nightCount,
            shiftType,
            options.fairnessMode,
          );

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

          if (shiftType === 'night' || shiftType === 'evening') {
            nightCount[selected.id] = (nightCount[selected.id] || 0) + 1;
          } else {
            nightCount[selected.id] = 0;
          }

          if (lastShiftDate[selected.id] === dateStr) {
            consecutiveDays[selected.id] = consecutiveDays[selected.id] || 0;
          } else {
            consecutiveDays[selected.id] =
              (consecutiveDays[selected.id] || 0) + 1;
          }
          lastShiftDate[selected.id] = dateStr;
          lastShiftType[selected.id] = shiftType;
        }

        const deviceAssistShifts = assistShiftsMap.get(device.id);
        if (
          deviceAssistShifts &&
          deviceAssistShifts.length > 0 &&
          assistantPersonnel.length > 0
        ) {
          for (const ds of deviceAssistShifts) {
            const isOptionalDay =
              (ds.optionalOnWeekends && isWeekend) ||
              (ds.optionalOnHolidays && isHoliday);
            if (isOptionalDay) {
              const enabled = overrideMap.has(`${ds.id}|${dateStr}`);
              if (!enabled) continue;
            }

            if (ds.blockId) {
              const sharedKey = `${ds.blockId}|${dateStr}|${ds.type}`;
              if (sharedAssistDone.has(sharedKey)) continue;
              sharedAssistDone.add(sharedKey);
            }

            const available = this.findAvailablePersonnel(
              assistantPersonnel,
              device,
              dateStr,
              ds.type,
              options,
              assistantWorkload,
              assistantNightCount,
              assistantConsecutiveDays,
              assistantLastShiftDate,
              assistantLastShiftType,
              assignments,
            );

            if (available.length === 0) {
              if (ds.type === 'day') {
                warnings.push(
                  `${dateStr}: ${device.name} için uygun yardımcı tekniker bulunamadı`,
                );
              }
              continue;
            }

            const selected = this.scoreCandidates(
              available,
              assistantWorkload,
              assistantNightCount,
              ds.type,
              options.fairnessMode,
            );

            assignments.push({
              personnelId: selected.id,
              personnelName:
                assistantPersonnelMap.get(selected.id) || selected.id,
              personnelType: 'assistant_technician',
              deviceId: device.id,
              deviceCode: deviceCodeMap.get(device.id) || device.code,
              deviceName: deviceMap.get(device.id) || device.id,
              date: dateStr,
              shiftType: ds.type as 'day' | 'evening' | 'night',
              startTime: ds.startTime,
              endTime: ds.endTime,
            });

            assistantWorkload[selected.id] =
              (assistantWorkload[selected.id] || 0) + 1;

            if (ds.type === 'night' || ds.type === 'evening') {
              assistantNightCount[selected.id] =
                (assistantNightCount[selected.id] || 0) + 1;
            } else {
              assistantNightCount[selected.id] = 0;
            }

            if (assistantLastShiftDate[selected.id] === dateStr) {
              assistantConsecutiveDays[selected.id] =
                assistantConsecutiveDays[selected.id] || 0;
            } else {
              assistantConsecutiveDays[selected.id] =
                (assistantConsecutiveDays[selected.id] || 0) + 1;
            }
            assistantLastShiftDate[selected.id] = dateStr;
            assistantLastShiftType[selected.id] = ds.type;
          }
        }

        const deviceSupShifts = supervisorShiftsMap.get(device.id);
        if (
          deviceSupShifts &&
          deviceSupShifts.length > 0 &&
          supervisorPersonnel.length > 0
        ) {
          for (const ds of deviceSupShifts) {
            const available = this.findAvailablePersonnel(
              supervisorPersonnel,
              device,
              dateStr,
              ds.type,
              options,
              supervisorWorkload,
              supervisorNightCount,
              supervisorConsecutiveDays,
              supervisorLastShiftDate,
              supervisorLastShiftType,
              assignments,
            );

            if (available.length === 0) {
              if (ds.type === 'day') {
                warnings.push(
                  `${dateStr}: ${device.name} için uygun süpervizör bulunamadı`,
                );
              }
              continue;
            }

            const selected = this.scoreCandidates(
              available,
              supervisorWorkload,
              supervisorNightCount,
              ds.type,
              options.fairnessMode,
            );

            assignments.push({
              personnelId: selected.id,
              personnelName:
                supervisorPersonnelMap.get(selected.id) || selected.id,
              personnelType: 'supervisor',
              deviceId: device.id,
              deviceCode: deviceCodeMap.get(device.id) || device.code,
              deviceName: deviceMap.get(device.id) || device.id,
              date: dateStr,
              shiftType: ds.type as 'day' | 'evening' | 'night',
              startTime: ds.startTime,
              endTime: ds.endTime,
            });

            supervisorWorkload[selected.id] =
              (supervisorWorkload[selected.id] || 0) + 1;

            if (ds.type === 'night' || ds.type === 'evening') {
              supervisorNightCount[selected.id] =
                (supervisorNightCount[selected.id] || 0) + 1;
            } else {
              supervisorNightCount[selected.id] = 0;
            }

            if (supervisorLastShiftDate[selected.id] === dateStr) {
              supervisorConsecutiveDays[selected.id] =
                supervisorConsecutiveDays[selected.id] || 0;
            } else {
              supervisorConsecutiveDays[selected.id] =
                (supervisorConsecutiveDays[selected.id] || 0) + 1;
            }
            supervisorLastShiftDate[selected.id] = dateStr;
            supervisorLastShiftType[selected.id] = ds.type;
          }
        }
      }

      for (const p of personnel) {
        const assignedToday = assignments.some(
          (a) => a.personnelId === p.id && a.date === dateStr,
        );
        if (!assignedToday) {
          consecutiveDays[p.id] = 0;
        }
      }

      for (const p of assistantPersonnel) {
        const assignedToday = assignments.some(
          (a) => a.personnelId === p.id && a.date === dateStr,
        );
        if (!assignedToday) {
          assistantConsecutiveDays[p.id] = 0;
        }
      }

      for (const p of supervisorPersonnel) {
        const assignedToday = assignments.some(
          (a) => a.personnelId === p.id && a.date === dateStr,
        );
        if (!assignedToday) {
          supervisorConsecutiveDays[p.id] = 0;
        }
      }
    }

    const summary = {
      total: assignments.length,
      personnelCount: new Set(assignments.map((a) => a.personnelId)).size,
      deviceCount: new Set(assignments.map((a) => a.deviceId)).size,
      daysInMonth,
      avgPerPerson:
        allPersonnel.length > 0
          ? (assignments.length / (allPersonnel.length || 1)).toFixed(1)
          : '0',
      technicianAssignments: assignments.filter(
        (a) => a.personnelType === 'technician',
      ).length,
      assistantAssignments: assignments.filter(
        (a) => a.personnelType === 'assistant_technician',
      ).length,
      supervisorAssignments: assignments.filter(
        (a) => a.personnelType === 'supervisor',
      ).length,
      warnings: warnings.length,
    };

    return { assignments, summary, warnings };
  }

  async apply(dto: ApplyGeneratedScheduleDto, userId: string) {
    const existing = await this.prisma.assignment.findMany({
      where: { scheduleId: dto.scheduleId },
      select: {
        personnelId: true,
        deviceId: true,
        date: true,
        shiftType: true,
        personnelType: true,
      },
    });

    const personConflictSet = new Set(
      existing.map((e) => `${e.personnelId}|${e.date}|${e.shiftType}`),
    );
    const deviceConflictSet = new Set(
      existing.map(
        (e) => `${e.deviceId}|${e.date}|${e.shiftType}|${e.personnelType}`,
      ),
    );

    const toCreate: any[] = [];
    let skipped = 0;

    for (const a of dto.assignments) {
      if (personConflictSet.has(`${a.personnelId}|${a.date}|${a.shiftType}`)) {
        skipped++;
        continue;
      }
      if (
        deviceConflictSet.has(
          `${a.deviceId}|${a.date}|${a.shiftType}|${a.personnelType || 'technician'}`,
        )
      ) {
        skipped++;
        continue;
      }
      toCreate.push({
        scheduleId: dto.scheduleId,
        personnelId: a.personnelId,
        deviceId: a.deviceId,
        date: a.date,
        shiftType: a.shiftType,
        startTime: a.startTime,
        endTime: a.endTime,
        personnelType: a.personnelType || 'technician',
      });
    }

    let created = 0;
    if (toCreate.length > 0) {
      const result = await this.prisma.assignment.createMany({
        data: toCreate,
      });
      created = result.count;
    }

    if (created > 0) {
      await this.prisma.schedule.update({
        where: { id: dto.scheduleId },
        data: { version: { increment: 1 } },
      });
    }

    return {
      created,
      skipped,
      message: `${created} vardiya oluşturuldu, ${skipped} atlandı (çakışma)`,
    };
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
      },
    });
    return records.filter((r) => r.employmentStatus === 'active');
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
    });
  }

  private async loadHolidays(
    year: number,
    month: number,
  ): Promise<{ date: string; name: string }[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const holidays = await this.prisma.holiday.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
      },
      select: { date: true, name: true },
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
    });
    return shifts
      .filter((s) => s.deviceId !== null)
      .map((s) => ({
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

  private async loadShiftOverrides(
    year: number,
    month: number,
  ): Promise<Set<string>> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
    const overrides = await this.prisma.shiftDateOverride.findMany({
      where: {
        date: { gte: startDate, lte: endDate },
        isEnabled: true,
      },
      select: { shiftId: true, date: true },
    });
    return new Set(overrides.map((o) => `${o.shiftId}|${o.date}`));
  }

  private getShiftTypesForDevice(
    device: DeviceInfo,
    dayType: string,
    options: any,
  ): Array<'day' | 'evening' | 'night'> {
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
  ): PersonnelInfo[] {
    const dateObj = new Date(dateStr);
    const dayOfWeek = dateObj.getDay();

    return personnel.filter((p) => {
      if (p.employmentStatus !== 'active') return false;

      if (p.offDays.includes(dayOfWeek)) return false;

      if (
        (shiftType === 'night' || shiftType === 'evening') &&
        !p.nightShiftEligible
      )
        return false;

      if (device.requiredSkills.length > 0) {
        const hasSkill = device.requiredSkills.some(
          (s) => p.skills.includes(s) || p.deviceSkills.includes(s),
        );
        if (!hasSkill) return false;
      }

      const alreadyAssigned = existingAssignments.some(
        (a) => a.personnelId === p.id && a.date === dateStr,
      );
      if (alreadyAssigned) return false;

      const alreadyOnShift = existingAssignments.some(
        (a) =>
          a.personnelId === p.id &&
          a.date === dateStr &&
          a.shiftType === shiftType,
      );
      if (alreadyOnShift) return false;

      if (lastShiftDate[p.id] && lastShiftType[p.id]) {
        const prevDate = new Date(lastShiftDate[p.id]!);
        const currDate = new Date(dateStr);
        const diffHours =
          (currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60);

        if (lastShiftType[p.id] === 'night' && shiftType === 'day') {
          if (diffHours < 24) return false;
        }

        if (diffHours < options.minRestHours) return false;
      }

      if (shiftType === 'night' || shiftType === 'evening') {
        const nightStreak = nightCount[p.id] || 0;
        if (nightStreak >= options.maxConsecutiveNights) return false;
      }

      if (consecutiveDays[p.id] >= options.maxConsecutiveDays) return false;

      const currentWorkload = workload[p.id] || 0;
      const daysInMonth = new Date(
        options.year || 2026,
        options.month || 1,
        0,
      ).getDate();
      const maxShifts =
        Math.ceil(daysInMonth / 2) + (options.maxOvertime || 20);
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
    const scored = candidates.map((p) => {
      let score = 1000 - (workload[p.id] || 0) * 10;

      if (shiftType === 'night' || shiftType === 'evening') {
        score -= (nightCount[p.id] || 0) * 20;
      }

      if (fairnessMode === 'seniority') {
        score += (candidates.indexOf(p) % 5) * 5;
      } else if (fairnessMode === 'skill') {
        score += p.skills.length * 3 + p.deviceSkills.length * 5;
      }

      return { person: p, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0].person;
  }
}
