import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { MessageService } from 'primeng/api';
import { SuppliersService } from './services/suppliers.service';
import type { Supplier } from './models/supplier.models';

@Component({
  selector: 'app-suppliers',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ProgressSpinnerModule,
    TooltipModule,
    InputTextModule,
  ],
  providers: [MessageService],
  templateUrl: './suppliers.component.html',
  styleUrls: ['./suppliers.component.scss'],
})
export class SuppliersComponent implements OnInit {
  private readonly suppliersService = inject(SuppliersService);
  private readonly messageService = inject(MessageService);

  readonly suppliers = this.suppliersService.suppliers;
  readonly isLoading = this.suppliersService.isLoading;

  ngOnInit(): void {
    this.loadSuppliers();
  }

  loadSuppliers(): void {
    this.suppliersService.getSuppliers().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Tedarikçiler yüklenemedi',
          life: 3000,
        }),
    });
  }

  getStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'active':
        return 'success';
      case 'inactive':
        return 'secondary';
      case 'suspended':
        return 'danger';
      case 'pending':
        return 'warn';
      default:
        return 'info';
    }
  }

  onCreate(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni tedarikçi oluşturulacak',
      life: 3000,
    });
  }

  onEdit(supplier: Supplier): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: `${supplier.name} düzenleniyor`,
      life: 3000,
    });
  }
}
