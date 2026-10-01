import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TabsModule } from 'primeng/tabs';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { InventoryService } from './services/inventory.service';

@Component({
  selector: 'app-inventory',
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
    CardModule,
    ProgressSpinnerModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './inventory.component.html',
  styleUrls: ['./inventory.component.scss'],
})
export class InventoryComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);
  private readonly messageService = inject(MessageService);

  readonly stock = this.inventoryService.stock;
  readonly transfers = this.inventoryService.transfers;
  readonly consumptions = this.inventoryService.consumptions;
  readonly counts = this.inventoryService.counts;
  readonly waste = this.inventoryService.waste;
  readonly alerts = this.inventoryService.alerts;
  readonly isLoading = this.inventoryService.isLoading;

  readonly activeTab = signal<string>('0');

  readonly totalStockItems = computed(() => this.stock().length);
  readonly pendingTransfers = computed(
    () => this.transfers().filter((t) => t.status === 'pending').length,
  );
  readonly unresolvedAlerts = computed(() => this.alerts().filter((a) => !a.isResolved).length);
  readonly totalCounts = computed(() => this.counts().length);

  ngOnInit(): void {
    this.loadAll();
  }

  loadAll(): void {
    this.loadStock();
    this.loadTransfers();
    this.loadConsumptions();
    this.loadCounts();
    this.loadWaste();
    this.loadAlerts();
  }

  loadStock(): void {
    this.inventoryService.getStock().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Stok bilgileri yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadTransfers(): void {
    this.inventoryService.getTransfers().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Transferler yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadConsumptions(): void {
    this.inventoryService.getConsumptions().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Tüketim kayıtları yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadCounts(): void {
    this.inventoryService.getCounts().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Sayaç verileri yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadWaste(): void {
    this.inventoryService.getWaste().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Atık kayıtları yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadAlerts(): void {
    this.inventoryService.getAlerts().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Uyarılar yüklenemedi',
          life: 3000,
        }),
    });
  }

  resolveAlert(alertId: string): void {
    this.inventoryService.resolveAlert(alertId, 'current-user').subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Başarılı',
          detail: 'Uyarı çözüldü',
          life: 3000,
        });
        this.loadAlerts();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Uyarı çözülemedi',
          life: 3000,
        }),
    });
  }

  getStockSeverity(
    quantity: number,
    minStock: number,
    maxStock: number,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    if (quantity <= minStock) return 'danger';
    if (quantity <= minStock * 1.2) return 'warn';
    if (quantity >= maxStock) return 'info';
    return 'success';
  }

  getTransferStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_transit':
        return 'info';
      case 'pending':
        return 'warn';
      case 'cancelled':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  getCountStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'completed':
        return 'success';
      case 'in_progress':
        return 'info';
      case 'pending':
        return 'warn';
      case 'discrepancy':
        return 'danger';
      default:
        return 'secondary';
    }
  }

  getAlertSeverity(
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
        return 'secondary';
      default:
        return 'info';
    }
  }
}
