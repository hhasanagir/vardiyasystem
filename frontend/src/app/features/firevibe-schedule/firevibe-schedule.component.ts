import {
  Component,
  inject,
  signal,
  computed,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  ElementRef,
  viewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, forkJoin, takeUntil, of, catchError, type Observable } from 'rxjs';
import type { UnitType } from '../../domain/enums';
import type { ShiftAssignment, Employee } from '../../domain/models';
import { AuthService } from '../../services/auth.service';
import { hasMinRole } from '../../shared/utils/role-hierarchy';
import {
  ScheduleService,
  type ScheduleResponse,
  type ShiftDateOverride,
} from '../../services/schedule.service';
import { EmployeeService } from '../../services/employee.service';
import { DeviceStatusService } from '../../services/device-status.service';
import { getHoliday, getHolidayCountForMonth } from '../../core/calendar/turkish-holidays';

type ZoomLevel = 'compact' | 'small' | 'medium' | 'large';

interface CellWarning {
  kind:
    | 'double'
    | 'double-device'
    | 'consecutive-nights'
    | 'rest'
    | 'overtime'
    | 'cert'
    | 'leave'
    | 'report'
    | 'night-eligible'
    | 'streak';
  label: string;
  severity: 'error' | 'warning' | 'info';
}

interface ContextMenuState {
  row: ShiftRowData;
  cell: DayCellData;
  x: number;
  y: number;
}

interface HistoryOp {
  kind: 'assign' | 'remove';
  assignment: ShiftAssignment;
}

interface ShiftSlot {
  key: string;
  id: string;
  type: string;
  startTime: string;
  endTime: string;
  name: string;
  personnelType: string | null;
  blockId: string | null;
  optionalOnWeekends: boolean;
  optionalOnHolidays: boolean;
}

interface DeviceRow {
  id: string;
  code: string;
  name: string;
  mode: string;
  blockCode: string | null;
  isMaster: boolean;
  workDays: number[];
  slots: ShiftSlot[];
}

interface DayCol {
  dayNumber: number;
  dateStr: string;
  dayName: string;
  dayOfWeek: number;
  isWeekend: boolean;
  isToday: boolean;
  isHoliday: boolean;
  holidayName: string | null;
}

interface DayCellData {
  day: DayCol;
  assignment: ShiftAssignment | null;
  showOverride: boolean;
  overrideOn: boolean;
  isClosed: boolean;
  conflict: boolean;
  leave: boolean;
  warning: boolean;
  report: boolean;
  overtime: boolean;
  cert: boolean;
  note: boolean;
  warnings: CellWarning[];
}

interface ShiftRowData {
  key: string;
  deviceId: string;
  deviceCode: string;
  deviceName: string;
  mode: string;
  slot: ShiftSlot;
  roster: Array<{ id: string; name: string; role: string }>;
  filled: number;
  total: number;
  cells: DayCellData[];
}

interface BlockGroup {
  key: string;
  label: string;
  open: boolean;
  deviceCount: number;
}

interface DeviceHeaderRow {
  key: string;
  id: string;
  code: string;
  name: string;
  mode: string;
  open: boolean;
  blockLabel: string;
}

type GridRow =
  | { kind: 'block'; data: BlockGroup }
  | { kind: 'device'; data: DeviceHeaderRow }
  | { kind: 'shift'; data: ShiftRowData };

type ViewState =
  | { status: 'loading' }
  | { status: 'success'; schedule: ScheduleResponse }
  | { status: 'empty'; reason: string }
  | { status: 'error'; message: string };

interface DrawerState {
  row: ShiftRowData;
  cell: DayCellData;
}

interface SummaryStats {
  slots: number;
  assigned: number;
  unassigned: number;
  coverage: number;
  conflicts: number;
  leave: number;
  holiday: number;
  nightDuties: number;
  dayShifts: number;
  eveningShifts: number;
  overtime: number;
  report: number;
}

const UNIT_OPTIONS: Array<{ id: UnitType; label: string; short: string }> = [
  { id: 'mr', label: 'MR', short: 'MR' },
  { id: 'bt', label: 'BT', short: 'BT' },
  { id: 'rontgen', label: 'Röntgen', short: 'RÖN' },
  { id: 'nukleer', label: 'Nükleer Tıp', short: 'NÜK' },
  { id: 'onkoloji', label: 'Onkoloji', short: 'ONK' },
  { id: 'supervizor', label: 'Süpervizör', short: 'SÜP' },
];

const TURKISH_MONTHS = [
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
const WEEKDAY_NAMES = ['Pz', 'Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct'];

function initialsOf(name?: string | null): string {
  return (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('')
    .toUpperCase();
}

function timeToMs(t?: string | null): number {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h)) return 0;
  return ((h || 0) * 3600 + (Number.isNaN(m) ? 0 : m || 0) * 60) * 1000;
}

function roleLabelOf(personnelType?: string | null): string {
  const map: Record<string, string> = {
    technician: 'Teknisyen',
    assistant_technician: 'Asistan Teknisyen',
    assistant: 'Asistan',
    supervisor: 'Süpervizör',
    engineer: 'Biyomedikal Mühendisi',
  };
  return (personnelType && map[personnelType]) || 'Sağlık Personeli';
}

function blockKeyOf(code: string | null | undefined): string {
  if (!code || code.trim() === '') return 'DIGER';
  const c = code.toUpperCase();
  if (c.includes('TRAVMA')) return 'TRAVMA_ACIL';
  if (c.includes('ERİŞKİN') || c.includes('ERISKIN')) return 'ERISKIN_ACIL';
  if (c.startsWith('ACIL') || c.startsWith('ACİL')) return 'ACIL';
  return c.length <= 2 ? c : c;
}

function blockLabelOf(code: string | null | undefined): string {
  const key = blockKeyOf(code);
  if (key === 'DIGER') return 'DİĞER';
  if (key === 'ACIL') return 'ACİL BLOK';
  if (key === 'ERISKIN_ACIL') return 'ERİŞKİN ACİL';
  if (key === 'TRAVMA_ACIL') return 'TRAVMA ACİL';
  return `${key} BLOK`;
}

function blockRank(key: string): number {
  if (key === 'DIGER') return 99;
  if (key === 'ACIL' || key === 'ERISKIN_ACIL' || key === 'TRAVMA_ACIL') return 98;
  return 0;
}

