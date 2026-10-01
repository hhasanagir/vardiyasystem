import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { MessageService } from 'primeng/api';
import { Subject, forkJoin } from 'rxjs';
import { finalize } from 'rxjs/operators';
import {
  ScheduleService,
  ScheduleAnalytics,
  DetailedEmployeeWorkload,
} from '../../services/schedule.service';

interface DailyStats {
  date: string;
  dayName: string;
  dayNum: number;
  totalShifts: number;
  filledShifts: number;
  emptyShifts: number;
  coveragePercent: number;
  mrFilled: number;
  mrEmpty: number;
  btFilled: number;
  btEmpty: number;
}

interface EmployeeStats {
  id: string;
  name: string;
  color: string;
  totalShifts: number;
  dayShifts: number;
  nightShifts: number;
  weekendShifts: number;
  coveragePercent: number;
}

interface UnitStats {
  unit: string;
  totalDevices: number;
  totalShifts: number;
  filled: number;
  empty: number;
  coverage: number;
  avgPerDevice: number;
}

const EMPLOYEE_COLORS = [
  '#3b82f6',
  '#06b6d4',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
];

@Component({
  selector: 'app-reports',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ToastModule, DialogModule],
  providers: [MessageService],
  templateUrl: './reports.component.html',
  styleUrl: './reports.component.scss',
})
export class ReportsComponent implements OnInit, OnDestroy {
  private messageService = inject(MessageService);
  private scheduleService = inject(ScheduleService);
  private destroy$ = new Subject<void>();

  selectedMonth = signal(new Date('2026-05-01'));
  activeReport = signal<'overview' | 'daily' | 'employee' | 'unit'>('overview');
  showExportDialog = signal(false);
  loading = signal(false);

  dailyStats = signal<DailyStats[]>([]);
  employeeStats = signal<EmployeeStats[]>([]);
  unitStats = signal<UnitStats[]>([]);
  analytics = signal<ScheduleAnalytics | null>(null);

  monthLabel = computed(() => {
    const date = this.selectedMonth();
    return date.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  });

  totalSummary = computed(() => {
    const a = this.analytics();
    if (a) {
      return {
        totalShifts: a.totalShifts || 0,
        filledShifts: (a.totalShifts || 0) - (a.emptyShifts || 0),
        emptyShifts: a.emptyShifts || 0,
        coverage: a.coveragePercent || 0,
      };
    }
    const daily = this.dailyStats();
    const total = daily.reduce((sum, d) => sum + d.totalShifts, 0);
    const filled = daily.reduce((sum, d) => sum + d.filledShifts, 0);
    return {
      totalShifts: total,
      filledShifts: filled,
      emptyShifts: total - filled,
      coverage: total > 0 ? Math.round((filled / total) * 100) : 0,
    };
  });

  ngOnInit() {
    this.loadData();
  }

  private loadData() {
    this.loading.set(true);
    const month = this.selectedMonth();
    const startDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-${new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()}`;

    forkJoin({
      analytics: this.scheduleService.getAnalytics(startDate, endDate).pipe(finalize(() => {})),
      employeeWl: this.scheduleService
        .getEmployeeWorkload(startDate, endDate)
        .pipe(finalize(() => {})),
      schedules: this.scheduleService
        .loadSchedules({ month: month.getMonth() + 1, year: month.getFullYear() })
        .pipe(finalize(() => {})),
    })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: ({ analytics, employeeWl, schedules }) => {
          this.analytics.set(analytics);

          const empStats: EmployeeStats[] = (Array.isArray(employeeWl) ? employeeWl : []).map(
            (e, i) => ({
              id: e.employeeId,
              name: e.employeeName,
              color: EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length],
              totalShifts: e.totalShifts,
              dayShifts: e.dayShifts,
              nightShifts: e.nightShifts,
              weekendShifts: e.weekendShifts,
              coveragePercent: Math.min(
                100,
                Math.round((e.totalShifts / Math.max(1, e.totalShifts + e.nightShifts)) * 100),
              ),
            }),
          );
          this.employeeStats.set(empStats.sort((a, b) => b.totalShifts - a.totalShifts));

          const units = (schedules?.schedules || []).map((s: any) => {
            const totalSlots = (s.devices?.length || 1) * 2;
            const filled = s.assignments?.length || 0;
            return {
              unit: s.unit || s.unitId || 'Bilinmeyen',
              totalDevices: s.devices?.length || 1,
              totalShifts: totalSlots,
              filled,
              empty: totalSlots - filled,
              coverage: totalSlots > 0 ? Math.round((filled / totalSlots) * 100) : 0,
              avgPerDevice: Math.round(filled / Math.max(1, s.devices?.length || 1)),
            };
          });
          this.unitStats.set(units);

          this.deriveDailyStats(schedules?.schedules || [], analytics);
        },
        error: () => {
          this.messageService.add({
            severity: 'error',
            summary: 'Hata',
            detail: 'Rapor verileri yüklenemedi',
          });
        },
      });
  }

  private deriveDailyStats(schedules: any[], analytics: ScheduleAnalytics) {
    const month = this.selectedMonth();
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const dayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    const daily: DailyStats[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, monthIndex, d);
      const dayOfWeek = date.getDay();
      const dayName = dayNames[dayOfWeek === 0 ? 6 : dayOfWeek - 1];
      daily.push({
        date: `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayName,
        dayNum: d,
        totalShifts: 0,
        filledShifts: 0,
        emptyShifts: 0,
        coveragePercent: 0,
        mrFilled: 0,
        mrEmpty: 0,
        btFilled: 0,
        btEmpty: 0,
      });
    }

    for (const schedule of schedules) {
      const unitKey = schedule.unit || schedule.unitId || '';
      if (unitKey !== 'mr' && unitKey !== 'bt') continue;
      for (const a of schedule.assignments || []) {
        const dayIdx = daily.findIndex((d) => d.date === a.date);
        if (dayIdx === -1) continue;
        daily[dayIdx].totalShifts += 1;
        daily[dayIdx].filledShifts += 1;
        if (unitKey === 'mr') daily[dayIdx].mrFilled += 1;
        if (unitKey === 'bt') daily[dayIdx].btFilled += 1;
      }
    }

    for (const d of daily) {
      const assumedTotal =
        (daily.length > 0 ? Math.round(analytics.totalShifts / daily.length) : 8) * 2;
      d.totalShifts = Math.max(d.totalShifts, d.filledShifts);
      d.emptyShifts = d.totalShifts - d.filledShifts;
      d.coveragePercent =
        d.totalShifts > 0 ? Math.round((d.filledShifts / d.totalShifts) * 100) : 0;
    }

    this.dailyStats.set(daily);
  }

  changeMonth(offset: number): void {
    const current = this.selectedMonth();
    current.setMonth(current.getMonth() + offset);
    this.selectedMonth.set(new Date(current));
    this.loadData();
  }

  setActiveReport(report: 'overview' | 'daily' | 'employee' | 'unit'): void {
    this.activeReport.set(report);
  }

  exportToExcel(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Dışa Aktar',
      detail: 'Dışa aktarma hazırlanıyor...',
    });
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
