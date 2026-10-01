import { Component, OnInit, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ShiftService } from '../../services/shift.service';
import { Shift } from '../../domain/models';
import { AuthService } from '../../services/auth.service';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

@Component({
  selector: 'app-shifts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    ToastModule,
    CardModule
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>
    <p-card header="Vardiya Tipleri">
      <ng-template pTemplate="header">
        <div class="flex justify-content-end p-3">
          @if (isAdmin()) {
            <p-button label="Yeni Vardiya Ekle" icon="pi pi-plus" (onClick)="showDialog()"></p-button>
          }
        </div>
      </ng-template>

      <div class="table-responsive scroll-container">
      <p-table [value]="shifts()" [paginator]="true" [rows]="10" styleClass="p-datatable-sm">
        <ng-template pTemplate="header">
          <tr>
            <th>Vardiya Adı</th>
            <th>Tip</th>
            <th>Başlangıç</th>
            <th>Bitiş</th>
            <th>Süre</th>
            @if (isAdmin()) {
              <th>İşlemler</th>
            }
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-shift>
          <tr>
            <td>{{ shift.name }}</td>
            <td>
              <span [class]="'shift-type-badge ' + shift.type">
                {{ getShiftTypeName(shift.type) }}
              </span>
            </td>
            <td>{{ shift.startTime }}</td>
            <td>{{ shift.endTime }}</td>
            <td>{{ shift.durationHours }}h</td>
            @if (isAdmin()) {
              <td>
                <p-button icon="pi pi-pencil" [text]="true" (onClick)="editShift(shift)"></p-button>
                <p-button icon="pi pi-trash" [text]="true" severity="danger" (onClick)="deleteShift(shift)"></p-button>
              </td>
            }
          </tr>
        </ng-template>
        </p-table>
        </div>
    </p-card>

    <p-dialog header="{{ editMode ? 'Vardiya Düzenle' : 'Yeni Vardiya' }}" 
              [(visible)]="visible" 
              [modal]="true" 
              [style]="{width: 'min(90vw, 500px)'}">
      <div class="flex flex-column gap-3">
        <div class="flex flex-column gap-2">
          <label>Vardiya Adı</label>
          <input pInputText [(ngModel)]="formData.name" />
        </div>
        <div class="flex flex-column gap-2">
          <label>Tip</label>
          <p-select [options]="shiftTypes" [(ngModel)]="formData.type" optionLabel="label" optionValue="value"></p-select>
        </div>
        <div class="grid">
          <div class="col-6 flex flex-column gap-2">
            <label>Başlangıç Saati</label>
            <input pInputText type="time" [(ngModel)]="formData.startTime" />
          </div>
          <div class="col-6 flex flex-column gap-2">
            <label>Bitiş Saati</label>
            <input pInputText type="time" [(ngModel)]="formData.endTime" />
          </div>
        </div>
        <div class="flex gap-2 mt-3">
          <p-button label="Kaydet" (onClick)="saveShift()"></p-button>
          <p-button label="İptal" [outlined]="true" (onClick)="visible = false"></p-button>
        </div>
      </div>
    </p-dialog>
  `,
  styles: [`
    .shift-type-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    .shift-type-badge.day {
      background-color: #fef3c7;
      color: #92400e;
    }
    .table-responsive { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -1px; }
    .table-responsive .p-datatable-table { min-width: max-content; }
    .shift-type-badge.night {
      background-color: #e0e7ff;
      color: #3730a3;
    }
    .shift-type-badge.evening {
      background-color: #fce7f3;
      color: #9d174d;
    }
  `]
})
export class ShiftsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  shifts = signal<Shift[]>([]);
  visible = false;
  editMode = false;
  editId = '';
  
  formData = {
    name: '',
    type: 'day' as 'day' | 'night' | 'evening',
    startTime: '09:00',
    endTime: '17:00'
  };

  shiftTypes = [
    { label: 'Gündüz', value: 'day' },
    { label: 'Gece', value: 'night' },
    { label: 'Akşam', value: 'evening' }
  ];

  constructor(
    private shiftService: ShiftService,
    private authService: AuthService,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadShifts();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  loadShifts(): void {
    this.shiftService.getAll().pipe(takeUntil(this.destroy$)).subscribe({
      next: (data) => this.shifts.set(data),
      error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Vardiyalar yüklenemedi' })
    });
  }

  getShiftTypeName(type: string): string {
    const found = this.shiftTypes.find(t => t.value === type);
    return found?.label || type;
  }

  showDialog(): void {
    this.editMode = false;
    this.formData = { name: '', type: 'day', startTime: '09:00', endTime: '17:00' };
    this.visible = true;
  }

  editShift(shift: Shift): void {
    this.editMode = true;
    this.editId = shift.id;
    this.formData = {
      name: shift.name,
      type: shift.type,
      startTime: shift.startTime,
      endTime: shift.endTime
    };
    this.visible = true;
  }

  saveShift(): void {
    if (!this.formData.name || !this.formData.startTime || !this.formData.endTime) {
      this.messageService.add({ severity: 'warn', summary: 'Uyarı', detail: 'Tüm alanları doldurun' });
      return;
    }

    if (this.editMode) {
      this.shiftService.update(this.editId, this.formData).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Başarılı', detail: 'Vardiya güncellendi' });
          this.visible = false;
          this.loadShifts();
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Güncelleme başarısız' })
      });
    } else {
      this.shiftService.create(this.formData).pipe(takeUntil(this.destroy$)).subscribe({
        next: () => {
          this.messageService.add({ severity: 'success', summary: 'Başarılı', detail: 'Vardiya eklendi' });
          this.visible = false;
          this.loadShifts();
        },
        error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Ekleme başarısız' })
      });
    }
  }

  deleteShift(shift: Shift): void {
    this.shiftService.delete(shift.id).pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.messageService.add({ severity: 'success', summary: 'Başarılı', detail: 'Vardiya silindi' });
        this.loadShifts();
      },
      error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Silme başarısız' })
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}