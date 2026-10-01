import { Component, OnInit, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ProcurementService } from './services/procurement.service';

@Component({
  selector: 'app-procurement',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TabsModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ProgressSpinnerModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './procurement.component.html',
  styleUrls: ['./procurement.component.scss'],
})
export class ProcurementComponent implements OnInit {
  private readonly procurementService = inject(ProcurementService);
  private readonly messageService = inject(MessageService);

  readonly requests = this.procurementService.requests;
  readonly orders = this.procurementService.orders;
  readonly isLoading = this.procurementService.isLoading;

  readonly activeTab = signal(0);

  ngOnInit(): void {
    this.loadRequests();
    this.loadOrders();
  }

  loadRequests(): void {
    this.procurementService.getRequests().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Talepler yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadOrders(): void {
    this.procurementService.getOrders().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Siparişler yüklenemedi',
          life: 3000,
        }),
    });
  }

  getStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'pending':
        return 'warn';
      case 'approved':
        return 'info';
      case 'ordered':
        return 'info';
      case 'delivered':
        return 'success';
      case 'rejected':
        return 'danger';
      case 'cancelled':
        return 'secondary';
      default:
        return 'info';
    }
  }

  onCreateRequest(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni talep oluşturulacak',
      life: 3000,
    });
  }

  onCreateOrder(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni sipariş oluşturulacak',
      life: 3000,
    });
  }
}
