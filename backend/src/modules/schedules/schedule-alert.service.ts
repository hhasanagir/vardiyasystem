import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleCoverageService } from './services/schedule-coverage.service';
import { toCoverageAssignmentInput } from './domain/coverage/coverage-input-mapper';
import { CoverageAssignmentInput } from './domain/coverage/coverage-types';

export interface ScheduleAlert {
  type: 'missing_staff' | 'understaffed' | 'double_booking' | 'overtime' | 'consecutive_night' | 'unassigned_critical' | 'workload_imbalance' | 'shift_threshold';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  unit: string;
  date?: string;
  personnelId?: string;
  personnelName?: string;
  deviceId?: string;
  deviceName?: string;
}

@Injectable()
export class ScheduleAlertService {
  constructor(
    private prisma: PrismaService,
    private coverageService: ScheduleCoverageService,
  ) {}

  async getAlerts(scheduleId: string): Promise<ScheduleAlert[]> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: {
        unit: true,
        assignments: {
          include: { personnel: true, device: true },
        },
      },
    });

    if (!schedule) return [];

    const alerts: ScheduleAlert[] = [];
    const unitType = (schedule.unit?.type?.toLowerCase() || 'unknown') as string;
    const assignments = schedule.assignments;

    const monthNames = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

    /**
     * P3-11 — `missing_staff` is derived from CoverageEngine, the single source
     * of truth. WorkDays, holidays, device-off dates, shift-date overrides,
     * weekend flags and personnel availability are already applied by the
     * authoritative loader; this service no longer invents a 1-per-device/per-day
     * requirement that would alarm on closed weekends, holidays and off dates.
     */
    const coverage = await this.coverageService.evaluateScheduleCoverage({
      unitId: schedule.unitId,
      scheduleId,
      year: schedule.year,
      month: schedule.month,
    });

    for (const line of coverage.underCoverage) {
      alerts.push({
        type: 'missing_staff',
        severity: 'warning',
        message:
          `${line.deviceName} ${this.getShiftLabel(line.shiftType)} vardiyasında personel eksik ` +
          `(${line.date}) — gerekli ${line.required}, atanmış ${line.assigned}`,
        unit: unitType,
        date: line.date,
        deviceId: line.deviceId,
        deviceName: line.deviceName,
      });
    }

    // Double-booking detection stays row-based (it is not a coverage rule), but
    // the slot key is normalised through the shared coverage mapper so aliases
    // (Turkish shift names, DutyRoster roles) cannot split one logical slot.
    const slotAssignments = new Map<string, CoverageAssignmentInput[]>();
    for (const a of assignments) {
      const mapped = toCoverageAssignmentInput(a);
      if (!mapped) continue;
      const key = [mapped.deviceId, mapped.date, mapped.shiftType, mapped.personnelType].join('|');
      const bucket = slotAssignments.get(key) || [];
      bucket.push(mapped);
      slotAssignments.set(key, bucket);
    }
    const personnelNameById = new Map(
      assignments.map(a => [a.personnelId, a.personnel?.name || a.personnelId] as const),
    );
    const deviceNameById = new Map(
      assignments
        .filter(a => a.deviceId)
        .map(a => [a.deviceId!, a.device?.name || a.device?.code || a.deviceId!] as const),
    );

    for (const [key, rows] of slotAssignments) {
      if (rows.length <= 1) continue;
      const [deviceId, date, shiftType] = key.split('|');
      const deviceName = deviceNameById.get(deviceId) || deviceId;
      for (const row of rows) {
        alerts.push({
          type: 'double_booking',
          severity: 'critical',
          message: `${deviceName} ${date} ${this.getShiftLabel(shiftType)} vardiyasında çift atama: ${personnelNameById.get(row.personnelId) || row.personnelId}`,
          unit: unitType,
          date,
          personnelId: row.personnelId,
          personnelName: personnelNameById.get(row.personnelId),
          deviceId,
          deviceName,
        });
      }
    }

    const personnelMap = new Map<string, typeof assignments[0][]>();
    for (const a of assignments) {
      const existing = personnelMap.get(a.personnelId) || [];
      existing.push(a);
      personnelMap.set(a.personnelId, existing);
    }

    for (const [personnelId, personAssignments] of personnelMap) {
      const name = personAssignments[0]?.personnel?.name || personnelId;
      const totalHours = personAssignments.reduce((sum, a) => {
        const [sh, sm] = a.startTime.split(':').map(Number);
        const [eh, em] = a.endTime.split(':').map(Number);
        return sum + ((eh * 60 + em) - (sh * 60 + sm)) / 60;
      }, 0);

      if (totalHours > 200) {
        alerts.push({
          type: 'overtime',
          severity: 'warning',
          message: `${name} aylık ${Math.round(totalHours)} saat ile fazla mesai limitini aştı`,
          unit: unitType,
          personnelId,
          personnelName: name,
        });
      }

      const sortedByDate = [...personAssignments].sort((a, b) => a.date.localeCompare(b.date));
      let consecutiveNights = 0;
      for (const a of sortedByDate) {
        if (a.shiftType === 'night') {
          consecutiveNights++;
          if (consecutiveNights > 3) {
            alerts.push({
              type: 'consecutive_night',
              severity: 'warning',
              message: `${name} ${a.date} itibarıyla ${consecutiveNights} gece üst üste vardiyalı (maks: 3)`,
              unit: unitType,
              date: a.date,
              personnelId,
              personnelName: name,
            });
          }
        } else {
          consecutiveNights = 0;
        }
      }

      if (personAssignments.length > 25) {
        alerts.push({
          type: 'shift_threshold',
          severity: 'info',
          message: `${name} bu ay ${personAssignments.length} vardiya ile önerilen eşiği aştı`,
          unit: unitType,
          personnelId,
          personnelName: name,
        });
      }
    }

    if (alerts.length === 0) {
      alerts.push({
        type: 'understaffed',
        severity: 'info',
        message: `${monthNames[schedule.month - 1]} ${schedule.year} planında herhangi bir uyarı bulunmuyor`,
        unit: unitType,
      });
    }

    return alerts;
  }

  private getShiftLabel(type: string): string {
    const map: Record<string, string> = { day: 'Gündüz', evening: 'Akşam', night: 'Gece', morning: 'Sabah', afternoon: 'İkindi' };
    return map[type] || type;
  }
}
