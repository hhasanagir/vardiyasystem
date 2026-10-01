import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  computed,
  inject,
  signal,
  HostListener,
  ElementRef,
} from '@angular/core';
import type { AssignmentDTO } from '../../models';
import { ScheduleStore } from '../../store/schedule.store';
import {
  getDaysInMonth,
  buildGridRows,
  SHIFT_TYPE_LABELS,
  SHIFT_TYPE_COLORS,
  type GridDay,
  type GridRow,
} from '../../utils/grid-utils';

@Component({
  selector: 'app-schedule-grid',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid-container"
      role="grid"
      [attr.aria-label]="
        'Vardiya planı tablosu, ' + gridRows().length + ' personel, ' + days().length + ' gün'
      "
      tabindex="0"
      (keydown)="onKeyDown($event)"
    >
      <table class="schedule-grid" role="grid">
        <thead>
          <tr class="header-row" role="row">
            <th
              class="sticky-col name-col"
              role="columnheader"
              scope="col"
              aria-label="Personel adı"
            >
              Personel
            </th>
            @for (day of days(); track day.date) {
              <th
                class="day-col"
                [class.weekend]="day.isWeekend"
                [class.today]="day.isToday"
                role="columnheader"
                scope="col"
                [attr.aria-label]="day.label + ' ' + day.dayOfMonth"
              >
                <div class="day-number">{{ day.dayOfMonth }}</div>
                <div class="day-label">{{ day.label }}</div>
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of gridRows(); track row.personnelId; let rowIdx = $index) {
            <tr
              class="personnel-row"
              role="row"
              [attr.aria-label]="row.personnelName + ' vardiyası'"
            >
              <td
                class="sticky-col name-cell"
                role="gridcell"
                [attr.aria-label]="row.personnelName"
              >
                <div class="personnel-name">{{ row.personnelName }}</div>
                @if (row.groupName) {
                  <div class="personnel-group">{{ row.groupName }}</div>
                }
              </td>
              @for (day of days(); track day.date; let colIdx = $index) {
                <td
                  class="day-cell"
                  [class.weekend]="day.isWeekend"
                  [class.today]="day.isToday"
                  [class.focused]="focusedRow() === rowIdx && focusedCol() === colIdx"
                  role="gridcell"
                  [attr.aria-label]="getAriaLabel(row, day)"
                  [attr.aria-selected]="getAssignment(row, day.date)?.id === selectedAssignmentId"
                  (click)="onCellClick(day.date)"
                >
                  @if (getAssignment(row, day.date); as assignment) {
                    <div
                      class="assignment-chip"
                      [class.selected]="assignment.id === selectedAssignmentId"
                      [class.conflict]="hasConflict(assignment)"
                      [style.background]="getShiftColor(assignment.shiftType)"
                      [attr.aria-label]="getAssignmentAriaLabel(assignment)"
                      role="button"
                      [attr.tabindex]="focusedRow() === rowIdx && focusedCol() === colIdx ? 0 : -1"
                      (click)="onAssignmentClick($event, assignment.id)"
                    >
                      <div class="chip-shift">{{ getShiftLabel(assignment.shiftType) }}</div>
                      @if (assignment.deviceCode) {
                        <div class="chip-device">{{ assignment.deviceCode }}</div>
                      }
                      @if (assignment.startTime && assignment.endTime) {
                        <div class="chip-time">
                          {{ assignment.startTime }}-{{ assignment.endTime }}
                        </div>
                      }
                    </div>
                  }
                </td>
              }
            </tr>
          }
        </tbody>
      </table>

      @if (gridRows().length === 0) {
        <div class="empty-grid" role="status">
          <span>Bu dönem için personel atanmamış.</span>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .grid-container {
        overflow: auto;
        height: 100%;
        outline: none;
      }
      .grid-container:focus-visible {
        outline: 2px solid var(--color-primary, #6366f1);
        outline-offset: -2px;
      }
      .schedule-grid {
        border-collapse: collapse;
        font-size: 12px;
        table-layout: fixed;
      }
      .header-row {
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .sticky-col {
        position: sticky;
        z-index: 1;
        background: var(--surface-card, #fff);
      }
      .name-col {
        left: 0;
        width: 180px;
        min-width: 180px;
        text-align: left;
        padding: 8px 12px;
        font-weight: 600;
        font-size: 12px;
        color: var(--text-color-secondary, #64748b);
        border-bottom: 2px solid var(--surface-border, #e2e8f0);
        border-right: 1px solid var(--surface-border, #e2e8f0);
      }
      .day-col {
        width: 72px;
        min-width: 72px;
        text-align: center;
        padding: 6px 4px;
        border-bottom: 2px solid var(--surface-border, #e2e8f0);
        border-right: 1px solid var(--surface-border, #f1f5f9);
        background: var(--surface-card, #fff);
      }
      .day-col.weekend {
        background: var(--color-inactive-surface, #f8fafc);
      }
      .day-col.today {
        background: var(--color-info-surface, #eff6ff);
      }
      .day-number {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-color, #1e293b);
      }
      .day-col.weekend .day-number {
        color: var(--color-text-secondary, #64748b);
      }
      .day-col.today .day-number {
        color: var(--color-info, #3b82f6);
      }
      .day-label {
        font-size: 10px;
        color: var(--text-color-secondary, #94a3b8);
        margin-top: 1px;
      }
      .personnel-row {
        height: 52px;
      }
      .name-cell {
        left: 0;
        padding: 6px 12px;
        border-bottom: 1px solid var(--surface-border, #f1f5f9);
        border-right: 1px solid var(--surface-border, #e2e8f0);
      }
      .personnel-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-color, #1e293b);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 160px;
      }
      .personnel-group {
        font-size: 10px;
        color: var(--text-color-secondary, #94a3b8);
      }
      .day-cell {
        padding: 4px 3px;
        border-bottom: 1px solid var(--surface-border, #f1f5f9);
        border-right: 1px solid var(--surface-border, #f8fafc);
        vertical-align: middle;
        text-align: center;
        cursor: pointer;
        transition: background 0.1s;
      }
      .day-cell:hover {
        background: var(--surface-hover, #f1f5f9);
      }
      .day-cell.weekend {
        background: #fafbfc;
      }
      .day-cell.weekend:hover {
        background: #f1f5f9;
      }
      .day-cell.today {
        background: #f0f7ff;
      }
      .day-cell.today:hover {
        background: #e0eeff;
      }
      .day-cell.focused {
        outline: 2px solid var(--color-primary, #6366f1);
        outline-offset: -2px;
      }
      .assignment-chip {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 3px 4px;
        border-radius: 4px;
        color: white;
        font-size: 10px;
        line-height: 1.2;
        cursor: pointer;
        transition:
          transform 0.1s,
          box-shadow 0.1s;
        min-height: 36px;
        justify-content: center;
      }
      .assignment-chip:hover {
        transform: scale(1.05);
        box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
        z-index: 1;
      }
      .assignment-chip:focus-visible {
        outline: 2px solid white;
        outline-offset: 2px;
        transform: scale(1.05);
      }
      .assignment-chip.selected {
        outline: 2px solid var(--primary-color, #6366f1);
        outline-offset: 1px;
      }
      .assignment-chip.conflict {
        box-shadow: inset 0 0 0 2px var(--color-critical, #ef4444);
      }
      .chip-shift {
        font-weight: 600;
      }
      .chip-device {
        opacity: 0.85;
        font-size: 9px;
      }
      .chip-time {
        opacity: 0.75;
        font-size: 8px;
      }
      .empty-grid {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 200px;
        color: var(--text-color-secondary, #94a3b8);
        font-size: 14px;
      }
    `,
  ],
})
export class ScheduleGridComponent {
  private readonly store = inject(ScheduleStore);
  private readonly el = inject(ElementRef);

  @Input() selectedAssignmentId: string | null = null;
  @Input() isEditable = false;

  @Output() assignmentClick = new EventEmitter<string>();
  @Output() cellClick = new EventEmitter<string>();

  readonly focusedRow = signal(-1);
  readonly focusedCol = signal(-1);

  readonly days = computed(() => {
    const s = this.store.schedule();
    if (!s) return [];
    return getDaysInMonth(s.year, s.month);
  });

  readonly gridRows = computed(() => {
    const assignments = this.store.filteredAssignments();
    return buildGridRows(assignments, new Map(), new Map());
  });

  private readonly conflictIds = computed(() => {
    const set = new Set<string>();
    for (const c of this.store.conflicts()) {
      if (c.context.personnelId) set.add(c.context.personnelId);
    }
    return set;
  });

  onKeyDown(event: KeyboardEvent): void {
    const rows = this.gridRows();
    const cols = this.days();
    if (rows.length === 0 || cols.length === 0) return;

    let row = this.focusedRow();
    let col = this.focusedCol();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        row = Math.min(row + 1, rows.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        row = Math.max(row - 1, 0);
        break;
      case 'ArrowRight':
        event.preventDefault();
        col = Math.min(col + 1, cols.length - 1);
        break;
      case 'ArrowLeft':
        event.preventDefault();
        col = Math.max(col - 1, 0);
        break;
      case 'Home':
        event.preventDefault();
        col = 0;
        break;
      case 'End':
        event.preventDefault();
        col = cols.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (row >= 0 && col >= 0) {
          const assignment = this.getAssignment(rows[row], cols[col].date);
          if (assignment) {
            this.assignmentClick.emit(assignment.id);
          } else {
            this.cellClick.emit(cols[col].date);
          }
        }
        return;
      default:
        return;
    }

    if (row < 0) row = 0;
    if (col < 0) col = 0;
    this.focusedRow.set(row);
    this.focusedCol.set(col);
  }

  getAssignment(row: GridRow, date: string): AssignmentDTO | undefined {
    for (const [key, a] of row.assignments) {
      if (key.startsWith(date)) return a;
    }
    return undefined;
  }

  hasConflict(assignment: AssignmentDTO): boolean {
    return this.conflictIds().has(assignment.personnelId);
  }

  getShiftLabel(type: string): string {
    return SHIFT_TYPE_LABELS[type] ?? type;
  }

  getShiftColor(type: string): string {
    return SHIFT_TYPE_COLORS[type] ?? '#94a3b8';
  }

  getAriaLabel(row: GridRow, day: GridDay): string {
    const assignment = this.getAssignment(row, day.date);
    if (assignment) {
      return `${row.personnelName}, ${day.label} ${day.dayOfMonth}: ${this.getShiftLabel(assignment.shiftType)}${assignment.deviceCode ? ' - ' + assignment.deviceCode : ''}`;
    }
    return `${row.personnelName}, ${day.label} ${day.dayOfMonth}: Atanmamış`;
  }

  getAssignmentAriaLabel(assignment: AssignmentDTO): string {
    const parts = [this.getShiftLabel(assignment.shiftType)];
    if (assignment.deviceCode) parts.push(assignment.deviceCode);
    if (assignment.startTime && assignment.endTime)
      parts.push(`${assignment.startTime}-${assignment.endTime}`);
    return parts.join(', ');
  }

  onAssignmentClick(event: Event, assignmentId: string): void {
    event.stopPropagation();
    this.assignmentClick.emit(assignmentId);
  }

  onCellClick(date: string): void {
    this.cellClick.emit(date);
  }
}
