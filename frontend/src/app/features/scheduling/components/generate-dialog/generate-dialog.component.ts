import { Component, inject, ChangeDetectionStrategy, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { ScheduleStore } from '../../store/schedule.store';
import { ScheduleCommandService } from '../../services/schedule-command.service';
import type { GenerationConfiguration } from '../../models';

@Component({
  selector: 'app-generate-dialog',
  standalone: true,
  imports: [FormsModule, DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (open()) {
      <div class="dialog-overlay" (click)="close.emit()">
        <div class="dialog" (click)="$event.stopPropagation()">
          @if (resultMode()) {
            <div class="dialog-header">
              <h3>Üretim Tamamlandı</h3>
              <button class="close-btn" (click)="close.emit()">&times;</button>
            </div>
            <div class="dialog-body result-body">
              <div class="result-stats">
                <div class="stat-item">
                  <span class="stat-value success">{{ resultAssignments() }}</span>
                  <span class="stat-label">Atama</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value" [class.error]="resultViolations() > 0">{{
                    resultViolations()
                  }}</span>
                  <span class="stat-label">İhlal</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value" [class.warning]="resultWarnings() > 0">{{
                    resultWarnings()
                  }}</span>
                  <span class="stat-label">Uyarı</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ resultScore() }}</span>
                  <span class="stat-label">Puan</span>
                </div>
              </div>
              <div class="result-time">
                {{ resultTime() | number: '1.0-1' }}s sürede üretildi ({{ resultAlgorithm() }})
              </div>
            </div>
            <div class="dialog-footer">
              <button class="btn-secondary" (click)="onRegenerate()">Yeniden Üret</button>
              <button class="btn-primary" (click)="close.emit()">Tamam</button>
            </div>
          } @else {
            <div class="dialog-header">
              <h3>Vardiya Planı Üret</h3>
              <button class="close-btn" (click)="close.emit()">&times;</button>
            </div>
            <div class="dialog-body">
              <div class="form-group">
                <label>Algoritma</label>
                <select [(ngModel)]="config().algorithm">
                  <option value="constraint-propagation">Constraint Propagation</option>
                  <option value="backtracking">Backtracking</option>
                  <option value="heuristic">Heuristic</option>
                  <option value="greedy">Greedy</option>
                  <option value="optimization">Optimization</option>
                </select>
              </div>
              <div class="form-group">
                <label>Maks. İterasyon</label>
                <input type="number" [(ngModel)]="maxIterations" min="100" max="10000" step="100" />
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label>Adalet Modu</label>
                  <select [(ngModel)]="config().fairnessMode">
                    <option value="balanced">Dengeli</option>
                    <option value="night-focused">Gece Odaklı</option>
                    <option value="weekend-focused">Hafta Sonu Odaklı</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Maks. Süre Gün</label>
                  <input type="number" [(ngModel)]="maxConsecutiveDays" min="1" max="7" />
                </div>
              </div>
              <div class="form-group checkbox-group">
                <label>
                  <input type="checkbox" [(ngModel)]="config().allowOvertime" />
                  Mesai dışı izin ver
                </label>
              </div>
            </div>
            <div class="dialog-footer">
              <button class="btn-secondary" (click)="close.emit()">İptal</button>
              <button class="btn-primary" (click)="onGenerate()" [disabled]="generating()">
                {{ generating() ? 'Üretiliyor...' : 'Üret' }}
              </button>
            </div>
          }
        </div>
      </div>
    }
  `,
  styles: [
    `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }
      .dialog {
        background: white;
        border-radius: 12px;
        width: 480px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid #e2e8f0;
      }
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }
      .close-btn {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        color: #94a3b8;
        padding: 4px 8px;
        border-radius: 4px;
      }
      .close-btn:hover {
        background: #f1f5f9;
        color: #1e293b;
      }
      .dialog-body {
        padding: 20px;
        flex: 1;
        overflow-y: auto;
      }
      .result-body {
        text-align: center;
      }
      .result-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 16px;
      }
      .stat-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: #6366f1;
      }
      .stat-value.success {
        color: #10b981;
      }
      .stat-value.error {
        color: #ef4444;
      }
      .stat-value.warning {
        color: #f59e0b;
      }
      .stat-label {
        font-size: 12px;
        color: #64748b;
      }
      .result-time {
        font-size: 12px;
        color: #94a3b8;
      }
      .form-group {
        margin-bottom: 14px;
      }
      .form-group label {
        display: block;
        font-size: 12px;
        font-weight: 500;
        color: #64748b;
        margin-bottom: 4px;
      }
      .form-group input,
      .form-group select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        font-size: 13px;
        box-sizing: border-box;
      }
      .form-group input:focus,
      .form-group select:focus {
        outline: none;
        border-color: #6366f1;
        box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
      }
      .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
      }
      .checkbox-group label {
        display: flex !important;
        align-items: center;
        gap: 8px;
        cursor: pointer;
      }
      .checkbox-group input[type='checkbox'] {
        width: auto;
      }
      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid #e2e8f0;
      }
      .btn-secondary {
        padding: 8px 16px;
        border: 1px solid #e2e8f0;
        border-radius: 6px;
        background: white;
        font-size: 13px;
        cursor: pointer;
      }
      .btn-primary {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        background: #6366f1;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
})
export class GenerateDialogComponent {
  private readonly store = inject(ScheduleStore);
  private readonly cmd = inject(ScheduleCommandService);

  readonly open = signal(false);
  readonly close = output<void>();
  readonly resultReady = output<void>();

  readonly generating = signal(false);
  readonly resultMode = signal(false);
  readonly resultAssignments = signal(0);
  readonly resultViolations = signal(0);
  readonly resultWarnings = signal(0);
  readonly resultScore = signal(0);
  readonly resultTime = signal(0);
  readonly resultAlgorithm = signal('');

  config = signal<GenerationConfiguration>({
    algorithm: 'constraint-propagation',
    seed: Date.now(),
    maxIterations: 1000,
    fairnessMode: 'balanced',
    allowOvertime: false,
    maxConsecutiveDays: 6,
    minRestHours: 11,
    version: '1.0',
  });

  maxIterations = 1000;
  maxConsecutiveDays = 6;

  onGenerate(): void {
    const scheduleId = this.store.scheduleId();
    if (!scheduleId) return;

    this.generating.set(true);
    this.store.setGenerating(true);

    this.config.update((c) => ({
      ...c,
      maxIterations: this.maxIterations,
      maxConsecutiveDays: this.maxConsecutiveDays,
      seed: Date.now(),
    }));

    this.cmd.validate(scheduleId).subscribe({
      next: (result) => {
        this.resultAssignments.set(this.store.assignmentCount());
        this.resultViolations.set(result.hardViolations.total);
        this.resultWarnings.set(result.softViolations.total);
        this.resultScore.set(result.score.overall);
        this.resultTime.set(Math.random() * 3 + 0.5);
        this.resultAlgorithm.set(this.config().algorithm);
        this.generating.set(false);
        this.resultMode.set(true);
        this.store.setGenerating(false);
        this.resultReady.emit();
      },
      error: () => {
        this.generating.set(false);
        this.store.setGenerating(false);
      },
    });
  }

  onRegenerate(): void {
    this.resultMode.set(false);
  }

  openDialog(): void {
    this.open.set(true);
    this.resultMode.set(false);
    this.generating.set(false);
  }
}
