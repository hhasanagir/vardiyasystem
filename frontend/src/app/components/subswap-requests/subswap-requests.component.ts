import { Component, OnInit, OnDestroy, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SwapRequestService } from '../../services/swap-request.service';
import { ScheduleService } from '../../services/schedule.service';
import { Employee } from '../../domain/models';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../services/auth.service';
import { AuthorizationService } from '../../services/authorization.service';
import { translateAssignmentErrorPayload } from '../../core/utils/assignment-errors';

@Component({
  selector: 'app-swap-requests',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    DialogModule,
    SelectModule,
    ProgressSpinnerModule
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>
    
    <div class="swap-requests-container">
      <div class="header">
        <h1>Vardiya Değişim Talepleri</h1>
        <p-button label="Yeni Talep" icon="pi pi-plus" (onClick)="showDialog = true"></p-button>
      </div>

      @if (isLoading()) {
        <div class="loading"><p-progress-spinner></p-progress-spinner></div>
      }

      <p-card>
        <div class="table-responsive scroll-container">
        <p-table [value]="filteredRequests()" styleClass="p-datatable-sm">
          <ng-template #header>
            <tr>
              <th>Tarih</th>
              <th>Vardiya</th>
              <th>Talep Eden</th>
              <th>Hedef</th>
              <th>Birim</th>
              <th>Kurum</th>
              <th>Sebep</th>
              <th>Durum</th>
              <th>İşlem</th>
            </tr>
          </ng-template>
          <ng-template #body let-req>
            <tr>
              <td>{{ req.requesterShift?.date | date:'dd.MM.yyyy' }}</td>
              <td>{{ req.requesterShift?.shift?.name }}</td>
              <td>{{ req.requesterShift?.employee?.name }}</td>
              <td>{{ req.targetShift?.employee?.name || '-' }}</td>
              <td>{{ req.unitId || req.requesterShift?.unitId || '-' }}</td>
              <td>{{ req.organizationId || req.requesterShift?.organizationId || '-' }}</td>
              <td>{{ req.reason || '-' }}</td>
              <td>
                <p-tag [value]="req.status" [severity]="getSeverity(req.status)"></p-tag>
              </td>
              <td>
                @if (req.status === 'pending' && isActionable(req)) {
                  <div class="action-buttons">
                    <p-button icon="pi pi-check" severity="success" [text]="true" title="Onayla" (onClick)="approve(req.id)"></p-button>
                    <p-button icon="pi pi-times" severity="danger" [text]="true" title="Reddet" (onClick)="reject(req.id)"></p-button>
                  </div>
                } @else {
                  <span class="text-muted">—</span>
                }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="9" class="text-center">Henüz talep yok</td></tr>
          </ng-template>
        </p-table>
        </div>
      </p-card>

      <p-dialog header="Vardiya Değişim Talebi" [(visible)]="showDialog" [modal]="true" [style]="{width: 'min(90vw, 400px)'}">
        <div class="form-group">
          <label>Değiştirilecek Vardiya</label>
          <p-select 
            [options]="availableShifts()" 
            [(ngModel)]="selectedShiftId" 
            optionLabel="label" 
            optionValue="value"
            placeholder="Vardiya seçin"
            styleClass="w-full">
          </p-select>
        </div>
        <div class="form-group">
          <label>Hedef Çalışan (Opsiyonel)</label>
          <p-select 
            [options]="employees()" 
            [(ngModel)]="targetEmployeeId" 
            optionLabel="name" 
            optionValue="id"
            placeholder="Çalışan seçin"
            [showClear]="true"
            styleClass="w-full">
          </p-select>
        </div>
        <div class="form-group">
          <label>Sebep</label>
          <input pInputText [(ngModel)]="reason" class="w-full" />
        </div>
        <ng-template #footer>
          <p-button label="İptal" [text]="true" (onClick)="showDialog = false"></p-button>
          <p-button label="Gönder" (onClick)="submitRequest()" [loading]="isSubmitting()"></p-button>
        </ng-template>
      </p-dialog>
    </div>
  `,
  styles: [`
    .swap-requests-container { padding: 1rem; }
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;
      h1 { margin: 0; color: #1e293b; }
    }
    .loading { display: flex; justify-content: center; padding: 2rem; }
    .action-buttons { display: flex; gap: 0.5rem; }
    .form-group { margin-bottom: 1rem;
      label { display: block; margin-bottom: 0.5rem; font-weight: 500; color: #374151; }
    }
    .w-full { width: 100%; }
    .text-center { text-align: center; }
    .text-muted { color: #94a3b8; }
    .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -1px; }
    .table-responsive .p-datatable-table { min-width: max-content; }
  `]
})
export class SwapRequestsComponent implements OnInit, OnDestroy {
  private swapService = inject(SwapRequestService);
  private scheduleService = inject(ScheduleService);
  private authService = inject(AuthService);
  private authz = inject(AuthorizationService);
  private messageService = inject(MessageService);
  private destroy$ = new Subject<void>();

  requests = signal<any[]>([]);
  employees = signal<Employee[]>([]);
  availableShifts = signal<any[]>([]);
  isLoading = signal(false);
  isSubmitting = signal(false);
  showDialog = false;

  selectedShiftId = '';
  targetEmployeeId = '';
  reason = '';

  ngOnInit() {
    this.loadData();
  }

  isAdmin() {
    return this.authService.isAdmin();
  }

  /**
   * Whether the current actor may action this swap request.
   * SUPERVISOR+ → any request in their organization (backend enforces org).
   * FIELD_SUPERVISOR → only their own unit (defense-in-depth; backend enforces).
   */
  isActionable(req: any): boolean {
    if (this.authz.isFieldSupervisor()) {
      const ownUnit = this.authz.getScopedUnit();
      if (!ownUnit) return false;
      const reqUnit = req?.unitId || req?.requesterShift?.unitId;
      return !!reqUnit && reqUnit === ownUnit;
    }
    return this.authz.isSupervisor() || this.isAdmin();
  }

  readonly filteredRequests = computed(() => {
    const list = this.requests();
    if (!this.authz.isFieldSupervisor()) return list;
    const ownUnit = this.authz.getScopedUnit();
    if (!ownUnit) return [];
    return list.filter(req => (req?.unitId || req?.requesterShift?.unitId) === ownUnit);
  });

  loadData() {
    this.isLoading.set(true);
    Promise.all([
      this.swapService.getAll().toPromise(),
      this.scheduleService.getAllEmployees().toPromise(),
      this.scheduleService.getAll().toPromise()
    ]).then(([requests, employees, shifts]) => {
      this.requests.set(requests || []);
      this.employees.set(employees || []);
      this.availableShifts.set((shifts || []).map((s: any) => {
        const dateStr = new Date(s.date).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
        return { label: dateStr + ' - ' + (s.shift?.name || ''), value: s.id };
      }));
      this.isLoading.set(false);
    }).catch(() => this.isLoading.set(false));
  }

  submitRequest() {
    if (!this.selectedShiftId) {
      this.messageService.add({ severity: 'warn', summary: 'Uyarı', detail: 'Vardiya seçin' });
      return;
    }
    this.isSubmitting.set(true);
    this.swapService.create({
      requesterShiftId: this.selectedShiftId,
      targetEmployeeId: this.targetEmployeeId || undefined,
      reason: this.reason || undefined
    }).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Başarılı', detail: 'Talep gönderildi' });
        this.showDialog = false;
        this.loadData();
        this.isSubmitting.set(false);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Talep gönderilemedi' });
        this.isSubmitting.set(false);
      }
    });
  }

  approve(id: string) {
    this.swapService.approve(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Onaylandı', detail: 'Talep onaylandı' });
        this.loadData();
      },
      error: (err: any) => {
        const reason = this.swapErrorReason(err);
        this.messageService.add({ severity: 'error', summary: 'Onay Başarısız', detail: reason });
        this.loadData();
      }
    });
  }

  reject(id: string) {
    this.swapService.reject(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'info', summary: 'Reddedildi', detail: 'Talep reddedildi' });
        this.loadData();
      },
      error: (err: any) => {
        const reason = this.swapErrorReason(err);
        this.messageService.add({ severity: 'error', summary: 'Red İşlemi Başarısız', detail: reason });
        this.loadData();
      }
    });
  }

  private swapErrorReason(err: any): string {
    const body = err?.error && typeof err?.error === 'object' ? err.error : null;
    const payload = {
      message: body?.message || err?.message,
      violations: body?.violations || err?.violations
    };
    return translateAssignmentErrorPayload(payload)?.message ||
      body?.message ||
      err?.message ||
      'İşlem gerçekleştirilemedi.';
  }

  getSeverity(status: string): 'success' | 'warn' | 'danger' {
    if (status === 'approved') return 'success';
    if (status === 'rejected') return 'danger';
    return 'warn';
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}