import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleStore } from '../../core/state';
import {
  getHoliday,
  getHolidayCountForMonth,
  isHoliday,
  HOLIDAY_COLORS,
} from '../../core/calendar/turkish-holidays';
import { ApiService } from '../../services/api.service';

interface OncDeviceRow {
  id: string;
  name: string;
  code: string;
  type: 'LINAC' | 'TOMOTHERAPY' | 'CT_SIMULATOR';
  status: 'active' | 'maintenance' | 'offline';
  assignments: Map<string, SessionAssignment[]>;
}

interface SessionAssignment {
  id: string;
  date: string;
  sessionType: 'MORNING' | 'AFTERNOON' | 'EVENING';
  startTime: string;
  endTime: string;
  patientCount: number;
  technicianId: string;
  technicianName: string;
  status: 'planned' | 'in_progress' | 'completed';
}

interface DayColumn {
  date: Date;
  dayNumber: number;
  dayName: string;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  holidayType?: string;
  isToday: boolean;
}

const ONK_COLOR = '#a21caf';

interface TooltipInfo {
  deviceName: string;
  sessionType: string;
  patientCount: number;
  technicianName: string;
  fractionCount: number;
  treatmentType: string;
}

@Component({
  selector: 'app-onkoloji-plan',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './onkoloji-plan.component.html',
  styleUrls: ['./onkoloji-plan.component.scss'],
})
export class OnkolojiPlanComponent implements OnInit {
  private scheduleStore = inject(ScheduleStore);
  private api = inject(ApiService);

  readonly selectedMonth = this.scheduleStore.selectedMonth;
  readonly selectedYear = this.scheduleStore.selectedYear;
  readonly monthLabel = this.scheduleStore.monthLabel;

  isLoading = signal(true);

  devices = signal<OncDeviceRow[]>([]);
  technicians = signal<{ id: string; name: string }[]>([]);

  showLeftFade = signal(false);
  showRightFade = signal(true);

  // Tooltip
  tooltipVisible = signal(false);
  tooltipX = signal(0);
  tooltipY = signal(0);
  tooltipData = signal<TooltipInfo | null>(null);

  // Onboarding
  showOnboarding = signal(localStorage.getItem('onkoloji-plan-onboarding-dismissed') !== 'true');

  dismissOnboarding(): void {
    this.showOnboarding.set(false);
    localStorage.setItem('onkoloji-plan-onboarding-dismissed', 'true');
  }

  // KPI Computed
  dailyFractions = computed(() => {
    let total = 0;
    for (const d of this.devices()) {
      for (const sessions of d.assignments.values()) {
        total += sessions.length;
      }
    }
    return total;
  });

  deviceOccupancy = computed(() => {
    const devs = this.devices();
    if (devs.length === 0) return 0;
    const active = devs.filter((d) => d.status === 'active').length;
    return Math.round((active / devs.length) * 100);
  });

  criticalSessionGaps = computed(() => {
    let gaps = 0;
    for (const d of this.devices()) {
      const daysWithSessions = d.assignments.size;
      if (daysWithSessions < 20) gaps += 20 - daysWithSessions;
    }
    return gaps;
  });

  patientBacklog = computed(() => {
    let total = 0;
    for (const d of this.devices()) {
      for (const sessions of d.assignments.values()) {
        total += sessions.reduce((sum, s) => sum + s.patientCount, 0);
      }
    }
    return Math.max(0, Math.round(total * 0.15));
  });

  holidayCount = computed(() => {
    const y = this.selectedYear();
    const m = this.selectedMonth();
    return getHolidayCountForMonth(y, m);
  });