@Component({
  selector: 'app-firevibe-schedule',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './firevibe-schedule.component.html',
  styleUrls: ['./firevibe-schedule.component.scss'],
})
export class FirevibeScheduleComponent implements OnInit, OnDestroy {
  private readonly scheduleApi = inject(ScheduleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly employeeApi = inject(EmployeeService);
  private readonly deviceStatusApi = inject(DeviceStatusService);
  private readonly destroy$ = new Subject<void>();

  private readonly mainScroll = viewChild<ElementRef<HTMLElement>>('mainScroll');
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  readonly units = UNIT_OPTIONS;

  isFieldSupervisor = computed(() => hasMinRole(this.auth.user()?.role ?? '', 'medical_engineer'));

  unit = signal<UnitType>('mr');
  month = signal(new Date().getMonth() + 1);
  year = signal(new Date().getFullYear());

  viewState = signal<ViewState>({ status: 'loading' });
  lastUpdated = signal<Date | null>(null);

  searchQuery = signal('');
  filterDevice = signal('');
  filterShift = signal('');

  zoom = signal<ZoomLevel>('medium');
  daySearch = signal<number | null>(null);

  readonly zoomOptions: Array<{ id: ZoomLevel; label: string }> = [
    { id: 'compact', label: 'Kompakt' },
    { id: 'small', label: 'Küçük' },
    { id: 'medium', label: 'Orta' },
    { id: 'large', label: 'Büyük' },
  ];

  dayWidth = computed(() => {
    switch (this.zoom()) {
      case 'compact':
        return 120;
      case 'small':
        return 140;
      case 'large':
        return 180;
      default:
        return 160;
    }
  });

  dayColSpan = computed(() => this.days().length);
  totalCols = computed(() => this.days().length + 1);

  overrides = signal<Map<string, ShiftDateOverride>>(new Map());
  employees = signal<Map<string, Employee>>(new Map());
  deviceStatuses = signal<Map<string, string>>(new Map());

  cellNotes = signal<Map<string, string>>(new Map());
  leaveFlags = signal<Set<string>>(new Set());
  overtimeFlags = signal<Set<string>>(new Set());

  clipboard = signal<ShiftAssignment | null>(null);
  contextMenu = signal<ContextMenuState | null>(null);
  selected = signal<DrawerState | null>(null);

  dragPersonnelId = signal('');
  dragOverKey = signal('');

  private undoStack: HistoryOp[] = [];
  private redoStack: HistoryOp[] = [];

  private readonly expandedBlocks = signal<string[]>([]);
  private readonly expandedDevices = signal<string[]>([]);

  drawer = signal<DrawerState | null>(null);
  selectedPersonnelId = signal('');

  private dragState: { x: number; y: number; sl: number; st: number } | null = null;
  private dragWasActive = false;

  unitLabel = computed(() => {
    const found = UNIT_OPTIONS.find((x) => x.id === this.unit());
    return found ? found.short : 'MR';
  });

  monthLabel = computed(() => `${TURKISH_MONTHS[this.month() - 1]} ${this.year()}`);

  TURKISH_MONTH = (m: number): string => TURKISH_MONTHS[Number(m) - 1];

  yearsForSelect = (): number[] => {
    const base = new Date().getFullYear() - 1;
    return [base, base + 1, base + 2, base + 3];
  };

  schedule = computed<ScheduleResponse | null>(() => {
    const vs = this.viewState();
    return vs.status === 'success' ? vs.schedule : null;
  });

  days = computed<DayCol[]>(() => {
    const year = this.year();
    const month = this.month();
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Array.from({ length: daysInMonth }, (_, i) => {
      const dayNumber = i + 1;
      const date = new Date(year, month - 1, dayNumber);
      const dow = date.getDay();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const holiday = getHoliday(dateStr);
      return {
        dayNumber,
        dateStr,
        dayName: WEEKDAY_NAMES[dow],
        dayOfWeek: dow,
        isWeekend: dow === 0 || dow === 6,
        isToday: date.getTime() === today.getTime(),
        isHoliday: !!holiday,
        holidayName: holiday?.name ?? null,
      };
    });
  });

  deviceRows = computed<DeviceRow[]>(() => {
    const vs = this.viewState();
    if (vs.status !== 'success') return [];
    const configs = vs.schedule.deviceShiftConfig || [];
    return vs.schedule.devices.map((d) => {
      const cfg = configs.find((c) => c.deviceId === d.id);
      const shifts = cfg?.shifts || [];
      const seen = new Set<string>();
      const slots: ShiftSlot[] = [];
      for (const s of shifts) {
        const key = `${s.type}|${s.personnelType || 'default'}|${s.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        slots.push({
          key,
          id: s.id,
          type: s.type,
          startTime: s.startTime,
          endTime: s.endTime,
          name: s.name,
          personnelType: s.personnelType ?? null,
          blockId: s.blockId ?? null,
          optionalOnWeekends: !!s.optionalOnWeekends,
          optionalOnHolidays: !!s.optionalOnHolidays,
        });
      }
      return {
        id: d.id,
        code: d.code,
        name: d.name,
        mode: d.mode,
        blockCode: d.blockCode ?? null,
        isMaster: !!d.isMaster,
        workDays: d.workDays ?? [1, 2, 3, 4, 5, 6, 0],
        slots,
      };
    });
  });

  deviceOptions = computed(() =>
    this.deviceRows().map((r) => ({ id: r.id, code: r.code, name: r.name })),
  );

  deviceWorkDaysMap = computed(() => {
    const vs = this.viewState();
    const map = new Map<string, number[]>();
    if (vs.status !== 'success') return map;
    for (const d of vs.schedule.devices) {
      map.set(d.id, d.workDays ?? [1, 2, 3, 4, 5, 6, 0]);
    }
    return map;
  });

  unitClosedDays = computed(() => {
    const map = this.deviceWorkDaysMap();
    if (map.size === 0) return new Set<number>();
    const allDows = [0, 1, 2, 3, 4, 5, 6];
    return new Set(
      allDows.filter((dow) => {
        const allClosed = Array.from(map.values()).every((wd) => !wd.includes(dow));
        return allClosed;
      }),
    );
  });

  private cellKey(
    deviceId: string,
    dateStr: string,
    shiftKey: string,
    personnelType: string | null,
  ): string {
    return `${deviceId}|${dateStr}|${shiftKey}|${personnelType || '*'}`;
  }

  assignmentIndex = computed(() => {
    const vs = this.viewState();
    const map = new Map<string, ShiftAssignment>();
    if (vs.status !== 'success') return map;
    for (const a of vs.schedule.assignments) {
      map.set(
        this.cellKey(a.deviceId, a.date, this.shiftKey(a.shiftType), a.personnelType ?? null),
        a,
      );
    }
    return map;
  });

  personDayCount = computed(() => {
    const vs = this.viewState();
    const map = new Map<string, number>();
    if (vs.status !== 'success') return map;
    for (const a of vs.schedule.assignments) {
      const key = `${a.personnelId}|${a.date}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  });

  personMaxStreak = computed(() => {
    const vs = this.viewState();
    const byPerson = new Map<string, string[]>();
    if (vs.status !== 'success') return new Map<string, number>();
    for (const a of vs.schedule.assignments) {
      const list = byPerson.get(a.personnelId) || [];
      list.push(a.date);
      byPerson.set(a.personnelId, list);
    }
    const result = new Map<string, number>();
    for (const [pid, dates] of byPerson) {
      const sorted = [...new Set(dates)].sort();
      let max = 1;
      let cur = 1;
      for (let i = 1; i < sorted.length; i++) {
        const prev = new Date(sorted[i - 1]);
        const curr = new Date(sorted[i]);
        const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);
        if (diff === 1) {
          cur += 1;
          if (cur > max) max = cur;
        } else {
          cur = 1;
        }
      }
      result.set(pid, max);
    }
    return result;
  });

  private emp(id: string): Employee | undefined {
    return this.employees().get(id);
  }

  private readonly warningsIndex = computed(() => {
    const vs = this.viewState();
    const map = new Map<string, CellWarning[]>();
    if (vs.status !== 'success') return map;

    const push = (a: ShiftAssignment, w: CellWarning): void => {
      const k = this.cellKey(
        a.deviceId,
        a.date,
        this.shiftKey(a.shiftType),
        a.personnelType ?? null,
      );
      const list = map.get(k) || [];
      list.push(w);
      map.set(k, list);
    };

    const byPerson = new Map<string, ShiftAssignment[]>();
    for (const a of vs.schedule.assignments) {
      const list = byPerson.get(a.personnelId) || [];
      list.push(a);
      byPerson.set(a.personnelId, list);
    }

    const devById = new Map(this.deviceRows().map((d) => [d.id, d]));
    const dayMs = 86400000;

    for (const [pid, rawList] of byPerson) {
      const list = [...rawList].sort(
        (x, y) => x.date.localeCompare(y.date) || timeToMs(x.startTime) - timeToMs(y.startTime),
      );

      const byDate = new Map<string, ShiftAssignment[]>();
      for (const a of list) {
        const dl = byDate.get(a.date) || [];
        dl.push(a);
        byDate.set(a.date, dl);
      }

      for (const dayList of byDate.values()) {
        if (dayList.length < 2) continue;
        const devices = new Set(dayList.map((d) => d.deviceId));
        for (const a of dayList) {
          push(a, {
            kind: 'double',
            label: 'Aynı gün birden fazla vardiya (çakışma)',
            severity: 'error',
          });
          if (devices.size > 1) {
            push(a, {
              kind: 'double-device',
              label: 'Aynı gün birden fazla cihazda görev',
              severity: 'warning',
            });
          }
        }
      }

      const uniqDates = [...new Set(list.map((a) => a.date))].sort();

      const nightDates = [
        ...new Set(list.filter((a) => this.shiftKey(a.shiftType) === 'night').map((a) => a.date)),
      ].sort();
      let nightRun = 1;
      for (let i = 1; i < nightDates.length; i++) {
        const diff = Math.round(
          (new Date(nightDates[i]).getTime() - new Date(nightDates[i - 1]).getTime()) / dayMs,
        );
        if (diff !== 1) {
          nightRun = 1;
          continue;
        }
        nightRun++;
        if (nightRun >= 3) {
          for (const a of list) {
            if (a.date === nightDates[i] && this.shiftKey(a.shiftType) === 'night') {
              push(a, {
                kind: 'consecutive-nights',
                label: `${nightRun} ardışık gece nöbeti`,
                severity: 'warning',
              });
            }
          }
        }
      }

      let streak = 1;
      for (let i = 1; i < uniqDates.length; i++) {
        const diff = Math.round(
          (new Date(uniqDates[i]).getTime() - new Date(uniqDates[i - 1]).getTime()) / dayMs,
        );
        if (diff === 1) {
          streak++;
          if (streak >= 6) {
            for (const a of list) {
              if (a.date === uniqDates[i]) {
                push(a, {
                  kind: 'streak',
                  label: `${streak} ardışık çalışma günü`,
                  severity: 'warning',
                });
              }
            }
          }
        } else {
          streak = 1;
        }
      }

      for (let i = 1; i < list.length; i++) {
        const prev = list[i - 1];
        const a = list[i];
        const prevDate = new Date(prev.date);
        const aDate = new Date(a.date);
        const daysDiff = Math.round((aDate.getTime() - prevDate.getTime()) / dayMs);
        if (daysDiff !== 1) continue;
        const prevEndMs = prevDate.getTime() + timeToMs(prev.endTime);
        const startMs = aDate.getTime() + timeToMs(a.startTime);
        const restH = (startMs - prevEndMs) / 3600000;
        if (restH < 0) {
          push(a, {
            kind: 'overtime',
            label: 'Üst üste vardiya (dinlenme yok)',
            severity: 'error',
          });
        } else if (restH < 11) {
          push(a, {
            kind: 'rest',
            label: `Yasal dinlenme süresi yetersiz (${restH.toFixed(1)} sa)`,
            severity: 'warning',
          });
        }
      }

      for (const a of list) {
        const empE = this.emp(pid);
        if (
          empE &&
          this.shiftKey(a.shiftType) === 'night' &&
          empE.nightShiftEligible === false &&
          empE.role !== 'assistant_technician'
        ) {
          push(a, {
            kind: 'night-eligible',
            label: 'Gece vardiyası için uygun değil',
            severity: 'warning',
          });
        }
        const dev = devById.get(a.deviceId);
        if (empE && dev && empE.deviceSkills && empE.deviceSkills.length > 0) {
          const hay = `${dev.code} ${dev.name}`.toLowerCase();
          const matched = empE.deviceSkills.some((s) => s && hay.includes(s.toLowerCase().trim()));
          if (!matched) {
            push(a, {
              kind: 'cert',
              label: `${dev.code} için kayıtlı yeterlilik görünmüyor`,
              severity: 'info',
            });
          }
        }
      }
    }

    for (const a of vs.schedule.assignments) {
      if (this.emp(a.personnelId)?.employmentStatus === 'on_leave') {
        push(a, { kind: 'leave', label: 'Personel bu dönemde izinli', severity: 'warning' });
      }
      if (this.emp(a.personnelId)?.employmentStatus === 'sick') {
        push(a, { kind: 'report', label: 'Personel raporlu görünüyor', severity: 'warning' });
      }
    }

    return map;
  });

  deviceStatusLabel = (deviceId: string): string => {
    const s = this.deviceStatuses().get(deviceId) || 'active';
    const map: Record<string, string> = {
      active: 'Aktif',
      maintenance: 'Bakım',
      fault: 'Arıza',
      out_of_service: 'Hizmet Dışı',
    };
    return map[s] || 'Aktif';
  };

  deviceStatusClass = (deviceId: string): string => {
    return this.deviceStatuses().get(deviceId) || 'active';
  };

  private slotRoster(
    deviceId: string,
    slot: ShiftSlot,
  ): Array<{ id: string; name: string; role: string }> {
    const vs = this.viewState();
    if (vs.status !== 'success') return [];
    const k = this.shiftKey(slot.type);
    const seen = new Map<string, { id: string; name: string; role: string }>();
    for (const a of vs.schedule.assignments) {
      if (
        a.deviceId === deviceId &&
        this.shiftKey(a.shiftType) === k &&
        (!slot.personnelType || a.personnelType === slot.personnelType)
      ) {
        seen.set(a.personnelId, {
          id: a.personnelId,
          name: a.personnelName || 'Personel',
          role: a.personnelType || 'technician',
        });
      }
    }
    return Array.from(seen.values());
  }

  private matchesSearch(a: ShiftAssignment | null): boolean {
    const q = this.searchQuery().trim().toLowerCase();
    if (!q) return true;
    if (!a) return false;
    return (
      (a.personnelName || '').toLowerCase().includes(q) ||
      (a.personnelType || '').toLowerCase().includes(q)
    );
  }

  private buildCells(deviceId: string, slot: ShiftSlot, searchActive: boolean): DayCellData[] {
    const k = this.shiftKey(slot.type);
    const idx = this.assignmentIndex();
    const pdc = this.personDayCount();
    const streaks = this.personMaxStreak();
    const ovr = this.overrides();
    const warnIdx = this.warningsIndex();
    const workDaysMap = this.deviceWorkDaysMap();
    const deviceWorkDays = workDaysMap.get(deviceId) ?? [1, 2, 3, 4, 5, 6, 0];
    return this.days().map((day) => {
      const isClosed = !deviceWorkDays.includes(day.dayOfWeek);
      let a = idx.get(this.cellKey(deviceId, day.dateStr, k, slot.personnelType)) ?? null;
      if (searchActive && a) {
        a = this.matchesSearch(a) ? a : null;
      }
      if (a) {
        const warnings =
          warnIdx.get(this.cellKey(deviceId, day.dateStr, k, slot.personnelType)) ?? [];
        return {
          day,
          assignment: a,
          showOverride: false,
          overrideOn: false,
          isClosed: false,
          conflict: (pdc.get(`${a.personnelId}|${day.dateStr}`) || 0) > 1,
          leave:
            this.emp(a.personnelId)?.employmentStatus === 'on_leave' || this.leaveFlags().has(a.id),
          warning: (streaks.get(a.personnelId) || 0) >= 6,
          report: this.emp(a.personnelId)?.employmentStatus === 'sick',
          overtime: warnings.some((w) => w.kind === 'overtime') || this.overtimeFlags().has(a.id),
          cert: warnings.some((w) => w.kind === 'cert'),
          note: this.cellNotes().has(a.id),
          warnings,
        };
      }
      if (isClosed) {
        return {
          day,
          assignment: null,
          showOverride: false,
          overrideOn: false,
          isClosed: true,
          conflict: false,
          leave: false,
          warning: false,
          report: false,
          overtime: false,
          cert: false,
          note: false,
          warnings: [],
        };
      }
      const isOptionalDay =
        (slot.optionalOnWeekends && day.isWeekend) || (slot.optionalOnHolidays && day.isHoliday);
      const showOverride = !!isOptionalDay && this.isFieldSupervisor();
      const overrideOn = showOverride && ovr.has(this.overrideKey(slot.id, day.dateStr));
      return {
        day,
        assignment: null,
        showOverride,
        overrideOn,
        isClosed: false,
        conflict: false,
        leave: false,
        warning: false,
        report: false,
        overtime: false,
        cert: false,
        note: false,
        warnings: [],
      };
    });
  }

  gridRows = computed<GridRow[]>(() => {
    const vs = this.viewState();
    if (vs.status !== 'success') return [];

    const searchActive = this.searchQuery().trim().length > 0;
    const filterDev = this.filterDevice();
    const filterSh = this.filterShift();

    let devs = this.deviceRows();
    if (filterDev) devs = devs.filter((r) => r.id === filterDev);
    if (filterSh)
      devs = devs.map((r) => ({
        ...r,
        slots: r.slots.filter((s) => this.shiftKey(s.type) === filterSh),
      }));
    devs = devs.filter((r) => r.slots.length > 0);

    const expandedBlocks = this.expandedBlocks();
    const expandedDevices = this.expandedDevices();

    const groups = new Map<string, DeviceRow[]>();
    for (const d of devs) {
      const key = blockKeyOf(d.blockCode);
      const list = groups.get(key) || [];
      list.push(d);
      groups.set(key, list);
    }

    const blockKeys = Array.from(groups.keys()).sort((a, b) => {
      const ra = blockRank(a);
      const rb = blockRank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    const rows: GridRow[] = [];
    for (const bk of blockKeys) {
      const groupDevs = groups.get(bk)!;
      const blockOpen = !!(filterDev || filterSh || expandedBlocks.includes(bk));
      rows.push({
        kind: 'block',
        data: {
          key: `blk|${bk}`,
          label: blockLabelOf(bk),
          open: blockOpen,
          deviceCount: groupDevs.length,
        },
      });
      if (!blockOpen) continue;
      for (const d of groupDevs) {
        const deviceOpen = !!(filterDev || filterSh || expandedDevices.includes(d.id));
        rows.push({
          kind: 'device',
          data: {
            key: `dev|${d.id}`,
            id: d.id,
            code: d.code,
            name: d.name,
            mode: d.mode,
            open: deviceOpen,
            blockLabel: blockLabelOf(d.blockCode),
          },
        });
        if (!deviceOpen) continue;
        for (const slot of d.slots) {
          rows.push({
            kind: 'shift',
            data: {
              key: `shift|${d.id}|${slot.key}`,
              deviceId: d.id,
              deviceCode: d.code,
              deviceName: d.name,
              mode: d.mode,
              slot,
              roster: this.slotRoster(d.id, slot),
              filled: 0,
              total: this.days().length,
              cells: this.buildCells(d.id, slot, searchActive),
            },
          });
        }
      }
    }
    for (const r of rows) {
      if (r.kind === 'shift') {
        r.data.filled = r.data.cells.filter((c) => c.assignment).length;
        r.data.total = r.data.cells.filter((c) => !c.isClosed).length;
      }
    }
    return rows;
  });

  trackByRow(index: number, row: GridRow): string {
    return row.kind === 'block'
      ? row.data.key
      : row.kind === 'device'
        ? row.data.key
        : row.data.key;
  }

  trackByDay(index: number, cell: DayCellData): string {
    return cell.day.dateStr;
  }

  summary = computed<SummaryStats>(() => {
    const vs = this.viewState();
    if (vs.status !== 'success') {
      return {
        slots: 0,
        assigned: 0,
        unassigned: 0,
        coverage: 0,
        conflicts: 0,
        leave: 0,
        holiday: 0,
        nightDuties: 0,
        dayShifts: 0,
        eveningShifts: 0,
        overtime: 0,
        report: 0,
      };
    }
    const assignments = vs.schedule.assignments;
    let total = 0;
    for (const r of this.deviceRows()) total += r.slots.length * this.days().length;
    const assigned = assignments.length;
    const unassigned = Math.max(total - assigned, 0);
    const coverage = total > 0 ? Math.round((assigned * 100) / total) : 0;

    let conflicts = 0;
    const seen = new Set<string>();
    for (const a of assignments) {
      const key = `${a.personnelId}|${a.date}`;
      if (!seen.has(key)) seen.add(key);
      else if (!seen.has(`c:${key}`)) {
        conflicts++;
        seen.add(`c:${key}`);
      }
    }

    let leave = 0;
    let nightDuties = 0;
    let dayShifts = 0;
    let eveningShifts = 0;
    let overtime = 0;
    let report = 0;
    for (const a of assignments) {
      const empStatus = this.emp(a.personnelId)?.employmentStatus;
      if (empStatus === 'on_leave') leave++;
      if (empStatus === 'sick') report++;
      if (this.overtimeFlags().has(a.id)) overtime++;
      const k = this.shiftKey(a.shiftType);
      if (k === 'night') nightDuties++;
      else if (k === 'evening') eveningShifts++;
      else dayShifts++;
    }
    const warnIdx = this.warningsIndex();
    for (const warnings of warnIdx.values()) {
      for (const w of warnings) {
        if (w.kind === 'overtime') overtime++;
      }
    }

    return {
      slots: total,
      assigned,
      unassigned,
      coverage,
      conflicts,
      leave,
      holiday: getHolidayCountForMonth(this.year(), this.month()),
      nightDuties,
      dayShifts,
      eveningShifts,
      overtime,
      report,
    };
  });

  stateTitle = computed(() => {
    return this.viewState().status === 'error' ? 'Veri Yüklenemedi' : 'Plan Bulunamadı';
  });

  stateDesc = computed(() => {
    const vs = this.viewState();
    if (vs.status === 'error') return vs.message;
    if (vs.status === 'empty') return vs.reason;
    return '';
  });

  scheduleStatusLabel = computed(() => {
    const vs = this.viewState();
    if (vs.status !== 'success') return '';
    const map: Record<string, string> = {
      draft: 'Taslak',
      submitted: 'İncelemede',
      approved: 'Onaylı',
      published: 'Yayınlandı',
      rejected: 'Reddedildi',
      archived: 'Arşivlendi',
    };
    return map[vs.schedule.status] || vs.schedule.status;
  });

  private shiftKey(t: string): string {
    const s = (t || '').toLowerCase();
    if (s.includes('morning')) return 'morning';
    if (s.includes('gunduz') || s.includes('sabah') || s === 'day') return 'day';
    if (s.includes('gece') || s === 'night') return 'night';
    if (s.includes('ikindi') || s.includes('ogle') || s.includes('aksam') || s.includes('evening'))
      return 'evening';
    return s;
  }

  shiftKeyLabel(t: string): string {
    const k = this.shiftKey(t);
    const map: Record<string, string> = {
      day: 'Gündüz',
      night: 'Gece',
      evening: 'İkindi',
      morning: 'Sabah',
    };
    return map[k] || k;
  }

  slotKind(slot: ShiftSlot): 'day' | 'night' | 'evening' {
    const k = this.shiftKey(slot.type);
    if (k === 'night') return 'night';
    if (k === 'evening') return 'evening';
    return 'day';
  }

  isOptionalSlot(slot: ShiftSlot): boolean {
    return slot.optionalOnWeekends || slot.optionalOnHolidays;
  }

  isSharedSlot(slot: ShiftSlot): boolean {
    return !!slot.blockId;
  }

  isAssistantSlot(slot: ShiftSlot): boolean {
    return slot.personnelType === 'assistant_technician';
  }

  private overrideKey(shiftId: string, dateStr: string): string {
    return `${shiftId}|${dateStr}`;
  }

  toggleOverride(slot: ShiftSlot, dateStr: string): void {
    const vs = this.viewState();
    if (vs.status !== 'success' || !this.isFieldSupervisor()) return;
    const key = this.overrideKey(slot.id, dateStr);
    const next = !this.overrides().has(key);

    this.scheduleApi
      .setShiftOverride(vs.schedule.unit, slot.id, dateStr, next)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.overrides.update((map) => {
            const m = new Map(map);
            if (next) {
              m.set(key, { id: '', shiftId: slot.id, date: dateStr, isEnabled: true });
            } else {
              m.delete(key);
            }
            return m;
          });
        },
        error: (err: { message?: string }) => {
          window.alert(err?.message || 'Opsiyonel vardiya ayarı güncellenemedi.');
        },
      });
  }

  toggleBlock(key: string): void {
    if (this.filterDevice() || this.filterShift()) return;
    this.expandedBlocks.update((list) =>
      list.includes(key) ? list.filter((k) => k !== key) : [...list, key],
    );
  }

  toggleDevice(id: string): void {
    if (this.filterDevice() || this.filterShift()) return;
    this.expandedDevices.update((list) =>
      list.includes(id) ? list.filter((d) => d !== id) : [...list, id],
    );
  }

  setUnit(u: UnitType): void {
    if (u === this.unit()) return;
    this.unit.set(u);
    this.resetFilters();
    this.load();
  }

  prevMonth(): void {
    let m = this.month() - 1;
    let y = this.year();
    if (m < 1) {
      m = 12;
      y -= 1;
    }
    this.month.set(m);
    this.year.set(y);
    this.load();
  }

  nextMonth(): void {
    let m = this.month() + 1;
    let y = this.year();
    if (m > 12) {
      m = 1;
      y += 1;
    }
    this.month.set(m);
    this.year.set(y);
    this.load();
  }

  goToToday(): void {
    const now = new Date();
    this.month.set(now.getMonth() + 1);
    this.year.set(now.getFullYear());
    this.load();
  }

  onMonthChange(m: string): void {
    this.month.set(Number(m));
    this.load();
  }

  onYearChange(y: string): void {
    this.year.set(Number(y));
    this.load();
  }

  resetFilters(): void {
    this.searchQuery.set('');
    this.filterDevice.set('');
    this.filterShift.set('');
    this.daySearch.set(null);
  }

  hasActiveFilters = computed(
    () => !!(this.searchQuery() || this.filterDevice() || this.filterShift()),
  );

  // ---- Drawer ----

  openDrawer(row: ShiftRowData, cell: DayCellData): void {
    this.selectedPersonnelId.set('');
    this.selected.set({ row, cell });
    this.drawer.set({ row, cell });
  }

  closeDrawer(): void {
    this.drawer.set(null);
  }

  drawerAssignment = computed(() => this.drawer()?.cell.assignment ?? null);

  // ---- Drawer analytics (derived) ----

  private readonly personAssignments = computed(() => {
    const vs = this.viewState();
    const map = new Map<string, ShiftAssignment[]>();
    if (vs.status !== 'success') return map;
    for (const a of vs.schedule.assignments) {
      const list = map.get(a.personnelId) || [];
      list.push(a);
      map.set(a.personnelId, list);
    }
    return map;
  });

  personShiftCount = (personnelId: string): number =>
    this.personAssignments().get(personnelId)?.length || 0;

  personWeeklyLoad = (personnelId: string): Array<{ week: string; count: number }> => {
    const list = this.personAssignments().get(personnelId) || [];
    const byWeek = new Map<string, number>();
    for (const a of list) {
      const d = new Date(a.date);
      const first = new Date(d);
      first.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      const week = `${first.getFullYear()}-W${String(Math.floor((first.getTime() - new Date(first.getFullYear(), 0, 1).getTime()) / 604800000) + 1).padStart(2, '0')}`;
      byWeek.set(week, (byWeek.get(week) || 0) + 1);
    }
    return Array.from(byWeek.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, count]) => ({ week, count }));
  };

