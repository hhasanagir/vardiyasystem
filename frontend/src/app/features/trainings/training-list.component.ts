import {
  Component,
  inject,
  OnInit,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { environment } from '../../environments';
import {
  TrainingService,
  Training,
  PersonnelTrainingItem,
  TrainingRiskSummary,
} from '../../services/training.service';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-training-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <div style="display:flex; gap:8px; margin-bottom:16px;">
        <button class="btn btn-ghost btn-sm" (click)="showAddTraining = true">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" /></svg
          >Eğitim Ekle
        </button>
        <div class="export-group">
          <button class="btn btn-ghost btn-sm" (click)="exportExcel()">Excel</button>
          <button class="btn btn-ghost btn-sm" (click)="exportPdf()">PDF</button>
        </div>
      </div>

      <!-- Risk Summary -->
      @if (riskSummary(); as risk) {
        <div class="risk-bar">
          <div class="risk-stat">
            <span class="risk-value">{{ risk.total }}</span>
            <span class="risk-label">Toplam</span>
          </div>
          <div class="risk-stat">
            <span class="risk-value" style="color:#22c55e">{{ risk.valid }}</span>
            <span class="risk-label">Geçerli</span>
          </div>
          <div class="risk-stat">
            <span class="risk-value" style="color:#f59e0b">{{ risk.expiring30 }}</span>
            <span class="risk-label">30 gün</span>
          </div>
          <div class="risk-stat">
            <span class="risk-value" style="color:#f59e0b">{{ risk.expiring90 }}</span>
            <span class="risk-label">90 gün</span>
          </div>
          <div class="risk-stat">
            <span class="risk-value" style="color:#ef4444">{{ risk.expired }}</span>
            <span class="risk-label">Süresi Doldu</span>
          </div>
          <div class="risk-stat">
            <span
              class="risk-value"
              [style.color]="
                risk.riskScore > 50 ? '#ef4444' : risk.riskScore > 25 ? '#f59e0b' : '#22c55e'
              "
              >{{ risk.riskScore }}%</span
            >
            <span class="risk-label">Risk Skoru</span>
          </div>
        </div>
      }

      <!-- Status Filter -->
      <div class="filter-row">
        <select [(ngModel)]="statusFilter" (change)="onSearch()" class="filter-select">
          <option value="">Tümü</option>
          <option value="valid">Geçerli</option>
          <option value="expiring">Sona Eriyor</option>
          <option value="expired">Süresi Doldu</option>
        </select>
        <input
          type="text"
          [(ngModel)]="searchTerm"
          (input)="onSearch()"
          placeholder="Eğitim adı ara..."
          class="filter-input"
        />
        <button class="btn btn-ghost btn-sm" (click)="onSearch()">Yenile</button>
      </div>

      <!-- Training Cards -->
      @if (loading()) {
        <div class="loading"><div class="spinner"></div></div>
      } @else {
        <div class="training-grid">
          @for (training of filteredTrainings(); track training.id) {
            <div class="training-card animate-in">
              <div class="training-header">
                <div class="training-info">
                  <h3 class="training-name">{{ training.name }}</h3>
                  @if (training.provider) {
                    <span class="training-provider">{{ training.provider }}</span>
                  }
                </div>
                <span class="badge badge-neutral"
                  >{{ training._count?.personnelTrainings || 0 }} kişi</span
                >
              </div>

              @if (training.personnelTrainings.length > 0) {
                <div class="assignment-list">
                  @for (
                    pt of training.personnelTrainings.slice(
                      0,
                      showAll().has(training.id) ? undefined : 3
                    );
                    track pt.id
                  ) {
                    <div class="assignment-row">
                      <div class="assignee-info">
                        <span class="assignee-name">{{ pt.personnel.name }}</span>
                        <span class="assignee-role">{{ pt.personnel.role }}</span>
                        @if (pt.issueDate) {
                          <span class="assignee-date">{{ formatDate(pt.issueDate) }}</span>
                        }
                      </div>
                      <div class="assignee-right">
                        @if (pt.expiryDate) {
                          <span
                            class="assignee-expiry"
                            [class.expired]="pt.status === 'expired'"
                            [class.expiring]="pt.status === 'expiring'"
                          >
                            {{ getDaysLeft(pt.expiryDate) }}
                          </span>
                        }
                        <span
                          class="badge"
                          [class.badge-success]="pt.status === 'valid'"
                          [class.badge-warning]="pt.status === 'expiring'"
                          [class.badge-error]="pt.status === 'expired'"
                        >
                          {{ getStatusLabel(pt.status) }}
                        </span>
                        <button class="btn-icon" (click)="editAssignment(pt)">&#9998;</button>
                        <button class="btn-icon btn-icon-danger" (click)="removeAssignment(pt)">
                          &times;
                        </button>
                      </div>
                    </div>
                  }
                  @if (training.personnelTrainings.length > 3 && !showAll().has(training.id)) {
                    <button class="show-more" (click)="toggleShowAll(training.id)">
                      +{{ training.personnelTrainings.length - 3 }} daha
                    </button>
                  }
                </div>
              } @else {
                <div class="no-assignments">Atanmış personel yok</div>
              }

              <div class="training-actions">
                <button class="btn btn-primary btn-xs" (click)="openAssign(training)">
                  Personel Ata
                </button>
                <button class="btn btn-ghost btn-xs" (click)="editTraining(training)">
                  Düzenle
                </button>
                <button
                  class="btn btn-ghost btn-xs btn-danger-text"
                  (click)="deleteTraining(training)"
                >
                  Sil
                </button>
              </div>
            </div>
          }
        </div>

        @if (filteredTrainings().length === 0) {
          <div class="empty-state">Henüz eğitim tanımlanmamış</div>
        }
      }
    </div>

    <!-- Add/Edit Training Modal -->
    @if (showAddTraining || editingTraining()) {
      <div class="dialog-overlay" (click)="closeTrainingDialog()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <h3>{{ editingTraining() ? 'Eğitim Düzenle' : 'Yeni Eğitim' }}</h3>
            <button class="dialog-close" (click)="closeTrainingDialog()">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label>Eğitim Adı</label>
              <input
                type="text"
                [(ngModel)]="editTrainingName"
                class="form-input"
                placeholder="Örn: MR Güvenlik Eğitimi"
              />
            </div>
            <div class="form-group">
              <label>Sağlayıcı</label>
              <input
                type="text"
                [(ngModel)]="editTrainingProvider"
                class="form-input"
                placeholder="Örn: Sağlık Bakanlığı"
              />
            </div>
            <div class="form-group">
              <label>Kategori</label>
              <select [(ngModel)]="editTrainingCategory" class="form-select">
                <option value="safety">Güvenlik</option>
                <option value="technical">Teknik</option>
                <option value="quality">Kalite</option>
                <option value="compliance">Uyumluluk</option>
                <option value="management">Yönetim</option>
                <option value="general">Genel</option>
              </select>
            </div>
            <div class="form-group">
              <label>Açıklama</label>
              <textarea
                [(ngModel)]="editTrainingDescription"
                class="form-input"
                rows="2"
              ></textarea>
            </div>
            @if (trainingSaveError()) {
              <div class="form-error">{{ trainingSaveError() }}</div>
            }
          </div>
          <div class="dialog-footer">
            <button class="btn btn-ghost btn-sm" (click)="closeTrainingDialog()">İptal</button>
            <button class="btn btn-primary btn-sm" (click)="saveTraining()">
              {{ editingTraining() ? 'Güncelle' : 'Oluştur' }}
            </button>
          </div>
        </div>
      </div>
    }

    <!-- Assign Training Modal -->
    @if (assigningTraining()) {
      <div class="dialog-overlay" (click)="closeAssign()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <h3>Personel Ata: {{ assigningTraining()?.name }}</h3>
            <button class="dialog-close" (click)="closeAssign()">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="form-group">
              <label>Personel ID</label>
              <input
                type="text"
                [(ngModel)]="assignPersonnelId"
                class="form-input"
                placeholder="Personel ID girin..."
              />
            </div>
            <div class="form-group">
              <label>Düzenleme Tarihi</label>
              <input type="date" [(ngModel)]="assignIssueDate" class="form-input" />
            </div>
            <div class="form-group">
              <label>Sona Erme Tarihi</label>
              <input type="date" [(ngModel)]="assignExpiryDate" class="form-input" />
            </div>
            <div class="form-group">
              <label>Sertifika URL</label>
              <input
                type="text"
                [(ngModel)]="assignDocumentUrl"
                class="form-input"
                placeholder="PDF linki..."
              />
            </div>
            @if (assignSaveError()) {
              <div class="form-error">{{ assignSaveError() }}</div>
            }
          </div>
          <div class="dialog-footer">
            <button class="btn btn-ghost btn-sm" (click)="closeAssign()">İptal</button>
            <button class="btn btn-primary btn-sm" (click)="saveAssignment()">Ata</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .page {
        padding: 12px 16px;
        max-width: 1200px;
        margin: 0 auto;
      }
      .export-group {
        display: flex;
        gap: 4px;
      }
      .btn-ghost {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: transparent;
        color: var(--text-secondary);
        font-size: 11px;
        cursor: pointer;
      }
      .btn-ghost:hover {
        background: var(--bg-hover);
        color: var(--text-primary);
      }
      .btn-primary {
        background: #3b82f6;
        color: #fff;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .btn-primary:hover {
        background: #2563eb;
      }
      .btn-sm {
        padding: 6px 12px;
        font-size: 11px;
      }
      .btn-xs {
        padding: 4px 8px;
        font-size: 10px;
      }

      .risk-bar {
        display: flex;
        gap: 8px;
        padding: 12px;
        margin-bottom: 12px;
        background: var(--bg-glass);
        border-radius: var(--radius-lg);
        overflow-x: auto;
      }
      .risk-stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 60px;
        padding: 0 8px;
        border-right: 1px solid var(--border-subtle);
      }
      .risk-stat:last-child {
        border-right: none;
      }
      .risk-value {
        font-size: 22px;
        font-weight: 700;
        line-height: 1;
      }
      .risk-label {
        font-size: 9px;
        color: var(--text-muted);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-top: 2px;
      }

      .filter-row {
        display: flex;
        gap: 8px;
        margin-bottom: 12px;
      }
      .filter-select,
      .filter-input {
        padding: 6px 10px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: rgba(15, 23, 42, 0.5);
        color: var(--text-primary);
        font-size: 12px;
      }
      .filter-select {
        min-width: 120px;
      }
      .filter-input {
        flex: 1;
        max-width: 300px;
      }
      .filter-select:focus,
      .filter-input:focus {
        outline: none;
        border-color: #3b82f6;
      }

      .loading {
        display: flex;
        justify-content: center;
        padding: 48px;
      }
      .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--border-subtle);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      .training-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: 12px;
      }
      .training-card {
        background: var(--bg-glass);
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-lg);
        overflow: hidden;
        transition: border-color var(--transition-fast);
      }
      .training-card:hover {
        border-color: var(--border-default);
      }
      .training-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        padding: 12px 14px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .training-name {
        font-size: 14px;
        font-weight: 600;
        color: var(--text-primary);
        margin: 0;
      }
      .training-provider {
        font-size: 11px;
        color: var(--text-muted);
        display: block;
        margin-top: 1px;
      }
      .badge-neutral {
        background: rgba(100, 116, 139, 0.2);
      }
      .badge-success {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .badge-warning {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .badge-error {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .assignment-list {
        padding: 6px 14px;
      }
      .assignment-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--border-subtle);
        gap: 8px;
      }
      .assignment-row:last-child {
        border-bottom: none;
      }
      .assignee-info {
        display: flex;
        flex-direction: column;
      }
      .assignee-name {
        font-size: 12px;
        font-weight: 500;
        color: var(--text-primary);
      }
      .assignee-role {
        font-size: 10px;
        color: var(--text-muted);
      }
      .assignee-date {
        font-size: 9px;
        color: var(--text-muted);
      }
      .assignee-right {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .assignee-expiry {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 6px;
        border-radius: var(--radius-sm);
        background: rgba(34, 197, 94, 0.1);
        color: #22c55e;
      }
      .assignee-expiry.expired {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }
      .assignee-expiry.expiring {
        background: rgba(245, 158, 11, 0.1);
        color: #f59e0b;
      }
      .btn-icon {
        background: none;
        border: none;
        color: var(--text-muted);
        cursor: pointer;
        padding: 4px;
        font-size: 14px;
      }
      .btn-icon:hover {
        color: var(--text-primary);
      }
      .btn-icon-danger:hover {
        color: #ef4444;
      }
      .show-more {
        background: none;
        border: none;
        color: #3b82f6;
        font-size: 11px;
        cursor: pointer;
        padding: 4px 0;
      }
      .no-assignments {
        padding: 12px 14px;
        font-size: 12px;
        color: var(--text-muted);
        text-align: center;
      }

      .training-actions {
        display: flex;
        gap: 6px;
        padding: 8px 14px;
        border-top: 1px solid var(--border-subtle);
      }
      .btn-danger-text {
        color: #ef4444 !important;
      }
      .btn-danger-text:hover {
        background: rgba(239, 68, 68, 0.1) !important;
      }

      .empty-state {
        text-align: center;
        padding: 48px;
        color: var(--text-muted);
        font-size: 13px;
      }

      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .dialog {
        background: #1e293b;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-xl);
        width: 100%;
        max-width: 420px;
        overflow: hidden;
      }
      .dialog-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid var(--border-subtle);
      }
      .dialog-header h3 {
        margin: 0;
        font-size: 15px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .dialog-close {
        background: none;
        border: none;
        color: var(--text-muted);
        font-size: 20px;
        cursor: pointer;
        padding: 4px;
      }
      .dialog-body {
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .form-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .form-group label {
        font-size: 11px;
        font-weight: 600;
        color: var(--text-secondary);
        text-transform: uppercase;
      }
      .form-select,
      .form-input {
        padding: 8px 10px;
        border: 1px solid var(--border-subtle);
        border-radius: var(--radius-md);
        background: rgba(15, 23, 42, 0.5);
        color: var(--text-primary);
        font-size: 13px;
      }
      .form-select:focus,
      .form-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .form-error {
        padding: 6px 8px;
        background: rgba(239, 68, 68, 0.1);
        border-radius: var(--radius-sm);
        font-size: 11px;
        color: #ef4444;
      }
      .dialog-footer {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        padding: 10px 18px;
        border-top: 1px solid var(--border-subtle);
      }

      @media (max-width: 768px) {
        .risk-bar {
          gap: 4px;
        }
        .risk-value {
          font-size: 18px;
        }
        .filter-row {
          flex-wrap: wrap;
        }
        .filter-input {
          max-width: 100%;
        }
      }
    `,
  ],
})
export class TrainingListComponent implements OnInit {
  private trainingService = inject(TrainingService);
  private toast = inject(ToastService);

  protected loading = signal(false);
  protected trainings = signal<Training[]>([]);
  protected riskSummary = signal<TrainingRiskSummary | null>(null);
  protected showAll = signal<Set<string>>(new Set());

  // Filters
  protected statusFilter = signal('');
  protected searchTerm = signal('');

  // Training dialog
  protected showAddTraining = false;
  protected editingTraining = signal<Training | null>(null);
  protected editTrainingName = '';
  protected editTrainingProvider = '';
  protected editTrainingCategory = 'general';
  protected editTrainingDescription = '';
  protected trainingSaveError = signal('');

  // Assign dialog
  protected assigningTraining = signal<Training | null>(null);
  protected assignPersonnelId = '';
  protected assignIssueDate = '';
  protected assignExpiryDate = '';
  protected assignDocumentUrl = '';
  protected assignSaveError = signal('');

  private searchTimeout: any;

  protected filteredTrainings = computed(() => {
    let list = this.trainings();
    const status = this.statusFilter();
    if (status) {
      list = list.filter((t) => t.personnelTrainings.some((pt) => pt.status === status));
    }
    const search = this.searchTerm().toLowerCase();
    if (search) {
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          (t.provider && t.provider.toLowerCase().includes(search)),
      );
    }
    return list;
  });

  protected totalAssignments = computed(() => {
    return this.trainings().reduce((sum, t) => sum + (t.personnelTrainings?.length || 0), 0);
  });

  ngOnInit() {
    this.load();
  }

  private load() {
    this.loading.set(true);
    this.trainingService.getAll().subscribe({
      next: (res) => {
        this.trainings.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Hata', 'Eğitimler yüklenemedi');
      },
    });
    this.trainingService.getRiskSummary().subscribe({
      next: (res) => this.riskSummary.set(res),
    });
  }

  protected onSearch() {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => this.load(), 300);
  }

  protected getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      valid: 'Geçerli',
      expiring: 'Sona Eriyor',
      expired: 'Süresi Doldu',
    };
    return map[status] || status;
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected getDaysLeft(date: string): string {
    const diff = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} gün gecikmiş`;
    if (diff === 0) return 'Bugün son!';
    return `${diff} gün kaldı`;
  }

  protected toggleShowAll(id: string) {
    this.showAll.update((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  // Training CRUD
  protected openAddTraining() {
    this.editingTraining.set(null);
    this.editTrainingName = '';
    this.editTrainingProvider = '';
    this.editTrainingCategory = 'general';
    this.editTrainingDescription = '';
    this.trainingSaveError.set('');
    this.showAddTraining = true;
  }

  protected editTraining(training: Training) {
    this.editingTraining.set(training);
    this.editTrainingName = training.name;
    this.editTrainingProvider = training.provider || '';
    this.editTrainingCategory = training.category;
    this.editTrainingDescription = training.description || '';
    this.trainingSaveError.set('');
    this.showAddTraining = true;
  }

  protected closeTrainingDialog() {
    this.showAddTraining = false;
    this.editingTraining.set(null);
  }

  protected saveTraining() {
    if (!this.editTrainingName.trim()) {
      this.trainingSaveError.set('Eğitim adı zorunludur');
      return;
    }

    const payload = {
      name: this.editTrainingName.trim(),
      provider: this.editTrainingProvider.trim() || undefined,
      category: this.editTrainingCategory,
      description: this.editTrainingDescription.trim() || undefined,
    };

    const existing = this.editingTraining();
    const obs = existing
      ? this.trainingService.update(existing.id, payload)
      : this.trainingService.create(payload);

    obs.subscribe({
      next: () => {
        this.closeTrainingDialog();
        this.load();
        this.toast.success(existing ? 'Eğitim güncellendi' : 'Eğitim oluşturuldu', '');
      },
      error: (err) => {
        this.trainingSaveError.set(err.message || 'Kaydedilemedi');
      },
    });
  }

  protected deleteTraining(training: Training) {
    if (!confirm(`"${training.name}" eğitimini silmek istediğinize emin misiniz?`)) return;
    this.trainingService.delete(training.id).subscribe({
      next: () => {
        this.load();
        this.toast.success('Eğitim silindi', '');
      },
      error: () => this.toast.error('Hata', 'Silinemedi'),
    });
  }

  // Assignment
  protected openAssign(training: Training) {
    this.assigningTraining.set(training);
    this.assignPersonnelId = '';
    this.assignIssueDate = '';
    this.assignExpiryDate = '';
    this.assignDocumentUrl = '';
    this.assignSaveError.set('');
  }

  protected closeAssign() {
    this.assigningTraining.set(null);
  }

  protected saveAssignment() {
    const training = this.assigningTraining();
    if (!training || !this.assignPersonnelId) {
      this.assignSaveError.set('Personel seçin');
      return;
    }

    this.trainingService
      .assign(this.assignPersonnelId, {
        trainingId: training.id,
        issueDate: this.assignIssueDate ? new Date(this.assignIssueDate).toISOString() : undefined,
        expiryDate: this.assignExpiryDate
          ? new Date(this.assignExpiryDate).toISOString()
          : undefined,
        documentUrl: this.assignDocumentUrl || undefined,
      })
      .subscribe({
        next: () => {
          this.closeAssign();
          this.load();
          this.toast.success('Eğitim atandı', '');
        },
        error: (err) => {
          this.assignSaveError.set(err.message || 'Atanamadı');
        },
      });
  }

  protected editAssignment(pt: PersonnelTrainingItem) {
    this.editTrainingName = pt.training?.name || '';
    this.editTrainingProvider = '';
    this.editTrainingCategory = 'general';
    this.editTrainingDescription = '';
    this.trainingSaveError.set('');

    // Set assign dialog for editing this assignment
    this.assigningTraining.set(pt.training || null);
    this.assignPersonnelId = pt.personnelId;
    this.assignIssueDate = pt.issueDate ? pt.issueDate.split('T')[0] : '';
    this.assignExpiryDate = pt.expiryDate ? pt.expiryDate.split('T')[0] : '';
    this.assignSaveError.set('');
  }

  protected removeAssignment(pt: PersonnelTrainingItem) {
    if (!confirm('Bu atamayı kaldırmak istediğinize emin misiniz?')) return;
    this.trainingService.removeAssignment(pt.id).subscribe({
      next: () => {
        this.load();
        this.toast.success('Atama kaldırıldı', '');
      },
      error: () => this.toast.error('Hata', 'Kaldırılamadı'),
    });
  }

  // Export
  protected exportExcel() {
    const params = new URLSearchParams();
    if (this.statusFilter()) params.set('status', this.statusFilter());
    window.open(`${environment.apiUrl}/trainings/export/excel?${params.toString()}`, '_blank');
  }

  protected exportPdf() {
    const params = new URLSearchParams();
    if (this.statusFilter()) params.set('status', this.statusFilter());
    window.open(`${environment.apiUrl}/trainings/export/pdf?${params.toString()}`, '_blank');
  }
}