  holidayAssignmentWarning = computed(() => {
    const y = this.selectedYear();
    const m = this.selectedMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const holidayDates = new Set<string>();
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      if (isHoliday(dateStr)) holidayDates.add(dateStr);
    }
    const allDates = new Set<string>();
    for (const device of this.devices()) {
      for (const dateStr of device.assignments.keys()) {
        allDates.add(dateStr);
      }
    }
    const hasHolidayAssignment = [...allDates].some((d) => holidayDates.has(d));
    return hasHolidayAssignment ? 'Resmî tatil vardiyası — ek mesai planlaması doğrulayın' : null;
  });

  // Tooltip handler
  onHoverSession(e: MouseEvent, device: OncDeviceRow, session: SessionAssignment): void {
    const typeLabel: Record<string, string> = {
      MORNING: 'Sabah',
      AFTERNOON: 'Öğleden',
      EVENING: 'Akşam',
    };
    this.tooltipData.set({
      deviceName: device.name,
      sessionType: typeLabel[session.sessionType] || session.sessionType,
      patientCount: session.patientCount,
      technicianName: session.technicianName,
      fractionCount: session.patientCount,
      treatmentType:
        device.type === 'LINAC'
          ? 'IMRT/VMAT'
          : device.type === 'TOMOTHERAPY'
            ? 'Helikal'
            : 'Görüntüleme',
    });
    this.tooltipX.set(e.clientX + 12);
    this.tooltipY.set(e.clientY - 10);
    this.tooltipVisible.set(true);
  }

  onMoveTooltip(e: MouseEvent): void {
    if (this.tooltipVisible()) {
      this.tooltipX.set(e.clientX + 12);
      this.tooltipY.set(e.clientY - 10);
    }
  }

  onLeaveTooltip(): void {
    this.tooltipVisible.set(false);
    this.tooltipData.set(null);
  }

  // Export
  exportExcel(): void {
    const rows = [['Cihaz', 'Tarih', 'Seans', 'Hasta Sayısı', 'Teknisyen', 'Durum']];
    for (const d of this.devices()) {
      for (const [dateStr, sessions] of d.assignments) {
        for (const s of sessions) {
          const typeLabel: Record<string, string> = {
            MORNING: 'Sabah',
            AFTERNOON: 'Öğleden',
            EVENING: 'Akşam',
          };
          rows.push([
            d.name,
            dateStr,
            typeLabel[s.sessionType] || s.sessionType,
            String(s.patientCount),
            s.technicianName,
            s.status === 'completed' ? 'Tamamlandı' : 'Planlandı',
          ]);
        }
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `onkoloji_plani_${this.monthLabel().replace(' ', '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportPdf(): void {
    window.print();
  }

  onScheduleScroll(event: Event): void {
    const el = event.target as HTMLElement;
    this.showLeftFade.set(el.scrollLeft > 8);
    this.showRightFade.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }

  showModal = signal(false);
  selectedDevice = signal<OncDeviceRow | null>(null);
  selectedDay = signal<DayColumn | null>(null);
  selectedSessionType = signal<string>('SABAH');
  selectedTechnician = signal<string>('');
  selectedTechnicianName = signal<string>('');
  existingSession = signal<SessionAssignment | null>(null);
  patientCount = 0;

  sessionTypes = [
    { value: 'SABAH', label: 'Sabah', class: 'sabah', icon: '☀️', time: '08:00-14:00' },
    { value: 'OGLE', label: 'Öğleden', class: 'ogleden', icon: '🌤️', time: '14:00-20:00' },
    { value: 'AKSAM', label: 'Akşam', class: 'aksam', icon: '🌙', time: '20:00-02:00' },
  ];

  totalSessions = computed(() => {
    let count = 0;
    this.devices().forEach((d) => {
      d.assignments.forEach((sessions) => (count += sessions.length));
    });
    return count;
  });

  activePatients = computed(() => {
    let count = 0;
    this.devices().forEach((d) => {
      d.assignments.forEach((sessions) => {
        sessions.forEach((s) => {
          if (s.status === 'in_progress') count += s.patientCount;
        });
      });
    });
    return count;
  });

  efficiencyRate = computed(() => 87);

  days = computed(() => {
    const year = this.selectedYear();
    const month = this.selectedMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const dayNames = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNum = i + 1;
      const date = new Date(year, month, dayNum);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      const holiday = getHoliday(dateStr);

      return {
        date: new Date(date),
        dayNumber: dayNum,
        dayName: dayNames[date.getDay()],
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
        isHoliday: !!holiday,
        holidayName: holiday?.name,
        holidayType: holiday?.type,
        isToday: date.getTime() === today.getTime(),
      } as DayColumn;
    });
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading.set(true);

    this.api.get<any>('/units').subscribe({
      next: (units) => {
        const oncUnits = (Array.isArray(units) ? units : []).filter(
          (u: any) => u.type === 'onkoloji' && u.isActive !== false,
        );

        const techs: { id: string; name: string }[] = [];
        for (const u of oncUnits) {
          for (const p of u.personnel || []) {
            if (p.isActive !== false && !techs.find((t) => t.id === p.id)) {
              techs.push({ id: p.id, name: p.name });
            }
          }
        }
        this.technicians.set(techs.length > 0 ? techs : []);

        const devices: OncDeviceRow[] = [];
        for (const u of oncUnits) {
          for (const dev of u.devices || []) {
            if (dev.isActive !== false) {
              const devType = (dev.type || '').toUpperCase();
              let oncType: 'LINAC' | 'TOMOTHERAPY' | 'CT_SIMULATOR' = 'LINAC';
              if (devType.includes('TOMO')) oncType = 'TOMOTHERAPY';
              else if (devType.includes('CT')) oncType = 'CT_SIMULATOR';

              devices.push({
                id: dev.id,
                name: dev.name,
                code: dev.code,
                type: oncType,
                status: 'active',
                assignments: new Map(),
              });
            }
          }
        }

        if (devices.length === 0) {
          devices.push(
            {
              id: 'linac1',
              name: 'LİNAC-1',
              code: 'L1',
              type: 'LINAC',
              status: 'active',
              assignments: new Map(),
            },
            {
              id: 'linac2',
              name: 'LİNAC-2',
              code: 'L2',
              type: 'LINAC',
              status: 'active',
              assignments: new Map(),
            },
          );
        }

        this.devices.set(devices);
        this.isLoading.set(false);
      },
      error: () => {
        this.technicians.set([]);
        this.devices.set([]);
        this.isLoading.set(false);
      },
    });
  }

  getInitials(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  getSessionByType(deviceId: string, date: Date, type: string): SessionAssignment | undefined {
    const device = this.devices().find((d) => d.id === deviceId);
    if (!device) return undefined;
    const dateStr = this.formatDateKey(date);
    const sessions = device.assignments.get(dateStr) || [];

    const typeMap: Record<string, string> = {
      SABAH: 'MORNING',
      OGLE: 'AFTERNOON',
      AKSAM: 'EVENING',
    };

    return sessions.find((s) => s.sessionType === typeMap[type]);
  }

  private formatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  openCellEditor(device: OncDeviceRow, day: DayColumn, sessionType?: string): void {
    this.selectedDevice.set(device);
    this.selectedDay.set(day);

    if (sessionType) {
      this.selectedSessionType.set(sessionType);
      const existing = this.getSessionByType(device.id, day.date, sessionType);
      if (existing) {
        this.existingSession.set(existing);
        this.selectedTechnician.set(existing.technicianId);
        this.selectedTechnicianName.set(existing.technicianName);
        this.patientCount = existing.patientCount;
      } else {
        this.existingSession.set(null);
        this.selectedTechnician.set('');
        this.selectedTechnicianName.set('');
        this.patientCount = 0;
      }
    }

    this.showModal.set(true);
  }

  selectSessionType(type: string): void {
    this.selectedSessionType.set(type);
    const device = this.selectedDevice();
    const day = this.selectedDay();
    if (device && day) {
      const existing = this.getSessionByType(device.id, day.date, type);
      if (existing) {
        this.existingSession.set(existing);
        this.selectedTechnician.set(existing.technicianId);
        this.selectedTechnicianName.set(existing.technicianName);
        this.patientCount = existing.patientCount;
      } else {
        this.existingSession.set(null);
        this.selectedTechnician.set('');
        this.selectedTechnicianName.set('');
        this.patientCount = 0;
      }
    }
  }

  selectTechnician(id: string, name: string): void {
    this.selectedTechnician.set(id);
    this.selectedTechnicianName.set(name);
  }

  canSave(): boolean {
    return this.selectedTechnician() !== '' && this.patientCount > 0;
  }

  saveSession(): void {
    const device = this.selectedDevice();
    const day = this.selectedDay();
    if (!device || !day) return;

    const timeMap: Record<string, { start: string; end: string }> = {
      SABAH: { start: '08:00', end: '14:00' },
      OGLE: { start: '14:00', end: '20:00' },
      AKSAM: { start: '20:00', end: '02:00' },
    };

    const typeMap: Record<string, 'MORNING' | 'AFTERNOON' | 'EVENING'> = {
      SABAH: 'MORNING',
      OGLE: 'AFTERNOON',
      AKSAM: 'EVENING',
    };

    const newSession: SessionAssignment = {
      id:
        this.existingSession()?.id ||
        `${device.id}-${this.formatDateKey(day.date)}-${this.selectedSessionType().toLowerCase()}`,
      date: this.formatDateKey(day.date),
      sessionType: typeMap[this.selectedSessionType()],
      startTime: timeMap[this.selectedSessionType()].start,
      endTime: timeMap[this.selectedSessionType()].end,
      patientCount: this.patientCount,
      technicianId: this.selectedTechnician(),
      technicianName: this.selectedTechnicianName(),
      status: 'planned',
    };

    this.devices.update((devices) => {
      return devices.map((d) => {
        if (d.id === device.id) {
          const newAssignments = new Map(d.assignments);
          const dateStr = this.formatDateKey(day.date);
          const existingForDate = newAssignments.get(dateStr) || [];
          const filtered = existingForDate.filter(
            (s) => s.sessionType !== typeMap[this.selectedSessionType()],
          );
          newAssignments.set(dateStr, [...filtered, newSession]);
          return { ...d, assignments: newAssignments };
        }
        return d;
      });
    });

    this.closeModal();
  }

  removeSession(): void {
    const device = this.selectedDevice();
    const day = this.selectedDay();
    if (!device || !day) return;

    const typeMap: Record<string, 'MORNING' | 'AFTERNOON' | 'EVENING'> = {
      SABAH: 'MORNING',
      OGLE: 'AFTERNOON',
      AKSAM: 'EVENING',
    };

    this.devices.update((devices) => {
      return devices.map((d) => {
        if (d.id === device.id) {
          const newAssignments = new Map(d.assignments);
          const dateStr = this.formatDateKey(day.date);
          const existingForDate = newAssignments.get(dateStr) || [];
          const filtered = existingForDate.filter(
            (s) => s.sessionType !== typeMap[this.selectedSessionType()],
          );
          if (filtered.length > 0) {
            newAssignments.set(dateStr, filtered);
          } else {
            newAssignments.delete(dateStr);
          }
          return { ...d, assignments: newAssignments };
        }
        return d;
      });
    });

    this.closeModal();
  }

  closeModal(): void {
    this.showModal.set(false);
    this.selectedDevice.set(null);
    this.selectedDay.set(null);
  }

  formatModalDate(): string {
    const day = this.selectedDay();
    if (!day) return '';
    return day.date.toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  getAvatarColor(id: string): string {
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b'];
    const index = parseInt(id.replace(/\D/g, '')) || 0;
    return colors[index % colors.length];
  }

  previousMonth(): void {
    this.scheduleStore.previousMonth();
    this.loadData();
  }

  nextMonth(): void {
    this.scheduleStore.nextMonth();
    this.loadData();
  }

  refreshData(): void {
    this.loadData();
  }

  generateSchedule(): void {
    this.loadData();
  }
}
