import { Component, OnInit, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { BiomedicalService } from './services/biomedical.service';
import type { MaintenanceRecord } from './models/biomedical.models';

@Component({
  selector: 'app-biomedical',
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
    ProgressSpinnerModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './biomedical.component.html',
  styleUrls: ['./biomedical.component.scss'],
})
export class BiomedicalComponent implements OnInit {
  private readonly biomedicalService = inject(BiomedicalService);
  private readonly messageService = inject(MessageService);

  readonly records = this.biomedicalService.records;
  readonly isLoading = this.biomedicalService.isLoading;

  readonly openCount = computed(() => this.records().filter((r) => r.status === 'open').length);
  readonly inProgressCount = computed(
    () => this.records().filter((r) => r.status === 'in_progress').length,
  );
  readonly completedCount = computed(
    () => this.records().filter((r) => r.status === 'completed').length,
  );

  ngOnInit(): void {
    this.loadMaintenanceList();
  }

  loadMaintenanceList(): void {
    this.biomedicalService.getMaintenanceList().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Bakım kayıtları yüklenemedi',
          life: 3000,
        }),
    });
  }

  getStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'open':
        return 'warn';
      case 'in_progress':
        return 'info';
      case 'completed':
        return 'success';
      case 'cancelled':
        return 'secondary';
      default:
        return 'info';
    }
  }

  getPrioritySeverity(
    priority: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (priority) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'normal':
        return 'info';
      case 'low':
        return 'success';
      default:
        return 'info';
    }
  }

  onCreate(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni bakım emri oluşturulacak',
      life: 3000,
    });
  }

  onEdit(record: MaintenanceRecord): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: `${record.title} düzenleniyor`,
      life: 3000,
    });
  }
}
