import { Component, OnInit, inject, ChangeDetectionStrategy, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { QualityService } from './services/quality.service';
import type { QualityRecord } from './models/quality.models';

@Component({
  selector: 'app-quality',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    CardModule,
    ProgressSpinnerModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './quality.component.html',
  styleUrls: ['./quality.component.scss'],
})
export class QualityComponent implements OnInit {
  private readonly qualityService = inject(QualityService);
  private readonly messageService = inject(MessageService);

  readonly records = this.qualityService.records;
  readonly isLoading = this.qualityService.isLoading;

  readonly openCount = computed(() => this.records().filter((r) => r.status === 'open').length);
  readonly inProgressCount = computed(
    () => this.records().filter((r) => r.status === 'in_progress').length,
  );
  readonly closedCount = computed(() => this.records().filter((r) => r.status === 'closed').length);

  ngOnInit(): void {
    this.loadRecords();
  }

  loadRecords(): void {
    this.qualityService.getRecords().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Kalite kayıtları yüklenemedi',
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
      case 'closed':
        return 'success';
      case 'cancelled':
        return 'secondary';
      default:
        return 'info';
    }
  }

  getSeveritySeverity(
    severity: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (severity) {
      case 'critical':
        return 'danger';
      case 'high':
        return 'warn';
      case 'medium':
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
      detail: 'Yeni kalite kaydı oluşturulacak',
      life: 3000,
    });
  }

  onEdit(record: QualityRecord): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: `${record.title} düzenleniyor`,
      life: 3000,
    });
  }
}
