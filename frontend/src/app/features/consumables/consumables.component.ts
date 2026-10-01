import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  computed,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { ConsumablesService } from './services/consumables.service';
import type { ConsumableStock } from './models/consumable.models';

@Component({
  selector: 'app-consumables',
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
    InputTextModule,
  ],
  providers: [MessageService],
  templateUrl: './consumables.component.html',
  styleUrls: ['./consumables.component.scss'],
})
export class ConsumablesComponent implements OnInit {
  private readonly consumablesService = inject(ConsumablesService);
  private readonly messageService = inject(MessageService);

  readonly stock = this.consumablesService.stock;
  readonly isLoading = this.consumablesService.isLoading;

  readonly lowStockCount = computed(
    () => this.stock().filter((s) => s.quantity <= s.minStock).length,
  );
  readonly normalStockCount = computed(
    () => this.stock().filter((s) => s.quantity > s.minStock && s.quantity < s.maxStock).length,
  );
  readonly highStockCount = computed(
    () => this.stock().filter((s) => s.quantity >= s.maxStock).length,
  );

  ngOnInit(): void {
    this.loadStock();
  }

  loadStock(): void {
    this.consumablesService.getStock().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Stok bilgileri yüklenemedi',
          life: 3000,
        }),
    });
  }

  getStockStatus(item: ConsumableStock): string {
    if (item.quantity <= item.minStock) return 'low';
    if (item.quantity >= item.maxStock) return 'high';
    return 'normal';
  }

  getStockSeverity(
    item: ConsumableStock,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    if (item.quantity <= item.minStock) return 'danger';
    if (item.quantity >= item.maxStock) return 'warn';
    return 'success';
  }

  onCreate(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni sarf malzemesi oluşturulacak',
      life: 3000,
    });
  }
}
