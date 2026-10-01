import {
  Component,
  inject,
  input,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from '../../services/schedule.service';
import { PersonAssignmentDialogComponent } from '../person-assignment-dialog/person-assignment-dialog.component';
import type {
  PersonShiftsResponse,
  PersonShiftReportResponse,
  PersonShiftTemplate,
  PersonShiftAssignment,
} from '../../domain/models';
import { ShiftTypeEnum } from '../../domain/enums';

interface Cell {
  date: string;
  assignment: PersonShiftAssignment | null;
  isToday: boolean;
  isWeekend: boolean;
}

interface TemplateRow {
  template: PersonShiftTemplate;
  cells: Cell[];
}

interface GroupBlock {
  group: {
    id: string;
    code: string;
    name: string;
    description?: string | null;
    personnelCount: number;
  };
  rows: TemplateRow[];
  totalAssigned: number;
}

interface DialogState {
  group: { id: string; code: string; name: string };
  template: PersonShiftTemplate;
  date: string;
  assignment: PersonShiftAssignment | null;
}

@Component({
  selector: 'app-person-shift-view',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, PersonAssignmentDialogComponent],
  templateUrl: './person-shift-view.component.html',
  styleUrl: './person-shift-view.component.scss',
})
export class PersonShiftViewComponent {
  private readonly scheduleService = inject(ScheduleService);

  readonly unit = input.required<string>();
  readonly month = input.required<number>();
  readonly year = input.required<number>();

  readonly data = signal<PersonShiftsResponse | null>(null);
  readonly report = signal<PersonShiftReportResponse | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string>('');
  readonly view = signal<'grid' | 'report'>('grid');
  readonly reportGroupFilter = signal<string>('');
  readonly dialog = signal<DialogState | null>(null);

  readonly unitLabel = computed(() => {
    const map: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      nukleer: 'Nükleer Tıp',
      onkoloji: 'Onkoloji',
      supervizor: 'Süpervizör',
    };
    return map[this.unit().toLowerCase()] || this.unit();
  });

  readonly days = computed(() => {
    const month = this.month();
    const year = this.year();
    const count = new Date(year, month, 0).getDate();
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
    const out: Array<{
      num: number;
      name: string;
      date: string;
      isWeekend: boolean;
      isToday: boolean;
    }> = [];
    const todayStr = new Date().toISOString().split('T')[0];
    for (let d = 1; d <= count; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dow = dateObj.getDay();
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      out.push({
        num: d,
        name: dayNames[dow === 0 ? 6 : dow - 1],
        date: dateStr,
        isWeekend: dow === 0 || dow === 6,
        isToday: dateStr === todayStr,
      });
    }
    return out;
  });

  readonly blocks = computed<GroupBlock[]>(() => {
    const d = this.data();
    if (!d) return [];
    return d.groups.map((g) => {
      const assignments = g.assignments || [];
      const rows: TemplateRow[] = g.templates.map((t) => {
        const cells: Cell[] = this.days().map((day) => {
          const match =
            assignments.find((a) => a.date === day.date && a.shiftType === t.shiftType) || null;
          return {
            date: day.date,
            assignment: match,
            isToday: day.isToday,
            isWeekend: day.isWeekend,
          };
        });
        return { template: t, cells };
      });
      return {
        group: {
          id: g.id,
          code: g.code,
          name: g.name,
          description: g.description,
          personnelCount: g.personnelCount,
        },
        rows,
        totalAssigned: assignments.length,
      };
    });
  });

  readonly totalAssignments = computed(
    () => this.data()?.groups.reduce((s, g) => s + (g.assignments?.length || 0), 0) || 0,
  );

  readonly filteredReportRows = computed(() => {
    const r = this.report();
    if (!r) return [];
    const gid = this.reportGroupFilter();
    return r.rows.filter((row) => !gid || row.groupId === gid);
  });

  readonly editable = computed(() => {
    const status = this.data()?.status;
    return status === 'draft' || status === 'under_review' || status === 'published';
  });

  constructor() {
    effect(() => {
      this.unit();
      this.month();
      this.year();
      this.load();
    });
  }

  private load(): void {
    const unit = this.unit();
    const month = this.month();
    const year = this.year();
    if (!unit || !month || !year) return;
    this.loading.set(true);
    this.error.set('');
    this.data.set(null);
    this.report.set(null);
    this.scheduleService.loadPersonShifts(unit, month, year).subscribe({
      next: (res) => {
        this.data.set(res);
        this.reportGroupFilter.set('');
      },
      error: () => {
        this.data.set(null);
      },
      complete: () => {
        this.loading.set(false);
        this.loadReport();
      },
    });
  }

  private loadReport(): void {
    const unit = this.unit();
    const month = this.month();
    const year = this.year();
    this.scheduleService.loadPersonShiftReport(unit, month, year).subscribe({
      next: (res) => this.report.set(res),
      error: () => this.report.set(null),
    });
  }

  setView(v: 'grid' | 'report'): void {
    this.view.set(v);
  }

  openDialog(block: GroupBlock, row: TemplateRow, cell: Cell): void {
    if (!this.editable()) return;
    this.dialog.set({
      group: block.group,
      template: row.template,
      date: cell.date,
      assignment: cell.assignment,
    });
  }

  onSaved(): void {
    this.dialog.set(null);
    this.load();
  }

  shiftLabel(t: string): string {
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
    };
    return map[t] || t;
  }

  shiftColor(t: string): string {
    const map: Record<string, string> = {
      day: '#fbbf24',
      evening: '#f97316',
      night: '#6366f1',
      morning: '#22d3ee',
    };
    return map[t] || '#64748b';
  }

  isNightShift(t: string): boolean {
    return t === ShiftTypeEnum.NIGHT || t === ShiftTypeEnum.EVENING;
  }

  monthLabel(): string {
    const months = [
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
    return `${months[this.month() - 1]} ${this.year()}`;
  }

  groupColor(id: string): string {
    const colors = [
      '#3b82f6',
      '#8b5cf6',
      '#10b981',
      '#f59e0b',
      '#ec4899',
      '#14b8a6',
      '#f97316',
      '#06b6d4',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  personBg(id: string): string {
    const colors = [
      '#3b82f6',
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ];
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  initials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  cellTitle(cell: Cell, row: TemplateRow): string {
    if (cell.assignment) {
      return `${cell.assignment.personnelName} — ${this.shiftLabel(cell.assignment.shiftType)} (${cell.assignment.startTime}-${cell.assignment.endTime})`;
    }
    return `${row.template.name} (${this.shiftLabel(row.template.shiftType)})`;
  }
}
