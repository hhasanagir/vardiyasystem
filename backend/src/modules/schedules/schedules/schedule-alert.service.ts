import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { UnitsService } from '../units/units.service';

export interface ScheduleAlert {
  type:
    | 'missing_staff'
    | 'understaffed'
    | 'double_booking'
    | 'overtime'
    | 'consecutive_night'
    | 'unassigned_critical'
    | 'workload_imbalance'
    | 'shift_threshold';
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
    private unitsService: UnitsService,
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
    const unitType = (schedule.unit?.type?.toLowerCase() ||
      'unknown') as string;
    const assignments = schedule.assignments;
    const devices = await this.unitsService.getDevices(schedule.unitId, true);
    const daysInMonth = new Date(schedule.year, schedule.month, 0).getDate();

    const dayNames = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    const monthNames = [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ];

    const shiftTypes = ['day', 'evening', 'night'];

    for (const device of devices) {
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${schedule.year}-${String(schedule.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        for (const shiftType of shiftTypes) {
          const slotAssignments = assignments.filter(
            (a) =>
              a.deviceId === device.id &&
              a.date === dateStr &&
              a.shiftType === shiftType,
          );

          if (slotAssignments.length === 0) {
            alerts.push({
              type: 'missing_staff',
              severity: 'warning',
              message: `${device.name || device.code} ${this.getShiftLabel(shiftType)} vardiyasında personel eksik (${dateStr})`,
              unit: unitType,
              date: dateStr,
              deviceId: device.id,
              deviceName: device.name || device.code,
            });
          } else if (slotAssignments.length > 1) {
            for (const a of slotAssignments) {
              alerts.push({
                type: 'double_booking',
                severity: 'critical',
                message: `${device.name || device.code} ${dateStr} ${this.getShiftLabel(shiftType)} vardiyasında çift atama: ${a.personnel?.name || a.personnelId}`,
                unit: unitType,
                date: dateStr,
                personnelId: a.personnelId,
                personnelName: a.personnel?.name,
                deviceId: device.id,
                deviceName: device.name || device.code,
              });
            }
          }
        }
      }
    }

    const personnelMap = new Map<string, (typeof assignments)[0][]>();
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
        return sum + (eh * 60 + em - (sh * 60 + sm)) / 60;
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

      const sortedByDate = [...personAssignments].sort((a, b) =>
        a.date.localeCompare(b.date),
      );
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
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
      afternoon: 'İkindi',
    };
    return map[type] || type;
  }
}
