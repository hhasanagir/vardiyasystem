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
import { SkillService, SkillMatrixResponse, Skill } from '../../services/skill.service';

function getDaysUntilExpiry(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function getCellClass(ps: SkillMatrixResponse['assignments'][0] | undefined): string {
  if (!ps || !ps.isActive) return 'cell-none';
  if (!ps.expiresAt) return 'cell-valid';
  const days = getDaysUntilExpiry(ps.expiresAt);
  if (days === null) return 'cell-valid';
  if (days < 0) return 'cell-expired';
  if (days <= 14) return 'cell-expiring';
  return 'cell-valid';
}

function getCellLabel(ps: SkillMatrixResponse['assignments'][0] | undefined): string {
  if (!ps || !ps.isActive) return '—';
  if (!ps.expiresAt) return ps.certificationLevel;
  const days = getDaysUntilExpiry(ps.expiresAt);
  if (days === null) return ps.certificationLevel;
  if (days < 0) return 'Süresi doldu';
  if (days <= 14) return `${days}g kaldı`;
  return ps.certificationLevel;
}

const LEVEL_ORDER: Record<string, number> = { trainee: 1, certified: 2, expert: 3, trainer: 4 };

@Component({
  selector: 'app-skill-matrix',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="matrix-page">
      @if (error()) {
        <div class="error-banner">{{ error() }}</div>
      }

      @if (loading()) {
        <div class="skeleton-card">
          <div
            class="skeleton-shimmer"
            style="width:100%;height:300px;border-radius:var(--radius-lg)"
          ></div>
        </div>
      } @else {
        <div class="legend-row">
          <span class="legend-item"><span class="dot dot-valid"></span>Geçerli</span>
          <span class="legend-item"
            ><span class="dot dot-expiring"></span>14 gün içinde sona erecek</span
          >
          <span class="legend-item"><span class="dot dot-expired"></span>Süresi dolmuş</span>
          <span class="legend-item"><span class="dot dot-none"></span>Atanmamış</span>
        </div>

        <div class="matrix-wrapper scroll-container">
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="th-personnel">Personel</th>
                @for (skill of skills(); track skill.id) {
                  <th class="th-skill">{{ skill.name }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (p of personnel(); track p.id) {
                <tr>
                  <td class="td-personnel">
                    <span class="p-name">{{ p.name }}</span>
                    <span class="p-role">{{ p.role }}</span>
                  </td>
                  @for (skill of skills(); track skill.id) {
                    @let ps = getAssignment(p.id, skill.id);
                    <td class="td-skill">
                      <button
                        class="cell-btn touch-target"
                        [class]="getCellClass(p.id, skill.id)"
                        (click)="openDialog(p, skill, ps)"
                        title="{{
                          ps
                            ? ps.certificationLevel +
                              (ps.expiresAt
                                ? ' (' + getDaysUntilExpiry(ps.expiresAt) + ' gün)'
                                : '')
                            : 'Yetkinlik ata'
                        }}"
                      >
                        <span class="cell-label">{{ getCellLabel(p.id, skill.id) }}</span>
                        @if (ps) {
                          <span class="cell-level">{{ getLevelLabel(ps.certificationLevel) }}</span>
                        }
                      </button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (personnel().length === 0) {
          <div class="empty-state">Aktif personel bulunmuyor</div>
        }
        @if (skills().length === 0) {
          <div class="empty-state">
            Henüz yetkinlik tanımlanmamış. Lütfen önce yetkinlik ekleyin.
          </div>
        }
      }
    </div>

    @if (dialogVisible()) {
      <div class="dialog-overlay" (click)="closeDialog()">
        <div class="dialog" (click)="$event.stopPropagation()">
          <div class="dialog-header">
            <h3>Yetkinlik Yönetimi</h3>
            <button class="dialog-close" (click)="closeDialog()">&times;</button>
          </div>
          <div class="dialog-body">
            <div class="dialog-info">
              <span class="dialog-label">Personel:</span>
              <span class="dialog-value">{{ dialogPersonnel()?.name }}</span>
            </div>
            <div class="dialog-info">
              <span class="dialog-label">Yetkinlik:</span>
              <span class="dialog-value">{{ dialogSkill()?.name }}</span>
            </div>

            @if (dialogAssignment()) {
              <div class="dialog-current">
                <p>
                  Mevcut:
                  <strong>{{ getLevelLabel(dialogAssignment()!.certificationLevel) }}</strong>
                  @if (dialogAssignment()!.expiresAt) {
                    — Sona erme: {{ formatDate(dialogAssignment()!.expiresAt!) }}
                    @if (isExpired(dialogAssignment()!.expiresAt!)) {
                      <span class="expired-warn">(Süresi doldu)</span>
                    }
                  }
                </p>
              </div>
            }

            <div class="form-group">
              <label>Seviye</label>
              <select [(ngModel)]="editLevel" class="form-select">
                <option value="trainee">Stajyer</option>
                <option value="certified">Sertifikalı</option>
                <option value="expert">Uzman</option>
                <option value="trainer">Eğitmen</option>
              </select>
            </div>
            <div class="form-group">
              <label>Sona erme tarihi</label>
              <input type="date" [(ngModel)]="editExpiry" class="form-input" />
            </div>

            @if (saveError()) {
              <div class="form-error">{{ saveError() }}</div>
            }
          </div>
          <div class="dialog-footer">
            @if (dialogAssignment()) {
              <button class="btn btn-danger btn-sm" (click)="removeSkill()">
                Yetkinliği Kaldır
              </button>
            }
            <button class="btn btn-ghost btn-sm" (click)="closeDialog()">İptal</button>
            <button class="btn btn-primary btn-sm" (click)="saveSkill()">
              {{ dialogAssignment() ? 'Güncelle' : 'Ata' }}
            </button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .matrix-page {
        padding: 12px 16px;
        max-width: 1200px;
        margin: 0 auto;
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
      .btn-sm {
        padding: 6px 12px;
        font-size: 11px;
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
      .btn-danger {
        background: #ef4444;
        color: #fff;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
      }
      .btn-danger:hover {
        background: #dc2626;
      }
      .error-banner {
        padding: 8px 12px;
        margin-bottom: 8px;
        background: var(--status-error-bg);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--status-error);
      }
      .skeleton-card {
        width: 100%;
      }

      .legend-row {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-bottom: 12px;
        padding: 8px 12px;
        background: var(--bg-glass);
        border-radius: var(--radius-md);
      }
      .legend-item {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 10px;
        color: var(--text-muted);
      }
      .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .dot-valid {
        background: #22c55e;
      }
      .dot-expiring {
        background: #f59e0b;
      }
      .dot-expired {
        background: #ef4444;
      }
      .dot-none {
        background: var(--text-muted);
        opacity: 0.3;
      }

      .matrix-wrapper {
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        border-radius: var(--radius-lg);
        border: 1px solid var(--border-subtle);
      }
      .matrix-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 600px;
      }
      .matrix-table th,
      .matrix-table td {
        padding: 8px 10px;
        text-align: center;
        border-bottom: 1px solid var(--border-subtle);
        white-space: nowrap;
      }
      .matrix-table thead {
        position: sticky;
        top: 0;
        z-index: 2;
      }
      .matrix-table th {
        background: rgba(13, 19, 32, 0.95);
        font-size: 11px;
        font-weight: 700;
        color: var(--text-secondary);
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .th-personnel {
        text-align: left;
        min-width: 140px;
        position: sticky;
        left: 0;
        z-index: 3;
      }
      .th-skill {
        min-width: 100px;
      }
      .td-personnel {
        text-align: left;
        background: var(--bg-surface);
        position: sticky;
        left: 0;
        z-index: 1;
      }
      .p-name {
        display: block;
        font-size: 13px;
        font-weight: 600;
        color: var(--text-primary);
      }
      .p-role {
        display: block;
        font-size: 9px;
        color: var(--text-muted);
        text-transform: uppercase;
      }

      .cell-btn {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
        width: 100%;
        min-height: 44px;
        padding: 4px 6px;
        border: 1px solid transparent;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all var(--transition-fast);
        font-size: 11px;
      }
      .cell-btn:hover {
        transform: scale(1.05);
        border-color: var(--border-default);
      }
      .cell-label {
        font-weight: 600;
      }
      .cell-level {
        font-size: 8px;
        opacity: 0.7;
        text-transform: uppercase;
      }
      .cell-valid {
        background: rgba(34, 197, 94, 0.1);
        color: #4ade80;
      }
      .cell-expiring {
        background: rgba(245, 158, 11, 0.1);
        color: #fbbf24;
      }
      .cell-expired {
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
      }
      .cell-none {
        background: transparent;
        color: var(--text-muted);
        opacity: 0.4;
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
        max-width: 400px;
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
      .dialog-info {
        display: flex;
        gap: 6px;
        font-size: 12px;
      }
      .dialog-label {
        color: var(--text-muted);
      }
      .dialog-value {
        color: var(--text-primary);
        font-weight: 500;
      }
      .dialog-current {
        padding: 8px;
        background: var(--bg-glass);
        border-radius: var(--radius-md);
        font-size: 12px;
        color: var(--text-secondary);
      }
      .expired-warn {
        color: #ef4444;
        font-weight: 600;
        margin-left: 4px;
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

      .touch-target {
        min-height: 44px;
      }

      @media (max-width: 768px) {
        .th-personnel {
          min-width: 100px;
        }
        .th-skill {
          min-width: 70px;
          font-size: 10px;
        }
        .cell-btn {
          min-height: 40px;
          font-size: 10px;
        }
        .matrix-wrapper {
          margin: 0 -16px;
          border-radius: 0;
          border-left: none;
          border-right: none;
        }
      }
    `,
  ],
})
export class SkillMatrixComponent implements OnInit {
  private skillService = inject(SkillService);

  protected loading = signal(false);
  protected error = signal<string | null>(null);
  protected skills = signal<Skill[]>([]);
  protected personnel = signal<SkillMatrixResponse['personnel']>([]);
  protected assignments = signal<SkillMatrixResponse['assignments']>([]);

  protected dialogVisible = signal(false);
  protected dialogPersonnel = signal<SkillMatrixResponse['personnel'][0] | null>(null);
  protected dialogSkill = signal<Skill | null>(null);
  protected dialogAssignment = signal<SkillMatrixResponse['assignments'][0] | null>(null);
  protected editLevel = signal('certified');
  protected editExpiry = signal('');
  protected saveError = signal('');

  private matrixCache: SkillMatrixResponse | null = null;

  ngOnInit() {
    this.refresh();
  }

  protected refresh() {
    this.loading.set(true);
    this.error.set(null);
    this.skillService.getSkillMatrix().subscribe({
      next: (res) => {
        this.matrixCache = res;
        this.skills.set(res.skills);
        this.personnel.set(res.personnel);
        this.assignments.set(res.assignments);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.message || 'Matris yüklenemedi');
        this.loading.set(false);
      },
    });
  }

  protected getDaysUntilExpiry(expiresAt: string | null): number | null {
    return getDaysUntilExpiry(expiresAt);
  }

  protected getAssignment(personnelId: string, skillId: string) {
    return this.assignments().find((a) => a.personnelId === personnelId && a.skillId === skillId);
  }

  protected getCellClass(personnelId: string, skillId: string) {
    const ps = this.getAssignment(personnelId, skillId);
    return getCellClass(ps);
  }

  protected getCellLabel(personnelId: string, skillId: string) {
    const ps = this.getAssignment(personnelId, skillId);
    return getCellLabel(ps);
  }

  protected getLevelLabel(level: string): string {
    const map: Record<string, string> = {
      trainee: 'Stajyer',
      certified: 'Sertifikalı',
      expert: 'Uzman',
      trainer: 'Eğitmen',
    };
    return map[level] || level;
  }

  protected isExpired(date: string): boolean {
    return new Date(date).getTime() < Date.now();
  }

  protected formatDate(date: string): string {
    return new Date(date).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  protected openDialog(
    personnel: SkillMatrixResponse['personnel'][0],
    skill: Skill,
    assignment: SkillMatrixResponse['assignments'][0] | undefined,
  ) {
    this.dialogPersonnel.set(personnel);
    this.dialogSkill.set(skill);
    this.dialogAssignment.set(assignment || null);
    this.editLevel.set(assignment?.certificationLevel || 'certified');
    this.editExpiry.set(assignment?.expiresAt ? assignment.expiresAt.split('T')[0] : '');
    this.saveError.set('');
    this.dialogVisible.set(true);
  }

  protected closeDialog() {
    this.dialogVisible.set(false);
  }

  protected saveSkill() {
    const personnel = this.dialogPersonnel();
    const skill = this.dialogSkill();
    if (!personnel || !skill) return;

    this.saveError.set('');
    const payload = {
      skillId: skill.id,
      certificationLevel: this.editLevel(),
      expiresAt: this.editExpiry() ? new Date(this.editExpiry()).toISOString() : undefined,
    };

    const existing = this.dialogAssignment();
    const obs = existing
      ? this.skillService.updatePersonnelSkill(existing.id, payload)
      : this.skillService.assignSkill(personnel.id, payload);

    obs.subscribe({
      next: () => {
        this.closeDialog();
        this.refresh();
      },
      error: (err) => {
        this.saveError.set(err.message || 'Kaydedilemedi');
      },
    });
  }

  protected removeSkill() {
    const assignment = this.dialogAssignment();
    if (!assignment) return;
    this.skillService.removePersonnelSkill(assignment.id).subscribe({
      next: () => {
        this.closeDialog();
        this.refresh();
      },
      error: (err) => {
        this.saveError.set(err.message || 'Silinemedi');
      },
    });
  }
}
