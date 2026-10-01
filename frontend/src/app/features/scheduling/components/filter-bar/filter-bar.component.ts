import { Component, inject, signal, output, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ScheduleStore } from '../../store/schedule.store';

export interface ScheduleFilters {
  personnelIds: string[];
  deviceIds: string[];
  shiftTypes: string[];
  status: string | null;
  hasConflict: boolean | null;
  qualification: string | null;
}

@Component({
  selector: 'app-filter-bar',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="filter-bar" role="search" aria-label="Vardiya filtreleri">
      <div class="filter-group">
        <label for="filter-personnel">Personel</label>
        <select
          id="filter-personnel"
          multiple
          [ngModel]="selectedPersonnel()"
          (ngModelChange)="onPersonnelChange($event)"
          class="filter-select"
        >
          @for (p of personnelOptions(); track p.id) {
            <option [value]="p.id">{{ p.name }}</option>
          }
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-device">Cihaz</label>
        <select
          id="filter-device"
          multiple
          [ngModel]="selectedDevices()"
          (ngModelChange)="onDeviceChange($event)"
          class="filter-select"
        >
          @for (d of deviceOptions(); track d.id) {
            <option [value]="d.id">{{ d.code }}</option>
          }
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-shift">Vardiya</label>
        <select
          id="filter-shift"
          multiple
          [ngModel]="selectedShifts()"
          (ngModelChange)="onShiftChange($event)"
          class="filter-select"
        >
          <option value="morning">Sabah</option>
          <option value="day">Gündüz</option>
          <option value="evening">Akşam</option>
          <option value="night">Gece</option>
          <option value="off">İzin</option>
        </select>
      </div>

      <div class="filter-group">
        <label for="filter-conflict">Durum</label>
        <select
          id="filter-conflict"
          [ngModel]="conflictFilter()"
          (ngModelChange)="onConflictChange($event)"
          class="filter-select-single"
        >
          <option value="">Tümü</option>
          <option value="conflict">Sadece Çakışmalı</option>
          <option value="clean">Sadece Temiz</option>
        </select>
      </div>

      @if (hasActiveFilters()) {
        <button class="clear-btn" (click)="clearAll()" aria-label="Tüm filtreleri temizle">
          Temizle
        </button>
      }
    </div>
  `,
  styles: [
    `
      .filter-bar {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        padding: 8px 12px;
        background: var(--surface-card, #fff);
        border-bottom: 1px solid var(--surface-border, #e2e8f0);
        flex-wrap: wrap;
      }
      .filter-group {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .filter-group label {
        font-size: 10px;
        font-weight: 500;
        color: var(--color-text-secondary, #64748b);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .filter-select,
      .filter-select-single {
        padding: 4px 8px;
        border: 1px solid var(--surface-border, #e2e8f0);
        border-radius: 4px;
        font-size: 11px;
        background: white;
        min-width: 120px;
      }
      .filter-select {
        min-height: 60px;
      }
      .filter-select:focus,
      .filter-select-single:focus {
        outline: none;
        border-color: var(--color-primary, #6366f1);
      }
      .clear-btn {
        padding: 4px 10px;
        background: none;
        border: 1px solid var(--surface-border, #e2e8f0);
        border-radius: 4px;
        font-size: 11px;
        color: var(--color-critical, #ef4444);
        cursor: pointer;
        white-space: nowrap;
      }
      .clear-btn:hover {
        background: var(--color-critical-surface, #fef2f2);
      }
    `,
  ],
})
export class FilterBarComponent {
  private readonly store = inject(ScheduleStore);

  readonly filterChange = output<ScheduleFilters>();

  readonly selectedPersonnel = signal<string[]>([]);
  readonly selectedDevices = signal<string[]>([]);
  readonly selectedShifts = signal<string[]>([]);
  readonly conflictFilter = signal<string>('');

  readonly personnelOptions = this.store.uniquePersonnel;
  readonly deviceOptions = this.store.uniqueDevices;

  hasActiveFilters(): boolean {
    return (
      this.selectedPersonnel().length > 0 ||
      this.selectedDevices().length > 0 ||
      this.selectedShifts().length > 0 ||
      this.conflictFilter() !== ''
    );
  }

  onPersonnelChange(ids: string[]): void {
    this.selectedPersonnel.set(ids);
    this.emitFilter();
  }

  onDeviceChange(ids: string[]): void {
    this.selectedDevices.set(ids);
    this.emitFilter();
  }

  onShiftChange(types: string[]): void {
    this.selectedShifts.set(types);
    this.emitFilter();
  }

  onConflictChange(value: string): void {
    this.conflictFilter.set(value);
    this.emitFilter();
  }

  clearAll(): void {
    this.selectedPersonnel.set([]);
    this.selectedDevices.set([]);
    this.selectedShifts.set([]);
    this.conflictFilter.set('');
    this.emitFilter();
  }

  private emitFilter(): void {
    this.filterChange.emit({
      personnelIds: this.selectedPersonnel(),
      deviceIds: this.selectedDevices(),
      shiftTypes: this.selectedShifts(),
      status: null,
      hasConflict:
        this.conflictFilter() === 'conflict'
          ? true
          : this.conflictFilter() === 'clean'
            ? false
            : null,
      qualification: null,
    });
  }
}