  personLastShift = (personnelId: string): ShiftAssignment | null => {
    const list = this.personAssignments().get(personnelId) || [];
    if (!list.length) return null;
    return [...list].sort((a, b) => b.date.localeCompare(a.date))[0];
  };

  personLastShiftLabel = (personnelId: string): string => {
    const last = this.personLastShift(personnelId);
    if (!last) return '—';
    return `${last.date} (${this.shiftKeyLabel(last.shiftType)})`;
  };

  weeklyBarWidth = (count: number): number => Math.min((count / 6) * 100, 100);

  personConsecutive = (personnelId: string): number => {
    const list = this.personAssignments().get(personnelId) || [];
    const dates = [...new Set(list.map((a) => a.date))].sort((a, b) => b.localeCompare(a));
    if (!dates.length) return 0;
    let run = 1;
    for (let i = 1; i < dates.length; i++) {
      const diff = Math.round(
        (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000,
      );
      if (diff === 1) run++;
      else break;
    }
    return run;
  };

  personHistory = (personnelId: string): Array<{ date: string; label: string; device: string }> => {
    const list = this.personAssignments().get(personnelId) || [];
    return [...list]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((a) => ({
        date: a.date,
        label: `${this.shiftKeyLabel(a.shiftType)} ${a.startTime}-${a.endTime}`,
        device: this.deviceRows().find((d) => d.id === a.deviceId)?.code || a.deviceId,
      }));
  };

  drawerCandidates = computed(() => {
    const d = this.drawer();
    if (!d) return [];
    const list = Array.from(this.employees().values()).filter(
      (e) => e.employmentStatus !== 'on_leave' && e.employmentStatus !== 'terminated',
    );
    return list
      .filter((e) => !e.employmentStatus || e.employmentStatus === 'active')
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .map((e) => ({ id: e.id, name: e.name, role: roleLabelOf(e.role) }));
  });

  dragTrayCandidates = computed(() => {
    const searchActive = this.searchQuery().trim().length > 0;
    const list = Array.from(this.employees().values())
      .filter((e) => e.employmentStatus !== 'on_leave' && e.employmentStatus !== 'terminated')
      .filter((e) => !e.employmentStatus || e.employmentStatus === 'active');
    if (searchActive) {
      const q = this.searchQuery().trim().toLowerCase();
      return list
        .filter((e) => e.name.toLowerCase().includes(q) || (e.role || '').toLowerCase().includes(q))
        .slice(0, 12)
        .map((e) => ({ id: e.id, name: e.name, role: roleLabelOf(e.role) }));
    }
    return list
      .sort((a, b) => a.name.localeCompare(b.name, 'tr'))
      .slice(0, 12)
      .map((e) => ({ id: e.id, name: e.name, role: roleLabelOf(e.role) }));
  });

  assignToDrawerCell(personnelId: string): void {
    const d = this.drawer();
    if (!d || !personnelId) return;
    this.assignTo(d.row, d.cell, personnelId);
  }

  assignTo(row: ShiftRowData, cell: DayCellData, personnelId: string): void {
    const vs = this.viewState();
    if (vs.status !== 'success' || !personnelId) return;
    const slot = row.slot;

    const run = (): void => {
      this.scheduleApi
        .directAssign(vs.schedule.unit, vs.schedule.month, vs.schedule.year, {
          personnelId,
          deviceId: row.deviceId,
          date: cell.day.dateStr,
          shiftType: slot.type,
          personnelType: slot.personnelType ?? undefined,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            this.pushUndo({
              kind: 'assign',
              assignment: {
                id: '',
                deviceId: row.deviceId,
                personnelId,
                personnelName: this.emp(personnelId)?.name || 'Personel',
                date: cell.day.dateStr,
                shiftType: slot.type as ShiftAssignment['shiftType'],
                startTime: slot.startTime,
                endTime: slot.endTime,
                isConfirmed: false,
              },
            });
            this.drawer.set(null);
            this.load();
          },
          error: (err: { message?: string }) => {
            window.alert(err?.message || 'Atama yapılamadı.');
          },
        });
    };

    const existing = cell.assignment;
    if (existing && existing.personnelId !== personnelId) {
      this.removeAssignmentQuiet(existing, run);
    } else {
      run();
    }
  }

