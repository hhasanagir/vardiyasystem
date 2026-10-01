import {
  Component,
  inject,
  input,
  output,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api/api.service';
import { ScheduleService } from '../../services/schedule.service';
import { NotificationService } from '../../services/notification.service';
import type { ShiftAssignment } from '../../domain/models';
import { firstValueFrom } from 'rxjs';
import {
  translateAssignmentError,
  shiftsMatch,
  shiftNameTR,
  formatDateTR,
  deviceBookedMessageFor,
} from '../../core/utils/assignment-errors';

interface PersonnelOption {
  id: string;
  name: string;
  unitId: string;
  role: string;
  skills: string[];
  isActive: boolean;
  seniority?: number;
  nightShiftEligible?: boolean;
  unit?: { id: string; code?: string; type?: string; name?: string };
}

@Component({
  selector: 'app-assignment-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="dialog-overlay" (click)="close()" (keydown.escape)="close()">
      <div
        class="dialog-panel"
        (click)="$event.stopPropagation()"
        (keydown.enter)="save()"
        tabindex="0"
      >
        <div class="dialog-header">
          <h3>{{ assignmentId() ? 'Vardiya Atamasını Düzenle' : 'Vardiya Ataması' }}</h3>
          <button class="close-btn" (click)="close()" title="Kapat (Esc)">✕</button>
        </div>

        <div class="dialog-body">
          <div class="slot-info">
            @if (unitLabel()) {
              <div class="info-row">
                <span class="info-label">Birim</span
                ><span class="info-value">{{ unitLabel() }}</span>
              </div>
            }
            <div class="info-row">
              <span class="info-label">Cihaz</span
              ><span class="info-value"
                >{{ deviceCode() }}
                @if (deviceName()) {
                  <span class="info-sub">{{ deviceName() }}</span>
                }
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Tarih</span
              ><span class="info-value">{{ formattedDate() }}</span>
            </div>
            <div class="info-row">
              <span class="info-label">Vardiya</span
              ><span class="info-value"
                >{{ shiftLabel() }}
                @if (startTime() && endTime()) {
                  <span class="info-sub">{{ startTime() }} - {{ endTime() }}</span>
                }
              </span>
            </div>
            @if (personnelTypeLabel()) {
              <div class="info-row">
                <span class="info-label">Rol</span
                ><span class="info-value">{{ personnelTypeLabel() }}</span>
              </div>
            }
          </div>

          @if (slotWarnings().length) {
            <div class="slot-warnings">
              @for (w of slotWarnings(); track w.message) {
                <div class="slot-warning" [class.error]="w.severity === 'error'">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {{ w.message }}
                </div>
              }
            </div>
          }

          <div class="search-box">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              [ngModel]="search()"
              (ngModelChange)="search.set($event)"
              placeholder="Personel ara (isim, yetenek)..."
              class="search-input"
            />
          </div>

          @if (loading()) {
            <div class="loading-state">
              <div class="spinner"></div>
              <span>Personeller yükleniyor...</span>
            </div>
          } @else if (error()) {
            <div class="error-state">{{ error() }}</div>
          } @else if (filteredPersonnel().length === 0) {
            <div class="empty-state">Eşleşen personel bulunamadı</div>
          } @else {
            <div class="personnel-list">
              @for (p of filteredPersonnel(); track p.id) {
                <div
                  class="personnel-item"
                  [class.selected]="selectedId() === p.id"
                  [class.ineligible]="p.nightShiftEligible === false && isNightShift()"
                  (click)="selectedId.set(p.id)"
                  (dblclick)="save()"
                >
                  <div class="personnel-avatar" [style.background]="getColor(p.name)">
                    {{ p.name.charAt(0).toUpperCase() }}
                  </div>
                  <div class="personnel-detail">
                    <span class="personnel-name">{{ p.name }}</span>
                    <span class="personnel-meta"
                      >{{ roleLabel(p.role) }} · {{ p.seniority || 0 }} yıl</span
                    >
                    @if (p.skills && p.skills.length > 0) {
                      <div class="skill-tags">
                        @for (s of p.skills.slice(0, 3); track s) {
                          <span class="skill-tag">{{ s }}</span>
                        }
                      </div>
                    }
                  </div>
                  @if (selectedId() === p.id) {
                    <svg
                      class="check-icon"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22c55e"
                      stroke-width="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  }
                </div>
              }
            </div>
            <div class="list-count">
              {{ selectedId() ? '1 seçildi' : filteredPersonnel().length + ' personel' }}
            </div>
          }
        </div>

        <div class="dialog-footer">
          <button class="btn btn-secondary" (click)="close()">İptal (Esc)</button>
          <button
            class="btn btn-primary"
            [disabled]="!selectedId() || saving() || blockerCount() > 0"
            (click)="save()"
          >
            @if (saving()) {
              <span class="btn-spinner"></span> Kaydediliyor...
            } @else if (blockerCount() > 0) {
              Atama Engellendi
            } @else {
              Atamayı Kaydet (Enter)
            }
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .dialog-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .dialog-panel {
        background: var(--bg-primary, #1e293b);
        border-radius: 12px;
        width: 420px;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        box-shadow: 0 25px 50px rgba(0, 0, 0, 0.4);
        outline: none;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 20px;
        border-bottom: 1px solid var(--border-color, #334155);
      }
      .dialog-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary, #f1f5f9);
      }
      .close-btn {
        background: none;
        border: none;
        color: var(--text-secondary, #94a3b8);
        cursor: pointer;
        font-size: 18px;
        padding: 4px;
        border-radius: 4px;
      }
      .close-btn:hover {
        color: var(--text-primary, #f1f5f9);
        background: rgba(255, 255, 255, 0.05);
      }
      .dialog-body {
        padding: 16px 20px;
        overflow-y: auto;
        flex: 1;
      }
      .slot-info {
        background: var(--bg-secondary, #0f172a);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
      }
      .info-row {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;
      }
      .info-label {
        color: var(--text-secondary, #94a3b8);
      }
      .info-value {
        color: var(--text-primary, #f1f5f9);
        font-weight: 500;
      }
      .info-sub {
        font-weight: 400;
        color: var(--text-secondary, #94a3b8);
        font-size: 11px;
      }
      .slot-warnings {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .slot-warning {
        display: flex;
        align-items: flex-start;
        gap: 6px;
        padding: 8px 10px;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
      }
      .slot-warning.error {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.25);
        color: #fca5a5;
      }
      .slot-warning.warning {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        color: #fbbf24;
      }
      .slot-warning svg {
        flex-shrink: 0;
        margin-top: 1px;
      }
      .search-box {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--bg-secondary, #0f172a);
        border-radius: 8px;
        padding: 8px 12px;
        margin-bottom: 12px;
      }
      .search-input {
        background: none;
        border: none;
        color: var(--text-primary, #f1f5f9);
        outline: none;
        flex: 1;
        font-size: 13px;
      }
      .search-input::placeholder {
        color: var(--text-secondary, #64748b);
      }
      .personnel-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        max-height: 280px;
        overflow-y: auto;
      }
      .personnel-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
        border: 1px solid transparent;
      }
      .personnel-item:hover {
        background: var(--bg-secondary, #0f172a);
      }
      .personnel-item.selected {
        background: rgba(59, 130, 246, 0.12);
        border-color: rgba(59, 130, 246, 0.3);
      }
      .personnel-item.ineligible {
        opacity: 0.5;
      }
      .personnel-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        color: #fff;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 13px;
        flex-shrink: 0;
      }
      .personnel-detail {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .personnel-name {
        font-size: 13px;
        font-weight: 500;
        color: var(--text-primary, #f1f5f9);
      }
      .personnel-meta {
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
      }
      .skill-tags {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
        margin-top: 4px;
      }
      .skill-tag {
        font-size: 10px;
        background: rgba(59, 130, 246, 0.15);
        color: #93c5fd;
        padding: 1px 6px;
        border-radius: 4px;
      }
      .check-icon {
        flex-shrink: 0;
      }
      .list-count {
        text-align: right;
        font-size: 11px;
        color: var(--text-secondary, #64748b);
        padding: 6px 4px 0;
      }
      .dialog-footer {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 20px;
        border-top: 1px solid var(--border-color, #334155);
      }
      .btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s;
      }
      .btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-secondary {
        background: var(--bg-secondary, #0f172a);
        color: var(--text-primary, #f1f5f9);
      }
      .btn-secondary:hover {
        background: #1e293b;
      }
      .btn-primary {
        background: var(--accent-color, #3b82f6);
        color: #fff;
      }
      .btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .loading-state,
      .error-state,
      .empty-state {
        padding: 24px;
        text-align: center;
        color: var(--text-secondary, #94a3b8);
        font-size: 13px;
      }
      .spinner,
      .btn-spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        margin-right: 6px;
        vertical-align: middle;
      }
      .loading-state .spinner {
        border-color: rgba(59, 130, 246, 0.3);
        border-top-color: #3b82f6;
        margin-right: 8px;
        vertical-align: middle;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    `,
  ],
})
export class AssignmentDialogComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);
  private readonly scheduleApi = inject(ScheduleService);
  private readonly notification = inject(NotificationService);

  readonly scheduleId = input<string>('');
  readonly assignmentId = input<string>('');
  readonly existingPersonnelId = input<string>('');
  readonly existingPersonnelName = input<string>('');
  readonly deviceId = input.required<string>();
  readonly deviceCode = input.required<string>();
  readonly deviceName = input<string>('');
  readonly unitLabel = input<string>('');
  readonly existingAssignments = input<ShiftAssignment[]>([]);
  readonly date = input.required<string>();
  readonly shiftType = input.required<string>();
  readonly personnelType = input<string | null | undefined>(null);
  readonly startTime = input<string | undefined>('');
  readonly endTime = input<string | undefined>('');
  readonly unitType = input<string>('');
  readonly month = input<number>(0);
  readonly year = input<number>(0);

  readonly closeDialog = output<void>();
  readonly assignmentSaved = output<void>();

  readonly personnelList = signal<PersonnelOption[]>([]);
  readonly selectedId = signal<string>('');
  readonly search = signal('');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string>('');

  readonly filteredPersonnel = computed(() => {
    const q = this.search().toLowerCase();
    return this.personnelList().filter(
      (p) => p.name.toLowerCase().includes(q) || p.skills?.some((s) => s.toLowerCase().includes(q)),
    );
  });

  readonly isNightShift = computed(() => {
    const s = this.shiftType().toLowerCase();
    return s === 'gece' || s === 'night';
  });

  readonly shiftLabel = computed(() => {
    const map: Record<string, string> = {
      sabah: 'Sabah 08-16',
      morning: 'Sabah 08-16',
      ikindi: 'İkindi 16-00',
      gece: 'Gece 00-08',
      gunduz: 'Gündüz 08-20',
      day: 'Gündüz',
      night: 'Gece',
      evening: 'İkindi',
    };
    return map[this.shiftType().toLowerCase()] || this.shiftType();
  });

  readonly personnelTypeLabel = computed(() => {
    const pt = this.personnelType();
    if (!pt) return '';
    const labels: Record<string, string> = {
      assistant_technician: 'Yardımcı Tekniker',
      technician: 'Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
      medical_physicist: 'Sağlık Fizikçisi',
      medical_physicist_2: 'Sağlık Fizikçisi',
      medical_physicist_3: 'Sağlık Fizikçisi',
      planning: 'Planlama',
    };
    return labels[pt] || pt;
  });

  readonly formattedDate = computed(() => {
    const d = new Date(this.date() + 'T00:00:00');
    if (isNaN(d.getTime())) return this.date();
    const months = [
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
    const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()} ${days[d.getDay()]}`;
  });

  readonly slotWarnings = computed(() => {
    const warnings: Array<{ severity: 'error' | 'warning'; message: string }> = [];
    const pid = this.selectedId();
    if (!pid) return warnings;
    const date = this.date();
    const s = this.shiftType();
    const list = this.existingAssignments().filter((a) => a.id !== this.assignmentId());
    const today = formatDateTR(date);

    for (const a of list) {
      if (a.personnelId !== pid || a.date !== date) continue;
      const name = a.personnelName || 'Bu personel';
      if (shiftsMatch(a.shiftType, s)) {
        // Aynı gün + aynı vardiya: ikinci slot da dahil engellenir (Kural A/B)
        warnings.push({
          severity: 'error',
          message: `${name} ${today} tarihinde zaten ${shiftNameTR(a.shiftType)} vardiyasına atanmıştır.`,
        });
      } else {
        warnings.push({
          severity: 'error',
          message: `${name} ${today} tarihinde başka bir vardiyaya (${shiftNameTR(a.shiftType)}) atanmıştır.`,
        });
      }
    }

    const pt = this.personnelType();
    const person = this.personnelList().find((p) => p.id === pid);
    const bookedMsg = deviceBookedMessageFor(
      list,
      this.deviceId(),
      pid,
      date,
      s,
      pt || person?.role,
    );
    if (bookedMsg) {
      warnings.push({ severity: 'error', message: bookedMsg });
    }
    if (person && pt && pt !== person.role) {
      const family = (r: string) =>
        r === 'technician' || r === 'assistant_technician' ? 'tech' : r;
      if (family(pt) !== family(person.role)) {
        warnings.push({
          severity: 'warning',
          message: `Seçilen personel ${this.personnelTypeLabel()} pozisyonu için önerilmez (${this.roleLabel(person.role)}).`,
        });
      }
    }

    if (!this.isNightShift() && !this.isNightShiftType(s)) {
      const prevDate = new Date(date + 'T00:00:00');
      prevDate.setDate(prevDate.getDate() - 1);
      const prevStr = prevDate.toISOString().split('T')[0];
      const prevNight = list.find(
        (a) =>
          a.personnelId === pid &&
          a.date === prevStr &&
          (this.isNightShiftType(a.shiftType) || a.startTime >= '20'),
      );
      if (prevNight) {
        warnings.push({
          severity: 'error',
          message: `${prevNight.personnelName || 'Personel'}: önceki gece vardiyasının ertesinde ${shiftNameTR(s)} atanıyor — dinlenme kuralı ihlali`,
        });
      }
    }
    return warnings;
  });

  readonly blockerCount = computed(
    () => this.slotWarnings().filter((w) => w.severity === 'error').length,
  );

  private isNightShiftType(s: string): boolean {
    const t = s.toLowerCase();
    return t === 'gece' || t === 'night' || t.includes('gece') || t.includes('night');
  }

  private keyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
    if (e.key === 'Enter' && this.selectedId() && !this.saving() && this.blockerCount() === 0)
      this.save();
  };

  ngOnInit(): void {
    document.addEventListener('keydown', this.keyHandler);
    this.loadPersonnel();
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keyHandler);
  }

  private async loadPersonnel(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = { isActive: 'true' };
      const ut = this.unitType();
      if (ut) {
        params['unitId'] = ut;
      }
      const res = await firstValueFrom(this.api.get<PersonnelOption[]>('/personnel', { params }));
      this.personnelList.set(this.filterByUnit(res || [], ut));
      if (this.assignmentId() && this.existingPersonnelId()) {
        const exists = this.personnelList().some((p) => p.id === this.existingPersonnelId());
        if (exists) this.selectedId.set(this.existingPersonnelId());
      }
    } catch (e: any) {
      this.error.set(e?.message || 'Personeller yüklenemedi');
    } finally {
      this.loading.set(false);
    }
  }

  private filterByUnit(list: PersonnelOption[], unitType: string): PersonnelOption[] {
    if (!unitType) return list;
    const ut = unitType.toLowerCase();
    return list.filter((p) => {
      const u = p.unit;
      if (!u) return false;
      return u.type === ut || (u.code && u.code.toLowerCase() === ut) || u.id === unitType;
    });
  }

  private normalizeShift(s: string): string {
    const map: Record<string, string> = {
      gunduz: 'day',
      gece: 'night',
      sabah: 'morning',
      ikindi: 'evening',
      aksam: 'evening',
    };
    return map[s.toLowerCase()] || s;
  }

  async save(): Promise<void> {
    const pid = this.selectedId();
    if (!pid) return;
    this.saving.set(true);
    try {
      const st = this.shiftType();
      const isNight = st === 'gece' || st === 'night';
      const assignment = {
        personnelId: pid,
        deviceId: this.deviceId(),
        date: this.date(),
        shiftType: this.normalizeShift(st),
        personnelType: this.personnelType() || undefined,
        startTime: this.startTime() || (isNight ? '20:00' : '08:00'),
        endTime: this.endTime() || (isNight ? '08:00' : '20:00'),
      };

      const sid = this.scheduleId();
      const aid = this.assignmentId();
      if (aid && sid) {
        await firstValueFrom(
          this.scheduleApi.updateAssignment(sid, aid, { ...assignment }, 'Düzenleme'),
        );
      } else if (sid) {
        await firstValueFrom(
          this.scheduleApi.assignPersonnel(sid, { ...assignment }, 'Manuel atama'),
        );
      } else {
        const ut = this.unitType();
        const m = this.month();
        const y = this.year();
        if (!ut || !m || !y) {
          this.error.set('Birim bilgisi eksik');
          return;
        }
        await firstValueFrom(this.scheduleApi.directAssign(ut, m, y, assignment));
      }
      this.notification.success('Atama Başarılı', 'Vardiya ataması kaydedildi.');
      this.assignmentSaved.emit();
      this.closeDialog.emit();
    } catch (e: any) {
      const raw = e?.message || e?.error?.message || '';
      const translated = translateAssignmentError(raw);
      this.error.set(translated?.message || raw || 'Vardiya ataması yapılamadı.');
    } finally {
      this.saving.set(false);
    }
  }

  close(): void {
    this.closeDialog.emit();
  }

  getColor(name: string): string {
    const colors = [
      '#3b82f6',
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#8b5cf6',
      '#ec4899',
      '#14b8a6',
      '#f97316',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }

  protected roleLabel(role: string): string {
    const labels: Record<string, string> = {
      technician: 'Tekniker',
      assistant_technician: 'Yardımcı Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
    };
    return labels[role] || role;
  }
}
