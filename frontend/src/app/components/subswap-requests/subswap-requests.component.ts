import { Component, OnInit, OnDestroy, signal, inject, ChangeDetectionStrategy } from '@angular/core';
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
        <div class="loading"><p-progressSpinner></p-progressSpinner></div>
      }

      <p-card>
        <div class="table-responsive scroll-container">
        <p-table [value]="requests()" styleClass="p-datatable-sm">
          <ng-template #header>
            <tr>
              <th>Tarih</th>
              <th>Vardiya</th>
              <th>Talep Eden</th>
              <th>Hedef</th>
              <th>Sebep</th>
              <th>Durum</th>
              @if (isAdmin()) {
                <th>İşlem</th>
              }
            </tr>
          </ng-template>
          <ng-template #body let-req>
            <tr>
              <td>{{ req.requesterShift?.date | date:'dd.MM.yyyy' }}</td>
              <td>{{ req.requesterShift?.shift?.name }}</td>
              <td>{{ req.requesterShift?.employee?.name }}</td>
              <td>{{ req.targetShift?.employee?.name || '-' }}</td>
              <td>{{ req.reason || '-' }}</td>
              <td>
                <p-tag [value]="req.status" [severity]="getSeverity(req.status)"></p-tag>
              </td>
              @if (isAdmin() && req.status === 'pending') {
                <td>
                  <div class="action-buttons">
                    <p-button icon="pi pi-check" severity="success" [text]="true" (onClick)="approve(req.id)"></p-button>
                    <p-button icon="pi pi-times" severity="danger" [text]="true" (onClick)="reject(req.id)"></p-button>
                  </div>
                </td>
              }
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="7" class="text-center">Henüz talep yok</td></tr>
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
        <ng-template pTemplate="footer">
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
    .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -1px; }
    .table-responsive .p-datatable-table { min-width: max-content; }
  `]
})
export class SwapRequestsComponent implements OnInit, OnDestroy {
  private swapService = inject(SwapRequestService);
  private scheduleService = inject(ScheduleService);
  private authService = inject(AuthService);
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
      }
    });
  }

  reject(id: string) {
    this.swapService.reject(id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'info', summary: 'Reddedildi', detail: 'Talep reddedildi' });
        this.loadData();
      }
    });
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