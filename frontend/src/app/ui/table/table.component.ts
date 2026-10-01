import {
  Component,
  input,
  output,
  computed,
  signal,
  ChangeDetectionStrategy,
  TemplateRef,
  ContentChild,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { EmptyStateComponent } from '../empty-state/empty-state.component';

export interface TableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  hideable?: boolean;
  hidden?: boolean;
  width?: string;
  cellClass?: string;
}

@Component({
  selector: 'app-table',
  standalone: true,
  imports: [CommonModule, ScrollingModule, EmptyStateComponent],
  template: `
    <div class="table-wrapper" [class.table-loading]="loading()">
      @if (loading() && skeleton()) {
        <div class="table-skeleton">
          @for (row of [1, 2, 3, 4, 5]; track row) {
            <div class="table-row-skeleton">
              <div class="skeleton-avatar"></div>
              @for (col of visibleColumns(); track col.key) {
                <div class="skeleton-cell"></div>
              }
            </div>
          }
        </div>
      }
      @if (!loading() || !skeleton()) {
        <div class="table-scroll" [style.max-height]="maxHeight()">
          <table class="table" role="table" aria-label="{{ ariaLabel() }}">
            <thead>
              <tr>
                @if (selectable()) {
                  <th class="table-checkbox">
                    <input
                      type="checkbox"
                      [checked]="allSelected()"
                      (change)="toggleAll()"
                      aria-label="Tümünü seç"
                    />
                  </th>
                }
                <th class="table-row-num">#</th>
                @for (col of visibleColumns(); track col.key) {
                  <th
                    [style.width]="col.width"
                    [class.table-sortable]="col.sortable"
                    (click)="col.sortable && sort(col.key)"
                  >
                    {{ col.header }}
                    @if (col.sortable && sortKey() === col.key) {
                      <span class="sort-indicator">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                    }
                  </th>
                }
              </tr>
            </thead>
            @if (virtualScroll()) {
              <cdk-virtual-scroll-viewport
                [itemSize]="48"
                class="table-virtual-scroll"
                role="presentation"
              >
                <tbody>
                  <tr *cdkVirtualFor="let row of data(); trackBy: trackByFn || trackByIndex">
                    @if (selectable()) {
                      <td class="table-checkbox">
                        <input
                          type="checkbox"
                          [checked]="isSelected(row)"
                          (change)="toggleRow(row)"
                          aria-label="Seç"
                        />
                      </td>
                    }
                    <td class="table-row-num">
                      <span class="row-num">{{ data().indexOf(row) + 1 }}</span>
                    </td>
                    <ng-container *ngFor="let col of visibleColumns(); trackBy: colTrackBy">
                      <td [class]="col.cellClass || ''">
                        @if (cellTemplate && col.key === 'actions') {
                          <ng-container
                            *ngTemplateOutlet="cellTemplate; context: { $implicit: row }"
                          />
                        } @else {
                          {{ row[col.key] }}
                        }
                      </td>
                    </ng-container>
                  </tr>
                </tbody>
              </cdk-virtual-scroll-viewport>
            } @else {
              <tbody>
                @for (row of data(); track resolveTrackBy($index, row)) {
                  <tr [class.table-row-selected]="isSelected(row)">
                    @if (selectable()) {
                      <td class="table-checkbox">
                        <input
                          type="checkbox"
                          [checked]="isSelected(row)"
                          (change)="toggleRow(row)"
                          aria-label="Seç"
                        />
                      </td>
                    }
                    <td class="table-row-num">
                      <span class="row-num">{{ data().indexOf(row) + 1 }}</span>
                    </td>
                    @for (col of visibleColumns(); track col.key) {
                      <td [class]="col.cellClass || ''">
                        @if (cellTemplate && col.key === 'actions') {
                          <ng-container
                            *ngTemplateOutlet="cellTemplate; context: { $implicit: row }"
                          />
                        } @else {
                          {{ row[col.key] }}
                        }
                      </td>
                    }
                  </tr>
                } @empty {
                  <tr>
                    <td [attr.colspan]="visibleColumns().length + 2" class="table-empty">
                      <app-empty-state [title]="emptyTitle()" [description]="emptyDescription()" />
                    </td>
                  </tr>
                }
              </tbody>
            }
          </table>
        </div>
      }
      @if (paginator()) {
        <div class="table-paginator">
          <span class="paginator-info">{{ data().length }} kayıt</span>
          <div class="paginator-controls">
            <button
              (click)="page.set(page() - 1)"
              [disabled]="page() === 0"
              aria-label="Önceki sayfa"
            >
              ‹
            </button>
            <span class="paginator-current">{{ page() + 1 }} / {{ totalPages() }}</span>
            <button
              (click)="page.set(page() + 1)"
              [disabled]="page() >= totalPages() - 1"
              aria-label="Sonraki sayfa"
            >
              ›
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .table-wrapper {
        border: 1px solid var(--border-default);
        border-radius: var(--radius-lg);
        overflow: hidden;
        background: var(--bg-primary);
      }
      .table-scroll {
        overflow-x: auto;
      }
      table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
      }
      th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: var(--bg-surface);
        text-align: left;
        padding: 0.75rem 1rem;
        font-size: 0.75rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--text-muted);
        border-bottom: 1px solid var(--border-subtle);
        white-space: nowrap;
      }
      td {
        padding: 0.625rem 1rem;
        font-size: 0.875rem;
        color: var(--text-primary);
        border-bottom: 1px solid var(--border-subtle);
      }
      tr:last-child td {
        border-bottom: none;
      }
      tr:hover td {
        background: var(--bg-hover);
      }
      .table-sortable {
        cursor: pointer;
        user-select: none;
      }
      .table-sortable:hover {
        color: var(--text-primary);
      }
      .sort-indicator {
        margin-left: 0.25rem;
        font-size: 0.6rem;
      }
      .table-checkbox {
        width: 2rem;
        padding: 0.75rem 0.5rem !important;
      }
      .table-row-num {
        width: 2.5rem;
        padding: 0.75rem 0.5rem !important;
      }
      .row-num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 1.5rem;
        height: 1.5rem;
        font-size: 0.75rem;
        color: var(--text-muted);
        background: var(--bg-secondary);
        border-radius: var(--radius-sm);
      }
      .table-row-selected td {
        background: color-mix(in srgb, var(--primary) 5%, var(--bg-primary));
      }
      .table-empty td {
        padding: 2rem;
      }
      .table-virtual-scroll {
        max-height: 30rem;
      }
      .table-paginator {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.75rem 1rem;
        border-top: 1px solid var(--border-subtle);
      }
      .paginator-info {
        font-size: 0.8rem;
        color: var(--text-muted);
      }
      .paginator-controls {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .paginator-controls button {
        width: 2rem;
        height: 2rem;
        border: 1px solid var(--border-default);
        border-radius: var(--radius-md);
        background: transparent;
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary);
      }
      .paginator-controls button:hover:not(:disabled) {
        background: var(--bg-hover);
      }
      .paginator-controls button:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }
      .paginator-current {
        font-size: 0.8rem;
        color: var(--text-secondary);
        min-width: 4rem;
        text-align: center;
      }
      .table-skeleton {
        padding: 0.5rem;
      }
      .table-row-skeleton {
        display: flex;
        gap: 1rem;
        align-items: center;
        padding: 0.75rem 1rem;
      }
      .skeleton-avatar {
        width: 2rem;
        height: 2rem;
        border-radius: 9999px;
        background: var(--bg-secondary);
        animation: shimmer 1.5s ease-in-out infinite;
      }
      .skeleton-cell {
        flex: 1;
        height: 1rem;
        border-radius: var(--radius-sm);
        background: var(--bg-secondary);
        animation: shimmer 1.5s ease-in-out infinite;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
    `,
  ],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TableComponent<T extends Record<string, unknown>> {
  readonly data = input.required<T[]>();
  readonly columns = input.required<TableColumn<T>[]>();
  readonly loading = input(false);
  readonly skeleton = input(true);
  readonly selectable = input(false);
  readonly virtualScroll = input(false);
  readonly maxHeight = input('none');
  readonly paginator = input(false);
  readonly pageSize = input(20);
  readonly emptyTitle = input('Kayıt bulunamadı');
  readonly emptyDescription = input('');
  readonly ariaLabel = input('Veri tablosu');
  readonly trackByFn = input<((index: number, item: T) => unknown) | undefined>(undefined);
  readonly rowClick = output<T>();
  readonly selectionChange = output<T[]>();

  @ContentChild('cell') cellTemplate?: TemplateRef<{ $implicit: T }>;

  readonly page = signal(0);
  readonly sortKey = signal('');
  readonly sortDir = signal<'asc' | 'desc'>('asc');
  readonly selectedItems = signal<T[]>([]);
  readonly selectedSet = computed(() => new Set(this.selectedItems()));

  readonly visibleColumns = computed(() => this.columns().filter((c) => !c.hidden));
  readonly totalPages = computed(() => Math.ceil(this.data().length / this.pageSize()));
  readonly allSelected = computed(
    () => this.data().length > 0 && this.selectedItems().length === this.data().length,
  );

  resolveTrackBy(index: number, item: T): unknown {
    return this.trackByFn()?.(index, item) ?? index;
  }
  trackByIndex(index: number): number {
    return index;
  }
  colTrackBy(_index: number, col: TableColumn<T>): string {
    return col.key;
  }

  isSelected(row: T): boolean {
    return this.selectedSet().has(row);
  }

  toggleRow(row: T): void {
    this.selectedItems.update((items) => {
      const set = new Set(items);
      if (set.has(row)) {
        set.delete(row);
      } else {
        set.add(row);
      }
      return Array.from(set);
    });
    this.selectionChange.emit(this.selectedItems());
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedItems.set([]);
    } else {
      this.selectedItems.set([...this.data()]);
    }
    this.selectionChange.emit(this.selectedItems());
  }

  sort(key: string): void {
    if (this.sortKey() === key) {
      this.sortDir.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortKey.set(key);
      this.sortDir.set('asc');
    }
  }
}
