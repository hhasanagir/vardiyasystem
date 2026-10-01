import { Component, inject, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScheduleService } from '../../services/schedule.service';

@Component({
  selector: 'app-auto-generate-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-overlay" (click)="close()">
      <div class="modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Otomatik Vardiya Oluştur</h3>
          <button class="modal-close" (click)="close()">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
          @if (state() === 'form') {
            <div class="form-section">
              <div class="form-group">
                <label>Dönem</label>
                <div class="period-display">{{ monthLabel() }} {{ year() }}</div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Adalet Modu</label>
                  <select class="form-select" [(ngModel)]="fairnessMode">
                    <option value="balanced">Dengeli</option>
                    <option value="seniority">Kıdem Öncelikli</option>
                    <option value="skill">Yetenek Öncelikli</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Maks. Fazla Mesai (saat/ay)</label>
                  <input
                    type="number"
                    class="form-input"
                    [(ngModel)]="maxOvertime"
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div class="form-row">
                <div class="form-group">
                  <label>Min. Dinlenme (saat)</label>
                  <input
                    type="number"
                    class="form-input"
                    [(ngModel)]="minRestHours"
                    min="8"
                    max="24"
                  />
                </div>
                <div class="form-group">
                  <label>Maks. Ardışık Gün</label>
                  <input
                    type="number"
                    class="form-input"
                    [(ngModel)]="maxConsecutiveDays"
                    min="1"
                    max="14"
                  />
                </div>
                <div class="form-group">
                  <label>Maks. Ardışık Gece</label>
                  <input
                    type="number"
                    class="form-input"
                    [(ngModel)]="maxConsecutiveNights"
                    min="1"
                    max="7"
                  />
                </div>
              </div>

              <div class="form-row">
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="includeWeekends" />
                  <span>Hafta Sonlarını Dahil Et</span>
                </label>
                <label class="checkbox-label">
                  <input type="checkbox" [(ngModel)]="includeNightShifts" />
                  <span>Gece Vardiyalarını Dahil Et</span>
                </label>
              </div>
            </div>
          }

          @if (state() === 'generating') {
            <div class="generating-state">
              <div class="spinner"></div>
              <span>Vardiyalar oluşturuluyor...</span>
            </div>
          }

          @if (state() === 'preview') {
            <div class="preview-section">
              <div class="summary-bar">
                <div class="summary-item">
                  <strong>{{ previewData()?.summary?.total || 0 }}</strong> vardiya
                </div>
                <div class="summary-item">
                  <strong>{{ previewData()?.summary?.personnelCount || 0 }}</strong> personel
                </div>
                <div class="summary-item">
                  <strong>{{ previewData()?.summary?.deviceCount || 0 }}</strong> cihaz
                </div>
                <div class="summary-item">
                  <strong>{{ previewData()?.summary?.avgPerPerson || '0' }}</strong> ort./kişi
                </div>
              </div>

              @if ((previewData()?.warnings?.length || 0) > 0) {
                <div class="warnings-box">
                  <strong>{{ previewData()?.warnings?.length || 0 }} uyarı:</strong>
                  @for (w of previewData()?.warnings?.slice(0, 5); track w) {
                    <div class="warning-item">{{ w }}</div>
                  }
                </div>
              }

              <div class="preview-table-wrapper scroll-container scroll-sticky-head">
                <table class="preview-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Cihaz</th>
                      <th>Vardiya</th>
                      <th>Personel Tipi</th>
                      <th>Personel</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (a of previewAssignments(); track trackId($index, a)) {
                      <tr>
                        <td>{{ formatDate(a.date) }}</td>
                        <td>
                          <span class="device-code">{{ a.deviceCode || a.deviceId }}</span>
                          {{ a.deviceName }}
                        </td>
                        <td>
                          <span class="shift-tag" [class]="'shift-' + a.shiftType">{{
                            getShiftLabel(a.shiftType)
                          }}</span>
                        </td>
                        <td>{{ getPersonnelTypeLabel(a.personnelType) }}</td>
                        <td>{{ a.personnelName || a.personnelId }}</td>
                      </tr>
                    } @empty {
                      <tr>
                        <td colspan="5" class="empty-cell">Atama bulunamadı</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </div>
          }

          @if (error()) {
            <div class="error-banner">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" /></svg
              ><span>{{ error() }}</span>
            </div>
          }

          @if (state() === 'applied') {
            <div class="success-banner">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>{{ applyResult()?.message || 'Vardiyalar başarıyla uygulandı' }}</span>
            </div>
          }
        </div>

        <div class="modal-footer">
          <button class="btn btn-ghost" (click)="close()">
            @if (state() === 'preview' || state() === 'applied') {
              Kapat
            } @else {
              İptal
            }
          </button>

          @if (state() === 'form') {
            <button class="btn btn-primary" (click)="generate()" [disabled]="generating()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></svg
              >Önizle
            </button>
          }

          @if (state() === 'preview') {
            <button class="btn btn-primary" (click)="apply()" [disabled]="applying()">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {{ applying() ? 'Uygulanıyor...' : 'Vardiyaları Uygula' }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 20px;
      }
      .modal {
        background: var(--bg-primary);
        border: 1px solid var(--border-default);
        border-radius: var(--radius-xl);
        width: 100%;
        max-width: 680px;
        max-height: 90vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
      }
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 18px 24px;
        border-bottom: 1px solid var(--border-subtle);
        flex-shrink: 0;
      }
      .modal-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .modal-close {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 4px;
        border-radius: var(--radius-sm);
        display: flex;
      }
      .modal-close:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .modal-body {
        padding: 20px 24px;
        overflow-y: auto;
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 16px 24px;
        border-top: 1px solid var(--border-subtle);
        flex-shrink: 0;
      }

      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn-ghost:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
        border-color: var(--border-default);
      }
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border: none;
        border-radius: var(--radius-md);
        background: var(--accent-gradient);
        color: white;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: all var(--transition-fast);
      }
      .btn-primary:hover {
        opacity: 0.9;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .form-section {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1;
      }
      .form-group label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.3px;
      }
      .form-input,
      .form-select {
        padding: 9px 12px;
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        color: var(--text-primary);
        font-size: 13px;
        transition: border-color var(--transition-fast);
      }
      .form-input:focus,
      .form-select:focus {
        outline: none;
        border-color: var(--accent-mr);
      }
      .form-row {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
        align-items: flex-end;
      }
      .period-display {
        font-size: 18px;
        font-weight: 700;
        color: var(--text-primary);
        padding: 8px 0;
      }
      .checkbox-label {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 6px 0;
      }
      .checkbox-label input[type='checkbox'] {
        width: 16px;
        height: 16px;
        accent-color: var(--accent-mr);
      }

      .generating-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;
        padding: 40px;
        color: var(--text-muted);
        font-size: 14px;
      }
      .spinner {
        width: 32px;
        height: 32px;
        border: 3px solid var(--border-subtle);
        border-top-color: var(--accent-mr);
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .preview-section {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .summary-bar {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        padding: 12px 16px;
        background: var(--bg-glass);
        border-radius: var(--radius-md);
        border: 1px solid var(--border-subtle);
      }
      .summary-item {
        font-size: 12px;
        color: var(--text-muted);
      }
      .summary-item strong {
        font-size: 18px;
        color: var(--accent-mr);
        display: block;
      }

      .warnings-box {
        padding: 10px 14px;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: var(--radius-md);
        font-size: 11px;
        color: #f59e0b;
      }
      .warning-item {
        padding: 2px 0;
      }

      .preview-table-wrapper {
        max-height: 300px;
        overflow-y: auto;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
      }
      .preview-table {
        width: 100%;
        min-width: max-content;
        border-collapse: collapse;
        font-size: 12px;
      }
      .preview-table th {
        position: sticky;
        top: 0;
        background: var(--bg-surface);
        padding: 8px 12px;
        text-align: left;
        font-weight: 600;
        color: var(--text-muted);
        text-transform: uppercase;
        font-size: 10px;
        letter-spacing: 0.3px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .preview-table td {
        padding: 6px 12px;
        border-bottom: 1px solid var(--border-subtle);
        color: var(--text-secondary);
      }
      .device-code {
        font-weight: 600;
        color: var(--text-primary);
        margin-right: 4px;
      }
      .preview-table tr:last-child td {
        border-bottom: none;
      }
      .empty-cell {
        text-align: center;
        padding: 24px;
        color: var(--text-muted);
      }

      .shift-tag {
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
      }
      .shift-tag.shift-day {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .shift-tag.shift-evening {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .shift-tag.shift-night {
        background: rgba(139, 92, 246, 0.12);
        color: #a78bfa;
      }
      .shift-tag.shift-morning {
        background: rgba(34, 197, 94, 0.12);
        color: #4ade80;
      }

      .error-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }
      .success-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 14px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: var(--radius-md);
        font-size: 13px;
        color: #4ade80;
      }

      @media (max-width: 768px) {
        .modal {
          max-width: 100%;
          margin: 10px;
        }
        .form-row {
          flex-direction: column;
        }
      }
    `,
  ],
})
export class AutoGenerateDialogComponent {
  private scheduleService = inject(ScheduleService);

  readonly unitType = input.required<string>();
  readonly month = input.required<number>();
  readonly year = input.required<number>();
  readonly scheduleId = input.required<string>();
  readonly closeDialog = output<void>();
  readonly applied = output<void>();

  protected state = signal<'form' | 'generating' | 'preview' | 'applied'>('form');
  protected error = signal<string | null>(null);
  protected generating = signal(false);
  protected applying = signal(false);
  protected previewData = signal<any>(null);
  protected previewAssignments = signal<any[]>([]);
  protected applyResult = signal<any>(null);

  protected fairnessMode = 'balanced';
  protected maxOvertime = 20;
  protected minRestHours = 11;
  protected maxConsecutiveDays = 6;
  protected maxConsecutiveNights = 3;
  protected includeWeekends = true;
  protected includeNightShifts = true;

  protected monthLabel(): string {
    const names = [
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
    return names[this.month() - 1] || '';
  }

  protected close() {
    this.closeDialog.emit();
  }

  protected generate() {
    this.error.set(null);
    this.generating.set(true);
    this.state.set('generating');

    this.scheduleService
      .generateSchedule({
        unitType: this.unitType(),
        month: this.month(),
        year: this.year(),
        fairnessMode: this.fairnessMode,
        maxOvertime: this.maxOvertime,
        minRestHours: this.minRestHours,
        maxConsecutiveDays: this.maxConsecutiveDays,
        maxConsecutiveNights: this.maxConsecutiveNights,
        includeWeekends: this.includeWeekends,
        includeNightShifts: this.includeNightShifts,
      })
      .subscribe({
        next: (res) => {
          this.generating.set(false);
          this.previewData.set(res);
          this.previewAssignments.set(res.assignments || []);
          this.state.set('preview');
        },
        error: (err) => {
          this.generating.set(false);
          this.state.set('form');
          this.error.set(err.message || 'Vardiya oluşturulamadı');
        },
      });
  }

  protected apply() {
    const assignments = this.previewAssignments();
    if (!assignments.length) return;

    this.applying.set(true);
    this.error.set(null);

    this.scheduleService.applyGeneratedSchedule(this.scheduleId(), assignments).subscribe({
      next: (res) => {
        this.applying.set(false);
        this.applyResult.set(res);
        this.state.set('applied');
        this.applied.emit();
      },
      error: (err) => {
        this.applying.set(false);
        this.error.set(err.message || 'Vardiyalar uygulanamadı');
      },
    });
  }

  protected formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
  }

  protected getShiftLabel(type: string): string {
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
    };
    return map[type] || type;
  }

  protected getPersonnelTypeLabel(personnelType?: string | null): string {
    if (!personnelType) return '';
    const map: Record<string, string> = {
      technician: 'Tekniker',
      assistant_technician: 'Yard. Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Müh.',
    };
    return map[personnelType] || personnelType;
  }

  protected trackId(index: number, item: any): string {
    return item.date + item.personnelId + item.shiftType + index;
  }
}
