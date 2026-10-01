import {
  Component,
  signal,
  computed,
  inject,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PageHeaderComponent } from '../../shared/page-header/page-header.component';
import { PageContext } from '../../shared/page-header/page-header.types';
import {
  DutyRosterService,
  DutyRosterEntry,
  DutyRosterCalendarDay,
} from './services/duty-roster.service';

@Component({
  selector: 'app-duty-roster',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent],
  templateUrl: './duty-roster.component.html',
  styleUrls: ['./duty-roster.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DutyRosterComponent implements OnInit {
  private readonly dutyRosterService = inject(DutyRosterService);

  readonly pageContext = signal<PageContext>({
    title: 'Nöbetçi Listesi',
    subtitle: 'Günlük, haftalık ve aylık nöbet çizelgesi yönetimi',
    breadcrumbs: [{ label: 'Ana Sayfa', path: '/app/dashboard' }, { label: 'Nöbetçi Listesi' }],
  });

  readonly entries = signal<DutyRosterEntry[]>([]);
  readonly calendarDays = signal<DutyRosterCalendarDay[]>([]);
  readonly loading = signal(false);
  readonly today = signal(this.getToday());
  readonly selectedDate = signal(this.getToday());
  readonly selectedView = signal<'daily' | 'weekly' | 'monthly'>('daily');
  readonly currentMonth = signal(new Date().getMonth() + 1);
  readonly currentYear = signal(new Date().getFullYear());

  readonly totalEntries = computed(() =>
    this.calendarDays().reduce((acc, d) => acc + d.entries.length, 0),
  );
  readonly totalDayShifts = computed(() =>
    this.calendarDays().reduce((acc, d) => acc + d.shiftSummary.day, 0),
  );
  readonly totalEveningShifts = computed(() =>
    this.calendarDays().reduce((acc, d) => acc + d.shiftSummary.evening, 0),
  );
  readonly totalNightShifts = computed(() =>
    this.calendarDays().reduce((acc, d) => acc + d.shiftSummary.night, 0),
  );

  readonly dailyEntries = computed(() =>
    this.entries().filter((e) => e.date === this.selectedDate()),
  );

  ngOnInit() {
    this.loadCalendar();
    this.loadEntries();
  }

  loadCalendar() {
    this.loading.set(true);
    this.dutyRosterService.getCalendar(this.currentMonth(), this.currentYear()).subscribe({
      next: (days) => this.calendarDays.set(days),
      error: () => this.loading.set(false),
      complete: () => this.loading.set(false),
    });
  }

  loadEntries() {
    this.dutyRosterService.findAll({ date: this.selectedDate() }).subscribe({
      next: (entries) => this.entries.set(entries),
      error: () => {},
    });
  }

  prevMonth() {
    if (this.currentMonth() === 1) {
      this.currentMonth.set(12);
      this.currentYear.set(this.currentYear() - 1);
    } else {
      this.currentMonth.set(this.currentMonth() - 1);
    }
    this.loadCalendar();
  }

  nextMonth() {
    if (this.currentMonth() === 12) {
      this.currentMonth.set(1);
      this.currentYear.set(this.currentYear() + 1);
    } else {
      this.currentMonth.set(this.currentMonth() + 1);
    }
    this.loadCalendar();
  }

  onDayClick(date: string) {
    this.selectedDate.set(date);
    this.selectedView.set('daily');
    this.loadEntries();
  }

  private getToday(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  formatMonth(month: number): string {
    return String(month).padStart(2, '0');
  }

  getShiftLabel(type: string): string {
    const map: Record<string, string> = { day: 'Gündüz', evening: 'Akşam', night: 'Gece' };
    return map[type] || type;
  }

  getRoleLabel(role: string): string {
    const map: Record<string, string> = {
      sorumlu_tekniker: 'Sorumlu Tekniker',
      tekniker: 'Tekniker',
      yardimci_tekniker: 'Yardımcı Tekniker',
      supervisor: 'Süpervizör',
      radyolog: 'Radyolog',
    };
    return map[role] || role;
  }

  getShiftBadgeClass(type: string): string {
    const map: Record<string, string> = {
      day: 'badge-day',
      evening: 'badge-evening',
      night: 'badge-night',
    };
    return map[type] || '';
  }

  getRoleBadgeClass(role: string): string {
    const map: Record<string, string> = {
      sorumlu_tekniker: 'badge-primary',
      tekniker: 'badge-info',
      yardimci_tekniker: 'badge-warning',
      supervisor: 'badge-success',
      radyolog: 'badge-danger',
    };
    return map[role] || '';
  }
}
