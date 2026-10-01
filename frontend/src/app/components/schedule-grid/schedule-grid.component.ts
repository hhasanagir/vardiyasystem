import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
  HostListener,
  Inject,
  PLATFORM_ID,
  NgZone,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { type ShiftAssignment } from '../../domain/models';

interface DayColumn {
  date: Date;
  dateStr: string;
  dayNumber: number;
  dayName: string;
  dayNum: number;
  isWeekend: boolean;
  isHoliday: boolean;
  holidayName?: string;
  holidayType?: string;
  isToday: boolean;
}

interface DeviceShiftInfo {
  type: string;
  startTime: string;
  endTime: string;
  name: string;
  personnelType: string | null;
}

interface DeviceInfo {
  id: string;
  code: string;
  name: string;
  mode: 'vardiya' | 'polyclinic';
  tripleShift: boolean;
  shifts: DeviceShiftInfo[];
}

interface DragState {
  isDragging: boolean;
  sourceAssignment: {
    deviceId: string;
    date: string;
    shiftType: string;
    personnelId?: string;
    personnelName?: string;
  } | null;
  targetSlot: { deviceId: string; date: string; shiftType: string } | null;
  isValid: boolean;
}

interface SlotEvent {
  deviceId: string;
  date: string;
  shiftType: string;
  personnelType?: string | null;
  startTime?: string;
  endTime?: string;
}

@Component({
  selector: 'app-schedule-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './schedule-grid.component.html',
  styleUrls: ['./schedule-grid.component.scss'],
})
export class ScheduleGridComponent {
  readonly assignments = input<ShiftAssignment[]>([]);
  readonly days = input<DayColumn[]>([]);
  readonly devices = input<DeviceInfo[]>([]);
  readonly dragState = input<DragState>({
    isDragging: false,
    sourceAssignment: null,
    targetSlot: null,
    isValid: false,
  });
  readonly showOnboarding = input(false);
  readonly showLeftFade = input(false);
  readonly showRightFade = input(true);
  readonly compactLayout = input(false);
  readonly onboardingHint = input('');
  readonly deviceFilter = input('');
  readonly shiftTypeFilter = input('');
  readonly roleFilter = input('');
  readonly statusFilter = input('');
  readonly showEmptyOnly = input(false);
  readonly density = input<'compact' | 'normal' | 'comfortable'>('normal');
  readonly allowPolyclinicSaturday = input(false);

  readonly scroll = output<Event>();
  readonly dismissOnboarding = output<void>();
  readonly addAssignment = output<SlotEvent>();
  readonly editAssignment = output<SlotEvent>();
  readonly deleteAssignment = output<SlotEvent & { personnelId?: string }>();
  readonly copyAssignment = output<SlotEvent & { personnelId: string; personnelName: string }>();
  readonly dragStart = output<{ event: DragEvent } & SlotEvent>();
  readonly dragOver = output<{ event: DragEvent } & SlotEvent>();
  readonly dragLeave = output<void>();
  readonly drop = output<{ event: DragEvent } & SlotEvent>();
  readonly dragEnd = output<void>();
  readonly hoverAssignment = output<{ event: MouseEvent } & SlotEvent>();
  readonly moveTooltip = output<MouseEvent>();
  readonly leaveTooltip = output<void>();
  readonly contextMenu = output<
    { event: MouseEvent } & SlotEvent & { personnelName: string; personnelId?: string }
  >();

  constructor(
    @Inject(PLATFORM_ID) private platformId: object,
    private ngZone: NgZone,
  ) {}

  private assignmentCache = computed(() => this.assignments());

  readonly visibleDevices = computed(() => {
    const q = this.deviceFilter().trim().toLocaleLowerCase('tr-TR');
    if (!q) return this.devices();
    return this.devices().filter(
      (d) =>
        (d.code || '').toLocaleLowerCase('tr-TR').includes(q) ||
        (d.name || '').toLocaleLowerCase('tr-TR').includes(q),
    );
  });

