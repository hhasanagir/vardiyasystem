import {
  Component,
  inject,
  OnInit,
  OnDestroy,
  signal,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../services/api.service';
import { AuthService } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

interface LeaveRequest {
  id: string;
  personnelId: string;
  personnelName: string;
  unit: string;
  type: 'ANNUAL' | 'SICK' | 'UNPAID' | 'MATERNITY' | 'PATERNITY' | 'COMPASSIONATE';
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

@Component({
  selector: 'app-leave-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="leave-page">
      <header class="page-header">
        <div class="header-left">
          <h1>İzin Yönetimi</h1>
          <p class="subtitle">Personel izin taleplerini yönet</p>
        </div>
        <div class="header-right">
          <div class="filter-tabs">
            <button [class.active]="activeFilter() === 'all'" (click)="setFilter('all')">
              Tümü
            </button>
            <button [class.active]="activeFilter() === 'PENDING'" (click)="setFilter('PENDING')">
              Bekleyen
            </button>
            <button [class.active]="activeFilter() === 'APPROVED'" (click)="setFilter('APPROVED')">
              Onaylanan
            </button>
            <button [class.active]="activeFilter() === 'REJECTED'" (click)="setFilter('REJECTED')">
              Reddedilen
            </button>
          </div>
          <button class="btn-primary" (click)="openNewRequest()">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Yeni İzin Talebi
          </button>
        </div>
      </header>

      <div class="stats-grid">
        <div class="stat-card pending">
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ pendingCount() }}</span>
            <span class="stat-label">Bekleyen İzin</span>
          </div>
        </div>
        <div class="stat-card approved">
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ approvedCount() }}</span>
            <span class="stat-label">Onaylanan</span>
          </div>
        </div>
        <div class="stat-card total">
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ totalDays() }}</span>
            <span class="stat-label">Toplam İzin Günü</span>
          </div>
        </div>
        <div class="stat-card this-month">
          <div class="stat-icon">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M8 2v4M16 2v4M3 10h18M21 8v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8" />
            </svg>
          </div>
          <div class="stat-content">
            <span class="stat-value">{{ thisMonthCount() }}</span>
            <span class="stat-label">Bu Ay Kullanılan</span>
          </div>
        </div>
      </div>

      <div class="requests-table scroll-container scroll-sticky-head">
        <table>
          <thead>
            <tr>
              <th>Personel</th>
              <th>Birim</th>
              <th>İzin Türü</th>
              <th>Tarih Aralığı</th>
              <th>Gün</th>
              <th>Durum</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            @for (request of filteredRequests(); track request.id) {
              <tr [class.highlight]="request.status === 'PENDING'">
                <td>
                  <div class="personnel-cell">
                    <span class="avatar">{{ request.personnelName.charAt(0) }}</span>
                    <span>{{ request.personnelName }}</span>
                  </div>
                </td>
                <td>
                  <span class="unit-badge" [class]="request.unit">{{
                    getUnitLabel(request.unit)
                  }}</span>
                </td>
                <td>
                  <span class="type-badge" [class]="request.type">{{
                    getLeaveTypeLabel(request.type)
                  }}</span>
                </td>
                <td>{{ formatDateRange(request.startDate, request.endDate) }}</td>
                <td class="days">{{ request.days }} gün</td>
                <td>
                  <span class="status-badge" [class]="request.status">
                    {{ getStatusLabel(request.status) }}
                  </span>
                </td>
                <td>
                  <div class="actions">
                    @if (request.status === 'PENDING') {
                      <button
                        class="action-btn approve"
                        (click)="approveRequest(request)"
                        title="Onayla"
                      >
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
                      </button>
                      <button
                        class="action-btn reject"
                        (click)="rejectRequest(request)"
                        title="Reddet"
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    }
                    <button class="action-btn view" (click)="viewDetails(request)" title="Detay">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="7" class="empty-state">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <p>İzin talebi bulunamadı</p>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      @if (showDetailModal()) {
        <div class="modal-overlay" (click)="closeModal()">
          <div class="modal-content" (click)="$event.stopPropagation()">
            <header class="modal-header">
              <h2>İzin Detayı</h2>
              <button class="close-btn" (click)="closeModal()">&times;</button>
            </header>
            <div class="modal-body">
              @if (selectedRequest()) {
                <div class="detail-grid">
                  <div class="detail-item">
                    <label>Personel</label>
                    <span>{{ selectedRequest()!.personnelName }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Birim</label>
                    <span>{{ getUnitLabel(selectedRequest()!.unit) }}</span>
                  </div>
                  <div class="detail-item">
                    <label>İzin Türü</label>
                    <span>{{ getLeaveTypeLabel(selectedRequest()!.type) }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Toplam Gün</label>
                    <span>{{ selectedRequest()!.days }} gün</span>
                  </div>
                  <div class="detail-item full">
                    <label>Tarih Aralığı</label>
                    <span>{{
                      formatDateRange(selectedRequest()!.startDate, selectedRequest()!.endDate)
                    }}</span>
                  </div>
                  <div class="detail-item full">
                    <label>Açıklama</label>
                    <span>{{ selectedRequest()!.reason || 'Belirtilmedi' }}</span>
                  </div>
                  <div class="detail-item">
                    <label>Durum</label>
                    <span class="status-badge" [class]="selectedRequest()!.status">
                      {{ getStatusLabel(selectedRequest()!.status) }}
                    </span>
                  </div>
                  <div class="detail-item">
                    <label>Başvuru Tarihi</label>
                    <span>{{ formatDate(selectedRequest()!.submittedAt) }}</span>
                  </div>
                </div>
              }
            </div>
            @if (selectedRequest()?.status === 'PENDING') {
              <footer class="modal-footer">
                <button class="btn-secondary" (click)="closeModal()">Kapat</button>
                <button class="btn-danger" (click)="rejectAndClose()">Reddet</button>
                <button class="btn-primary" (click)="approveAndClose()">Onayla</button>
              </footer>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .leave-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 1.5rem;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }

      .page-header h1 {
        font-size: 1.5rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
      }

      .subtitle {
        font-size: 0.875rem;
        color: #64748b;
        margin: 0.25rem 0 0;
      }

      .header-right {
        display: flex;
        gap: 1rem;
        align-items: center;
      }

      .filter-tabs {
        display: flex;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 4px;
      }

      .filter-tabs button {
        padding: 8px 16px;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #94a3b8;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all 0.2s;
      }

      .filter-tabs button:hover {
        color: #e2e8f0;
      }

      .filter-tabs button.active {
        background: rgba(99, 102, 241, 0.2);
        color: #a5b4fc;
      }

      .btn-primary {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border: none;
        border-radius: 8px;
        color: white;
        font-size: 0.875rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }

      .btn-primary:hover {
        filter: brightness(1.1);
        transform: translateY(-1px);
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1rem;
      }

      .stat-card {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: 1.25rem;
        background: rgba(30, 41, 59, 0.6);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
      }

      .stat-icon {
        width: 48px;
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
      }

      .stat-card.pending .stat-icon {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }

      .stat-card.approved .stat-icon {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }

      .stat-card.total .stat-icon {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
      }

      .stat-card.this-month .stat-icon {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }

      .stat-content {
        display: flex;
        flex-direction: column;
      }

      .stat-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: #f8fafc;
      }

      .stat-label {
        font-size: 0.75rem;
        color: #64748b;
      }

      .requests-table {
        flex: 1;
        min-height: 0;
        background: rgba(30, 41, 59, 0.4);
        border: 1px solid rgba(71, 85, 105, 0.2);
        border-radius: 12px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 12px 16px;
        text-align: left;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      }

      th {
        background: #0f172a;
        font-size: 0.75rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      td {
        font-size: 0.875rem;
        color: #e2e8f0;
      }

      tr:hover {
        background: rgba(255, 255, 255, 0.02);
      }

      tr.highlight {
        background: rgba(245, 158, 11, 0.05);
      }

      .personnel-cell {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .avatar {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        border-radius: 8px;
        color: white;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .unit-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .unit-badge.mr {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .unit-badge.bt {
        background: rgba(20, 184, 166, 0.15);
        color: #2dd4bf;
      }
      .unit-badge.rontgen {
        background: rgba(249, 115, 22, 0.15);
        color: #fb923c;
      }
      .unit-badge.nukleer {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .unit-badge.onkoloji {
        background: rgba(236, 72, 153, 0.15);
        color: #f472b6;
      }

      .type-badge {
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 500;
      }

      .type-badge.ANNUAL {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .type-badge.SICK {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }
      .type-badge.UNPAID {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }
      .type-badge.MATERNITY {
        background: rgba(236, 72, 153, 0.15);
        color: #f472b6;
      }
      .type-badge.PATERNITY {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .type-badge.COMPASSIONATE {
        background: rgba(100, 116, 139, 0.15);
        color: #94a3b8;
      }

      .days {
        font-weight: 600;
        color: #a5b4fc;
      }

      .status-badge {
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: 600;
      }

      .status-badge.PENDING {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .status-badge.APPROVED {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }
      .status-badge.REJECTED {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .actions {
        display: flex;
        gap: 8px;
      }

      .action-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .action-btn.approve {
        background: rgba(16, 185, 129, 0.15);
        color: #34d399;
      }

      .action-btn.approve:hover {
        background: rgba(16, 185, 129, 0.3);
      }

      .action-btn.reject {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .action-btn.reject:hover {
        background: rgba(239, 68, 68, 0.3);
      }

      .action-btn.view {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
      }

      .action-btn.view:hover {
        background: rgba(99, 102, 241, 0.3);
      }

      .empty-state {
        text-align: center;
        padding: 3rem;
        color: #64748b;
      }

      .empty-state svg {
        margin-bottom: 1rem;
        opacity: 0.5;
      }

      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
      }

      .modal-content {
        width: 100%;
        max-width: 500px;
        background: #1a1a2e;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
      }

      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1.25rem 1.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      }

      .modal-header h2 {
        font-size: 1.125rem;
        font-weight: 600;
        color: #f8fafc;
        margin: 0;
      }

      .close-btn {
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: none;
        border-radius: 6px;
        color: #64748b;
        font-size: 1.5rem;
        cursor: pointer;
      }

      .close-btn:hover {
        background: rgba(255, 255, 255, 0.1);
        color: #f8fafc;
      }

      .modal-body {
        padding: 1.5rem;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 1rem;
      }

      .detail-item {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .detail-item.full {
        grid-column: span 2;
      }

      .detail-item label {
        font-size: 0.75rem;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .detail-item span {
        font-size: 0.875rem;
        color: #e2e8f0;
      }

      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
      }

      .btn-secondary {
        padding: 10px 16px;
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        color: #94a3b8;
        font-size: 0.875rem;
        cursor: pointer;
      }

      .btn-danger {
        padding: 10px 16px;
        background: rgba(239, 68, 68, 0.15);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 8px;
        color: #f87171;
        font-size: 0.875rem;
        cursor: pointer;
      }
    `,
  ],
})
export class LeaveManagementComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private destroy$ = new Subject<void>();

  requests = signal<LeaveRequest[]>([]);
  activeFilter = signal<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  showDetailModal = signal(false);
  selectedRequest = signal<LeaveRequest | null>(null);

  filteredRequests = computed(() => {
    const filter = this.activeFilter();
    const all = this.requests();
    if (filter === 'all') return all;
    return all.filter((r) => r.status === filter);
  });

  pendingCount = computed(() => this.requests().filter((r) => r.status === 'PENDING').length);
  approvedCount = computed(() => this.requests().filter((r) => r.status === 'APPROVED').length);
  totalDays = computed(() =>
    this.requests()
      .filter((r) => r.status === 'APPROVED')
      .reduce((sum, r) => sum + r.days, 0),
  );
  thisMonthCount = computed(() => {
    const now = new Date();
    return this.requests()
      .filter((r) => {
        const start = new Date(r.startDate);
        return (
          r.status === 'APPROVED' &&
          start.getMonth() === now.getMonth() &&
          start.getFullYear() === now.getFullYear()
        );
      })
      .reduce((sum, r) => sum + r.days, 0);
  });

  ngOnInit() {
    this.loadRequests();
  }

  loadRequests() {
    this.api
      .get<LeaveRequest[]>('/leave-requests')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (data) => this.requests.set(data),
        error: () => {
          this.requests.set([]);
        },
      });
  }

  setFilter(filter: 'all' | 'PENDING' | 'APPROVED' | 'REJECTED') {
    this.activeFilter.set(filter);
  }

  openNewRequest() {
    // Opens new request form
  }

  viewDetails(request: LeaveRequest) {
    this.selectedRequest.set(request);
    this.showDetailModal.set(true);
  }

  approveRequest(request: LeaveRequest) {
    this.api
      .put(`/leave-requests/${request.id}`, { status: 'APPROVED' })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.requests.update((list) =>
            list.map((r) =>
              r.id === request.id
                ? {
                    ...r,
                    status: 'APPROVED' as const,
                    reviewedBy: this.auth.user()?.name,
                    reviewedAt: new Date().toISOString(),
                  }
                : r,
            ),
          );
        },
      });
  }

  rejectRequest(request: LeaveRequest) {
    this.requests.update((list) =>
      list.map((r) =>
        r.id === request.id
          ? {
              ...r,
              status: 'REJECTED' as const,
              reviewedBy: this.auth.user()?.name,
              reviewedAt: new Date().toISOString(),
            }
          : r,
      ),
    );
  }

  closeModal() {
    this.showDetailModal.set(false);
    this.selectedRequest.set(null);
  }

  approveAndClose() {
    const req = this.selectedRequest();
    if (req) this.approveRequest(req);
    this.closeModal();
  }

  rejectAndClose() {
    const req = this.selectedRequest();
    if (req) this.rejectRequest(req);
    this.closeModal();
  }

  getUnitLabel(unit: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      nukleer: 'Nükleer Tıp',
      onkoloji: 'Radyasyon Onkolojisi',
    };
    return labels[unit] || unit;
  }

  getLeaveTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      ANNUAL: 'Yıllık',
      SICK: 'Hastalık',
      UNPAID: 'Ücretsiz',
      MATERNITY: 'Doğum',
      PATERNITY: 'Baba',
      COMPASSIONATE: 'Mazeret',
    };
    return labels[type] || type;
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PENDING: 'Bekliyor',
      APPROVED: 'Onaylandı',
      REJECTED: 'Reddedildi',
    };
    return labels[status] || status;
  }

  formatDateRange(start: string, end: string): string {
    const s = new Date(start).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
    const e = new Date(end).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    return `${s} - ${e}`;
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
