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
import { ContractsService } from './services/contracts.service';
import type { ServiceContract } from './models/contract.models';

@Component({
  selector: 'app-contracts',
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
  templateUrl: './contracts.component.html',
  styleUrls: ['./contracts.component.scss'],
})
export class ContractsComponent implements OnInit {
  private readonly contractsService = inject(ContractsService);
  private readonly messageService = inject(MessageService);

  readonly contracts = this.contractsService.contracts;
  readonly isLoading = this.contractsService.isLoading;

  readonly activeCount = computed(
    () => this.contracts().filter((c) => c.status === 'active').length,
  );
  readonly expiringCount = computed(
    () => this.contracts().filter((c) => this.isExpiringSoon(c)).length,
  );
  readonly expiredCount = computed(
    () => this.contracts().filter((c) => c.status === 'expired').length,
  );

  ngOnInit(): void {
    this.loadContracts();
  }

  loadContracts(): void {
    this.contractsService.getContracts().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Sözleşmeler yüklenemedi',
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
      case 'pending':
        return 'warn';
      case 'expired':
        return 'danger';
      case 'terminated':
        return 'secondary';
      default:
        return 'info';
    }
  }

  isExpiringSoon(contract: ServiceContract): boolean {
    if (contract.status !== 'active') return false;
    const endDate = new Date(contract.endDate);
    const now = new Date();
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return endDate.getTime() - now.getTime() <= thirtyDays && endDate.getTime() > now.getTime();
  }

  isExpired(contract: ServiceContract): boolean {
    return new Date(contract.endDate).getTime() < new Date().getTime();
  }

  onCreate(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni sözleşme oluşturulacak',
      life: 3000,
    });
  }

  onEdit(contract: ServiceContract): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: `${contract.title} düzenleniyor`,
      life: 3000,
    });
  }
}