  isShiftVisible(shift: { type: string; personnelType?: string | null }): boolean {
    const sf = this.shiftTypeFilter();
    if (sf && !this.shiftTypeMatches(shift.type, sf)) return false;
    const rf = this.roleFilter();
    if (rf) {
      const pt = (shift.personnelType || '').toLocaleLowerCase('tr-TR');
      const label = this.getPersonnelTypeLabel(shift).toLocaleLowerCase('tr-TR');
      const q = rf.toLocaleLowerCase('tr-TR');
      if (pt !== q && label !== q) return false;
    }
    return true;
  }

  isShiftVisibleFallback(device: DeviceInfo): boolean {
    const sf = this.shiftTypeFilter();
    if (!sf) return true;
    if (device.mode === 'vardiya') {
      return this.shiftTypeMatches('night', sf) || this.shiftTypeMatches('day', sf);
    }
    return this.shiftTypeMatches('day', sf);
  }

  isFirstShift(device: DeviceInfo, idx: number): boolean {
    return idx === 0;
  }

  isLastShift(device: DeviceInfo, idx: number): boolean {
    return idx === device.shifts.length - 1;
  }

  getShiftBadge(shift: {
    type: string;
    startTime: string;
    endTime: string;
    name?: string;
    personnelType?: string | null;
  }): string {
    const t = shift.type.toLowerCase();
    let label = '';
    if (t === 'day') label = `GÜNDÜZ`;
    else if (t === 'evening') label = `İKİNDİ`;
    else if (t === 'night') label = `GECE`;
    else if (t === 'morning' || t === 'sabah') label = `SABAH`;
    else label = shift.type.toUpperCase();
    return `${label} ${shift.startTime}-${shift.endTime}`;
  }

  isCellDimmed(
    device: DeviceInfo,
    day: DayColumn,
    shiftType: string,
    slotPt?: string | null,
    slotIndex?: number,
  ): boolean {
    if (!this.showEmptyOnly()) return false;
    return this.getAssignment(device, day, shiftType, slotPt, slotIndex) !== null;
  }

  private shiftTypeMatches(aShift: string, slot: string): boolean {
    const a = aShift.toLowerCase();
    const s = slot.toLowerCase();
    if (s === 'gunduz' || s === 'day') return a === 'day' || a.includes('gunduz');
    if (s === 'gece' || s === 'night') return a === 'night' || a.includes('gece');
    if (s === 'ikindi' || s === 'evening')
      return a === 'evening' || a.includes('ogle') || a.includes('ikindi');
    if (s === 'sabah' || s === 'morning') return a === 'morning' || a.includes('sabah');
    return a === s;
  }

  private pickAssignment(
    candidates: ShiftAssignment[],
    slotPt: string | null | undefined,
    device: DeviceInfo,
    shiftType: string,
    slotIndex: number | null,
  ): ShiftAssignment | null {
    if (!slotPt) return candidates[0];
    const exact = candidates.find((a) => (a.personnelType || '') === slotPt);
    if (exact) return exact;
    const slotPts = device.shifts
      .filter((s) => this.shiftTypeMatches(s.type, shiftType))
      .map((s) => s.personnelType)
      .filter((p): p is string => !!p);
    const orphan = candidates.find((a) => a.personnelType && !slotPts.includes(a.personnelType));
    if (orphan && slotIndex !== null && slotIndex === this.firstOfTypeIndex(device, shiftType))
      return orphan;
    return null;
  }

  private firstOfTypeIndex(device: DeviceInfo, shiftType: string): number {
    return device.shifts.findIndex((s) => this.shiftTypeMatches(s.type, shiftType));
  }

  getAssignment(
    device: DeviceInfo,
    day: DayColumn,
    shiftType: string,
    slotPt?: string | null,
    slotIndex?: number,
  ): { personnelId: string; personnelName: string } | null {
    const assignments = this.assignmentCache();
    const candidates = assignments.filter(
      (a) =>
        a.deviceId === device.id &&
        a.date === day.dateStr &&
        this.shiftTypeMatches(a.shiftType, shiftType),
    );
    if (candidates.length === 0) return null;
    const match = this.pickAssignment(candidates, slotPt, device, shiftType, slotIndex ?? null);
    if (!match) return null;
    const st = this.statusFilter();
    if (st) {
      const s = match.status || (match.isConfirmed ? 'confirmed' : 'planned');
      if (s !== st) return null;
    }
    return { personnelId: match.personnelId, personnelName: match.personnelName || '' };
  }