  private removeAssignmentQuiet(a: ShiftAssignment, then: () => void): void {
    const vs = this.viewState();
    if (vs.status !== 'success' || !vs.schedule.id) {
      then();
      return;
    }
    this.scheduleApi
      .removeAssignment(vs.schedule.id, a.id, 'Plan ekranından değiştirildi')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => then(),
        error: () => window.alert('Mevcut atama kaldırılamadı.'),
      });
  }

  private pushUndo(op: HistoryOp): void {
    this.undoStack.push(op);
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
  }

  private runUndo(): void {
    const op = this.undoStack.pop();
    if (!op) return;
    this.applyInverse(op);
    this.redoStack.push(op);
  }

  private runRedo(): void {
    const op = this.redoStack.pop();
    if (!op) return;
    this.applyInverse(op);
    this.undoStack.push(op);
  }

  private applyInverse(op: HistoryOp): void {
    const vs = this.viewState();
    if (vs.status !== 'success') return;
    if (op.kind === 'assign') {
      if (op.assignment.id && vs.schedule.id) {
        this.scheduleApi
          .removeAssignment(vs.schedule.id, op.assignment.id, 'Geri alındı')
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => this.load(),
            error: () => window.alert('Geri alma başarısız.'),
          });
      }
    } else if (op.kind === 'remove') {
      this.scheduleApi
        .directAssign(vs.schedule.unit, vs.schedule.month, vs.schedule.year, {
          personnelId: op.assignment.personnelId,
          deviceId: op.assignment.deviceId,
          date: op.assignment.date,
          shiftType: op.assignment.shiftType,
          personnelType: op.assignment.personnelType ?? undefined,
          startTime: op.assignment.startTime,
          endTime: op.assignment.endTime,
        })
        .pipe(takeUntil(this.destroy$))
        .subscribe({ next: () => this.load(), error: () => window.alert('Geri alma başarısız.') });
    }
  }

  removeFromDrawerCell(): void {
    const d = this.drawer();
    const vs = this.viewState();
    const a = d?.cell.assignment;
    if (!d || vs.status !== 'success' || !a || !vs.schedule.id) return;
    if (
      !window.confirm(`${a.personnelName || 'Personel'} için atama kaldırılacak. Devam edilsin mi?`)
    )
      return;
    this.scheduleApi
      .removeAssignment(vs.schedule.id, a.id, 'Plan ekranından kaldırıldı')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.pushUndo({ kind: 'remove', assignment: a });
          this.drawer.set(null);
          this.load();
        },
        error: (err: { message?: string }) => {
          window.alert(err?.message || 'Atama kaldırılamadı.');
        },
      });
  }

  canRemove = computed(() => {
    const vs = this.viewState();
    const d = this.drawer();
    return !!d?.cell.assignment && vs.status === 'success' && !!vs.schedule.id;
  });

  drawerEmp = computed(() => {
    const d = this.drawer();
    const a = d?.cell.assignment;
    if (!a) return null;
    return this.emp(a.personnelId) ?? null;
  });

  // ---- Grid interaction (drag + wheel horizontal scroll) ----

  onGridPointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const el = this.mainScroll()?.nativeElement;
    if (!el) return;
    this.dragState = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
  }

  onGridPointerMove(e: PointerEvent): void {
    const ds = this.dragState;
    const el = this.mainScroll()?.nativeElement;
    if (!ds || !el) return;
    const dx = e.clientX - ds.x;
    const dy = e.clientY - ds.y;
    if (!this.dragWasActive && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      this.dragWasActive = true;
      el.classList.add('dragging');
    }
    if (this.dragWasActive) {
      el.scrollLeft = ds.sl - dx;
      el.scrollTop = ds.st - dy;
    }
  }

  onGridPointerUp(): void {
    this.dragState = null;
    const el = this.mainScroll()?.nativeElement;
    el?.classList.remove('dragging');
  }

  onCellClick(row: ShiftRowData, cell: DayCellData): void {
    if (cell.isClosed) return;
    const wasDrag = this.dragWasActive;
    this.dragWasActive = false;
    if (wasDrag) return;
    this.selected.set({ row, cell });
    this.openDrawer(row, cell);
  }

  onCellContextMenu(e: MouseEvent, row: ShiftRowData, cell: DayCellData): void {
    if (cell.isClosed) return;
    e.preventDefault();
    this.selected.set({ row, cell });
    this.contextMenu.set({ row, cell, x: e.clientX, y: e.clientY });
  }

  closeContextMenu(): void {
    this.contextMenu.set(null);
  }

  cellTitle(row: ShiftRowData, cell: DayCellData): string {
    const a = cell.assignment;
    if (!a) return `${row.deviceName} · ${cell.day.dayNumber} ${this.monthLabel()}`;
    const parts: string[] = [
      `${a.personnelName || 'Personel'} — ${this.roleLabel(a.personnelType)}`,
      `${row.deviceCode} · ${this.shiftKeyLabel(row.slot.type)} ${this.slotTimeRange(row.slot)}`,
    ];
    if (cell.day.holidayName) parts.push(`Tatil: ${cell.day.holidayName}`);
    if (cell.leave) parts.push('İzinli');
    if (cell.report) parts.push('Raporlu');
    if (cell.overtime) parts.push('Fazla mesai');
    if (cell.conflict) parts.push('Aynı gün çakışma');
    if (cell.cert) parts.push('Yeterlilik uyarısı');
    for (const w of cell.warnings) parts.push(w.label);
    const note = this.cellNotes().get(a.id);
    if (note) parts.push(`Not: ${note}`);
    return parts.join('\n');
  }

  // ---- Clipboard / context menu actions ----

  copySelected(): void {
    const s = this.selected();
    if (s?.cell.assignment) {
      this.clipboard.set(s.cell.assignment);
    }
    this.contextMenu.set(null);
  }

  pasteIntoSelected(): void {
    const s = this.selected();
    const src = this.clipboard();
    if (!s || !src) return;
    this.assignTo(s.row, s.cell, src.personnelId);
    this.contextMenu.set(null);
  }

  deleteSelected(): void {
    const s = this.selected();
    const vs = this.viewState();
    const a = s?.cell.assignment;
    if (!s || vs.status !== 'success' || !a || !vs.schedule.id) return;
    if (
      !window.confirm(`${a.personnelName || 'Personel'} için atama kaldırılacak. Devam edilsin mi?`)
    )
      return;
    this.contextMenu.set(null);
    this.scheduleApi
      .removeAssignment(vs.schedule.id, a.id, 'Kısayol ile kaldırıldı')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.pushUndo({ kind: 'remove', assignment: a });
          this.drawer.set(null);
          this.load();
        },
        error: (err: { message?: string }) => {
          window.alert(err?.message || 'Atama kaldırılamadı.');
        },
      });
  }

  noteSelected(): void {
    const a = this.selected()?.cell.assignment;
    if (!a) {
      this.contextMenu.set(null);
      return;
    }
    const current = this.cellNotes().get(a.id) || '';
    const value = window.prompt('Hücre notu:', current);
    if (value !== null) {
      this.cellNotes.update((m) => {
        const nm = new Map(m);
        if (value.trim()) nm.set(a.id, value.trim());
        else nm.delete(a.id);
        return nm;
      });
    }
    this.contextMenu.set(null);
  }

  toggleLeaveSelected(): void {
    const a = this.selected()?.cell.assignment;
    if (!a) {
      this.contextMenu.set(null);
      return;
    }
    this.leaveFlags.update((s) => {
      const ns = new Set(s);
      if (ns.has(a.id)) ns.delete(a.id);
      else ns.add(a.id);
      return ns;
    });
    this.contextMenu.set(null);
  }

  toggleOvertimeSelected(): void {
    const a = this.selected()?.cell.assignment;
    if (!a) {
      this.contextMenu.set(null);
      return;
    }
    this.overtimeFlags.update((s) => {
      const ns = new Set(s);
      if (ns.has(a.id)) ns.delete(a.id);
      else ns.add(a.id);
      return ns;
    });
    this.contextMenu.set(null);
  }

  switchSelected(): void {
    const s = this.selected();
    if (s) this.openDrawer(s.row, s.cell);
    this.contextMenu.set(null);
  }

  // ---- Drag & drop personnel ----

  onPersonDragStart(e: DragEvent, personnelId: string): void {
    this.dragPersonnelId.set(personnelId);
    if (e.dataTransfer) {
      e.dataTransfer.setData('text/plain', personnelId);
      e.dataTransfer.effectAllowed = 'move';
    }
  }

  onPersonDragEnd(): void {
    this.dragPersonnelId.set('');
    this.dragOverKey.set('');
  }

  cellDragKey(row: ShiftRowData, cell: DayCellData): string {
    return `${row.key}|${cell.day.dateStr}`;
  }

  onCellDragEnter(row: ShiftRowData, cell: DayCellData): void {
    if (cell.isClosed) return;
    this.dragOverKey.set(this.cellDragKey(row, cell));
  }

  onCellDragOver(e: DragEvent): void {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  onCellDragLeave(): void {
    if (this.dragOverKey()) this.dragOverKey.set('');
  }

  onCellDrop(row: ShiftRowData, cell: DayCellData): void {
    this.dragOverKey.set('');
    if (cell.isClosed) return;
    const pid = this.dragPersonnelId() || '';
    this.dragPersonnelId.set('');
    if (pid) this.assignTo(row, cell, pid);
  }

  // ---- Day navigation / goto ----

  goToDay(): void {
    const v = this.daySearch();
    if (v === null || Number.isNaN(v) || v < 1 || v > 31) return;
    this.scrollToDay(v);
  }

  scrollToDay(dayNumber: number): void {
    const el = this.mainScroll()?.nativeElement;
    if (!el) return;
    const target = 360 + (dayNumber - 1) * this.dayWidth();
    el.scrollTo({ left: target, behavior: 'smooth' });
  }

  scrollDaysBy(n: number): void {
    const el = this.mainScroll()?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: n * this.dayWidth() * 2, behavior: 'smooth' });
  }

  scrollToTodayColumn(): void {
    this.scrollToDay(new Date().getDate());
  }

  setZoom(z: string): void {
    if (z === 'compact' || z === 'small' || z === 'medium' || z === 'large') {
      this.zoom.set(z);
    }
  }

  // ---- Keyboard shortcuts ----

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const target = e.target as HTMLElement | null;
    const isInput =
      !!target &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA');

    if (e.key === 'Escape') {
      this.closeContextMenu();
      this.closeDrawer();
      return;
    }

    if (isInput) return;

    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      this.searchInput()?.nativeElement.focus();
      return;
    }
    if (ctrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      this.runUndo();
      return;
    }
    if (ctrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      this.runRedo();
      return;
    }
    if (ctrl && (e.key === 'c' || e.key === 'C')) {
      this.copySelected();
      return;
    }
    if (ctrl && (e.key === 'v' || e.key === 'V')) {
      e.preventDefault();
      this.pasteIntoSelected();
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      this.deleteSelected();
      return;
    }
  };

  cellColor(slot: ShiftSlot): 'day' | 'night' | 'evening' | 'assistant' {
    if (slot.personnelType === 'assistant_technician') return 'assistant';
    return this.slotKind(slot);
  }

  coverageClass(row: ShiftRowData): 'ok' | 'warn' | 'low' {
    if (row.total === 0) return 'low';
    const pct = (row.filled * 100) / row.total;
    if (pct >= 80) return 'ok';
    if (pct >= 50) return 'warn';
    return 'low';
  }

  onGridWheel(e: WheelEvent): void {
    const el = this.mainScroll()?.nativeElement;
    if (!el) return;
    if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY !== 0 && !e.shiftKey ? e.deltaX : e.deltaY;
      return;
    }
  }

  cellWasDragged(): boolean {
    return this.dragWasActive;
  }

  // ---- Header actions ----

  exportExcel(): void {
    const vs = this.viewState();
    if (vs.status !== 'success') return;
    const token = this.auth.token() || '';
    const url = this.scheduleApi.getExportExcelUrl(
      vs.schedule.unit,
      vs.schedule.month,
      vs.schedule.year,
    );
    const a = document.createElement('a');
    a.download = `vardiya_plani_${this.unitLabel()}_${this.monthLabel().replace(' ', '_')}.xlsx`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const obj = URL.createObjectURL(blob);
        a.href = obj;
        a.click();
        URL.revokeObjectURL(obj);
      })
      .catch(() => window.open(url, '_blank'));
  }

  exportPdf(): void {
    const vs = this.viewState();
    if (vs.status !== 'success') return;
    const token = this.auth.token() || '';
    const url = this.scheduleApi.getExportPdfUrl(
      vs.schedule.unit,
      vs.schedule.month,
      vs.schedule.year,
    );
    const a = document.createElement('a');
    a.download = `vardiya_plani_${this.unitLabel()}_${this.monthLabel().replace(' ', '_')}.pdf`;
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const obj = URL.createObjectURL(blob);
        a.href = obj;
        a.click();
        URL.revokeObjectURL(obj);
      })
      .catch(() => window.open(url, '_blank'));
  }

  printRoster(): void {
    window.print();
  }

  publish(): void {
    const vs = this.viewState();
    if (vs.status !== 'success') return;
    if (vs.schedule.status === 'published') return;
    if (
      !window.confirm(
        `${this.unitLabel()} birimi ${this.monthLabel()} planı yayınlanacak. Devam edilsin mi?`,
      )
    )
      return;
    this.scheduleApi
      .publishUnitSchedule(this.unit(), this.month(), this.year())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => this.load(),
        error: (err: { message?: string }) => {
          window.alert(err?.message || 'Yayınlama sırasında bir hata oluştu.');
        },
      });
  }

  goToPersonnel(): void {
    this.router.navigate(['/app/employees']);
  }

  goToInsights(): void {
    this.router.navigate(['/app/reports']);
  }

  loadIfError(): void {
    this.load();
  }

  initials = initialsOf;
  roleLabel = roleLabelOf;

  formatTime(d: Date | null): string {
    if (!d) return '';
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  }

  slotTimeRange(slot: ShiftSlot): string {
    return `${slot.startTime} – ${slot.endTime}`;
  }

  ngOnInit(): void {
    window.addEventListener('keydown', this.onKeyDown);
    this.load();
  }

  ngOnDestroy(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.destroy$.next();
    this.destroy$.complete();
  }

  private load(): void {
    this.viewState.set({ status: 'loading' });
    this.overrides.set(new Map());
    this.drawer.set(null);
    this.contextMenu.set(null);
    this.clipboard.set(null);
    this.cellNotes.set(new Map());
    this.leaveFlags.set(new Set());
    this.overtimeFlags.set(new Set());
    this.undoStack = [];
    this.redoStack = [];
    forkJoin({
      schedule: this.scheduleApi.loadScheduleByUnit(this.unit(), this.month(), this.year()),
      overrides: this.scheduleApi
        .getShiftOverrides(this.unit(), this.month(), this.year())
        .pipe(catchError(() => of([]))),
      employees: this.employeeApi.getAll().pipe(catchError(() => of([]))),
      deviceStatuses: this.deviceStatusApi.getMyUnitDevices().pipe(catchError(() => of([]))),
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: ({ schedule, overrides, employees, deviceStatuses }) => {
          const unitType = this.unit();
          this.employees.set(
            new Map(
              (employees || [])
                .filter(
                  (e) => e.unit?.type === unitType || e.unit?.code?.toLowerCase() === unitType,
                )
                .map((e) => [e.id, e]),
            ),
          );
          this.overrides.set(
            new Map((overrides || []).map((o) => [this.overrideKey(o.shiftId, o.date), o])),
          );
          this.deviceStatuses.set(
            new Map(
              (deviceStatuses || [])
                .filter((d) => !!d?.id)
                .map((d) => [d.id, d.currentStatus?.status || 'active']),
            ),
          );
          if (schedule && schedule.devices && schedule.devices.length > 0) {
            this.lastUpdated.set(new Date());
            this.viewState.set({ status: 'success', schedule });
            this.expandedBlocks.set(
              this.deviceRows()
                .map((r) => blockKeyOf(r.blockCode))
                .filter((v, i, a) => a.indexOf(v) === i),
            );
            this.expandedDevices.set(schedule.devices.map((d) => d.id));
          } else {
            this.expandedBlocks.set([]);
            this.expandedDevices.set([]);
            this.viewState.set({
              status: 'empty',
              reason: `${this.unitLabel()} birimi için ${this.monthLabel()} döneminde plan bulunamadı. Ay/yıl navigasyonunu kullanarak farklı bir dönem seçin.`,
            });
          }
        },
        error: () => {
          this.expandedBlocks.set([]);
          this.expandedDevices.set([]);
          this.viewState.set({
            status: 'error',
            message: 'Plan verileri yüklenemedi. Lütfen sayfayı yenileyip tekrar deneyin.',
          });
        },
      });
  }
}
