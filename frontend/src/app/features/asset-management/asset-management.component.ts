import { Component, OnInit, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CardModule } from 'primeng/card';
import { MessageService } from 'primeng/api';
import { AssetService } from './services/asset.service';
import type { EnterpriseAsset, AssetDashboard } from './models/asset.models';

@Component({
  selector: 'app-asset-management',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    TableModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ProgressSpinnerModule,
    TooltipModule,
    InputTextModule,
    SelectModule,
    CardModule,
  ],
  providers: [MessageService],
  templateUrl: './asset-management.component.html',
  styleUrls: ['./asset-management.component.scss'],
})
export class AssetManagementComponent implements OnInit {
  private readonly assetService = inject(AssetService);
  private readonly messageService = inject(MessageService);
  private readonly router = inject(Router);

  readonly assets = this.assetService.assets;
  readonly dashboard = this.assetService.dashboard;
  readonly isLoading = this.assetService.isLoading;

  readonly searchQuery = signal('');
  readonly selectedCategory = signal<string | null>(null);
  readonly selectedStatus = signal<string | null>(null);

  readonly categoryOptions = [
    { label: 'Tüm Kategoriler', value: null },
    { label: 'MR', value: 'mr' },
    { label: 'BT', value: 'bt' },
    { label: 'Röntgen', value: 'rontgen' },
    { label: 'Ultrason', value: 'ultrason' },
    { label: 'Mamografi', value: 'mamografi' },
    { label: 'Anjiyografi', value: 'anjiyografi' },
    { label: 'Radyoterapi', value: 'radyoterapi' },
    { label: 'Nükleer Tıp', value: 'nukleer_tip' },
    { label: 'Kemik Dansitometre', value: 'kemik_dansitometre' },
    { label: 'Bilgisayar', value: 'bilgisayar' },
    { label: 'Donanım', value: 'ekipman' },
    { label: 'Diğer', value: 'other' },
  ];

  readonly statusOptions = [
    { label: 'Tüm Durumlar', value: null },
    { label: 'Aktif', value: 'active' },
    { label: 'Bakımda', value: 'under_maintenance' },
    { label: 'Arızalı', value: 'fault' },
    { label: 'Hizmet Dışı', value: 'out_of_service' },
    { label: 'Kalibrasyon Gerekli', value: 'calibration_due' },
    { label: 'Garanti Süresi Doldu', value: 'warranty_expired' },
    { label: 'Pasif', value: 'inactive' },
    { label: 'Depoda', value: 'stored' },
    { label: 'Emekli', value: 'retired' },
  ];

  ngOnInit(): void {
    this.loadDashboard();
    this.loadAssets();
  }

  loadDashboard(): void {
    this.assetService.getDashboard().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Dashboard yüklenemedi',
          life: 3000,
        }),
    });
  }

  loadAssets(): void {
    this.assetService
      .getAssets({
        category: this.selectedCategory() || undefined,
        status: this.selectedStatus() || undefined,
        search: this.searchQuery() || undefined,
      })
      .subscribe({
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: 'Hata',
            detail: 'Varlıklar yüklenemedi',
            life: 3000,
          }),
      });
  }

  onSearch(): void {
    this.loadAssets();
  }

  onFilterChange(): void {
    this.loadAssets();
  }

  getStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'active':
        return 'success';
      case 'under_maintenance':
        return 'warn';
      case 'fault':
        return 'danger';
      case 'out_of_service':
        return 'secondary';
      case 'calibration_due':
        return 'warn';
      case 'warranty_expired':
        return 'danger';
      case 'inactive':
        return 'secondary';
      case 'stored':
        return 'info';
      case 'retired':
        return 'contrast';
      default:
        return 'info';
    }
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      active: 'Aktif',
      under_maintenance: 'Bakımda',
      fault: 'Arızalı',
      out_of_service: 'Hizmet Dışı',
      calibration_due: 'Kalibrasyon Gerekli',
      warranty_expired: 'Garanti Süresi Doldu',
      inactive: 'Pasif',
      stored: 'Depoda',
      retired: 'Emekli',
      disposed: 'Atıldı',
    };
    return labels[status] || status;
  }

  getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      mr: 'MR',
      bt: 'BT',
      rontgen: 'Röntgen',
      ultrason: 'Ultrason',
      mamografi: 'Mamografi',
      anjiyografi: 'Anjiyografi',
      radyoterapi: 'Radyoterapi',
      nukleer_tip: 'Nükleer Tıp',
      kemik_dansitometre: 'Kemik Dansitometre',
      bilgisayar: 'Bilgisayar',
      ekipman: 'Ekipman',
      other: 'Diğer',
    };
    return labels[cat] || cat;
  }

  viewDetail(asset: EnterpriseAsset): void {
    this.router.navigate(['/app/assets', asset.id]);
  }

  onCreate(): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: 'Yeni varlık oluşturma formu açılacak',
      life: 3000,
    });
  }

  onEdit(asset: EnterpriseAsset): void {
    this.messageService.add({
      severity: 'info',
      summary: 'Bilgi',
      detail: `${asset.name} düzenleniyor`,
      life: 3000,
    });
  }

  onDelete(asset: EnterpriseAsset): void {
    this.assetService.deleteAsset(asset.id).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Başarılı',
          detail: `${asset.name} silindi`,
          life: 3000,
        });
        this.loadAssets();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Varlık silinemedi',
          life: 3000,
        }),
    });
  }
}