  getInitial(name: string): string {
    return name ? name.charAt(0).toUpperCase() : '?';
  }

  isDragTarget(deviceId: string, date: string, shiftType: string): boolean {
    const s = this.dragState();
    const t = s.targetSlot;
    return (
      s.isValid &&
      t !== null &&
      t.deviceId === deviceId &&
      t.date === date &&
      t.shiftType === shiftType
    );
  }

  isShiftUnavailable(device: DeviceInfo, day: DayColumn, _shiftType: string): boolean {
    if (device.mode !== 'polyclinic') return false;
    if (day.isHoliday) return true;
    if (this.allowPolyclinicSaturday()) return day.dayNum === 0;
    return day.isWeekend;
  }

  isPolyclinicClosed(device: DeviceInfo, day: DayColumn): boolean {
    return this.isShiftUnavailable(device, day, 'day');
  }

  getShiftTypeClass(shiftType: string): string {
    const t = shiftType.toLowerCase();
    if (t === 'day' || t === 'gündüz' || t === 'gunduz') return 'day';
    if (t === 'evening' || t === 'ikindi' || t === 'öğle' || t === 'ogle') return 'ikindi';
    if (t === 'night' || t === 'gece') return 'night';
    if (t === 'morning' || t === 'sabah') return 'sabah';
    return 'day';
  }

  getShiftLabel(shift: {
    type: string;
    startTime: string;
    endTime: string;
    name?: string;
    personnelType?: string | null;
  }): string {
    const t = shift.type.toLowerCase();
    let label = '';
    if (t === 'day') label = `GÜNDÜZ ${shift.startTime}-${shift.endTime}`;
    else if (t === 'evening') label = `İKİNDİ ${shift.startTime}-${shift.endTime}`;
    else if (t === 'night') label = `GECE ${shift.startTime}-${shift.endTime}`;
    else if (t === 'morning' || t === 'sabah') label = `SABAH ${shift.startTime}-${shift.endTime}`;
    else label = `${shift.type.toUpperCase()} ${shift.startTime}-${shift.endTime}`;
    const personnelTypeLabel = this.getPersonnelTypeLabel(shift);
    if (shift.name && shift.name !== personnelTypeLabel) label += ` · ${shift.name}`;
    return label;
  }

  getPersonnelTypeLabel(shift: { personnelType?: string | null }): string {
    if (!shift.personnelType) return '';
    const map: Record<string, string> = {
      assistant_technician: 'Yardımcı Tekniker',
      technician: 'Tekniker',
      technician_2: 'Tekniker',
      technician_3: 'Tekniker',
      technician_4: 'Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
      medical_physicist: 'Sağlık Fizikçisi',
      medical_physicist_2: 'Sağlık Fizikçisi',
      medical_physicist_3: 'Sağlık Fizikçisi',
      planning: 'Planlama',
    };
    return map[shift.personnelType] || shift.personnelType;
  }

  getRowClass(shiftType: string): string {
    const cls = this.getShiftTypeClass(shiftType);
    if (cls === 'day') return 'day-shift-row';
    if (cls === 'night') return 'night-shift-row';
    if (cls === 'ikindi') return 'ikindi-shift-row';
    if (cls === 'sabah') return 'sabah-shift-row';
    return '';
  }

  getCellClass(shiftType: string): string {
    const cls = this.getShiftTypeClass(shiftType);
    if (cls === 'night') return 'person-cell night-cell';
    if (cls === 'ikindi') return 'person-cell ikindi-cell';
    if (cls === 'sabah') return 'person-cell sabah-cell';
    return 'person-cell';
  }

  getLabelCellClass(shiftType: string): string {
    const cls = this.getShiftTypeClass(shiftType);
    if (cls === 'ikindi') return 'shift-label ikindi-label-cell';
    if (cls === 'night') return 'shift-label night-label-cell';
    return 'shift-label day-label-cell';
  }

  onWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement;
    if (event.shiftKey || Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
      el.scrollLeft += event.deltaX || event.deltaY;
      event.preventDefault();
    }
  }
}
