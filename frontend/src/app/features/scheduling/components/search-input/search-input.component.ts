import {
  Component,
  output,
  signal,
  ChangeDetectionStrategy,
  inject,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, takeUntil } from 'rxjs';
import { ScheduleStore } from '../../store/schedule.store';

@Component({
  selector: 'app-search-input',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="search-wrapper" role="search" aria-label="Personel veya cihaz ara">
      <span class="search-icon" aria-hidden="true">&#128269;</span>
      <input
        type="search"
        class="search-input"
        placeholder="Personel veya cihaz ara..."
        [ngModel]="searchTerm()"
        (ngModelChange)="onInput($event)"
        aria-label="Personel veya cihaz adi ile ara"
        autocomplete="off"
      />
      @if (searchTerm()) {
        <button class="clear-btn" (click)="clear()" aria-label="Aramayi temizle">&times;</button>
      }
    </div>
  `,
  styles: [
    `
      .search-wrapper {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: var(--surface-card, #fff);
        border: 1px solid var(--surface-border, #e2e8f0);
        border-radius: 6px;
        transition: border-color 0.15s;
      }
      .search-wrapper:focus-within {
        border-color: var(--color-primary, #6366f1);
      }
      .search-icon {
        font-size: 12px;
        color: var(--color-text-muted, #94a3b8);
      }
      .search-input {
        border: none;
        outline: none;
        font-size: 12px;
        flex: 1;
        background: transparent;
        color: var(--color-text, #1e293b);
      }
      .search-input::placeholder {
        color: var(--color-text-muted, #94a3b8);
      }
      .clear-btn {
        background: none;
        border: none;
        font-size: 14px;
        cursor: pointer;
        color: var(--color-text-muted, #94a3b8);
        padding: 0 2px;
        line-height: 1;
      }
      .clear-btn:hover {
        color: var(--color-text, #1e293b);
      }
    `,
  ],
})
export class SearchInputComponent implements OnDestroy {
  private readonly store = inject(ScheduleStore);
  private readonly search$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  readonly searchTerm = signal('');
  readonly searchChange = output<string>();

  constructor() {
    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe((term) => {
        this.store.setSearchTerm(term);
        this.searchChange.emit(term);
      });
  }

  onInput(value: string): void {
    this.searchTerm.set(value);
    this.search$.next(value);
  }

  clear(): void {
    this.searchTerm.set('');
    this.store.setSearchTerm('');
    this.searchChange.emit('');
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
