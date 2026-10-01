import {
  Component,
  OnInit,
  inject,
  ChangeDetectionStrategy,
  signal,
  type WritableSignal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TooltipModule } from 'primeng/tooltip';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { MessageService } from 'primeng/api';
import { AssetService } from './services/asset.service';
import type { AssetDetail, QRCodeResult } from './models/asset.models';

@Component({
  selector: 'app-asset-detail',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    RouterModule,
    CardModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ProgressSpinnerModule,
    TooltipModule,
    TableModule,
    TabsModule,
  ],
  providers: [MessageService],
  template: `
    <p-toast></p-toast>

    <div class="page-header">
      <button class="back-btn" (click)="goBack()">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
        >
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
        Cihaz Listesi
      </button>
      <div class="header-actions">
        <p-button
          icon="pi pi-qrcode"
          label="QR Oluştur"
          severity="info"
          (onClick)="generateQR()"
          [loading]="qrGenerating()"
        ></p-button>
        <p-button icon="pi pi-pencil" label="Düzenle" (onClick)="onEdit()"></p-button>
      </div>
    </div>

    @if (qrResult(); as qr) {
      <p-card styleClass="qr-card">
        <div class="qr-display">
          <div class="qr-info">
            <strong>QR Kod:</strong> <code>{{ qr.qrCode }}</code>
            <p-button
              icon="pi pi-clone"
              severity="info"
              [text]="true"
              [rounded]="true"
              pTooltip="Kopyala"
              (onClick)="copyQR(qr.qrCode)"
            ></p-button>
          </div>
        </div>
      </p-card>
    }

    @if (isLoading()) {
      <div class="loading"><p-progressSpinner></p-progressSpinner></div>
    }

    @if (asset(); as a) {
      <div class="asset-header">
        <div class="asset-title">
          <h2>{{ a.name }}</h2>
          <span class="asset-number">{{ a.assetNumber }}</span>
          <p-tag
            [value]="getStatusLabel(a.status)"
            [severity]="getStatusSeverity(a.status)"
          ></p-tag>
        </div>
      </div>

      <p-tabs [value]="activeTab()" (onValueChange)="onTabChange($event)">
        <p-tablist>
          <p-tab value="info">Bilgiler</p-tab>
          <p-tab value="maintenance">Bakım ({{ a.maintenanceRecords.length || 0 }})</p-tab>
          <p-tab value="calibration">Kalibrasyon ({{ a.calibrationRecords.length || 0 }})</p-tab>
          <p-tab value="lifecycle">Yaşam Döngüsü ({{ a.lifecycleEvents.length || 0 }})</p-tab>
          <p-tab value="documents">Dökümanlar ({{ a.documents.length || 0 }})</p-tab>
          <p-tab value="contracts"
            >Servis Sözleşmeleri ({{ a.serviceContracts.length || 0 }})</p-tab
          >
          <p-tab value="movements">Taşımalar</p-tab>
        </p-tablist>

        <p-tabpanel value="info">
          <div class="detail-grid">
            <p-card header="Genel Bilgiler">
              <div class="detail-row">
                <span>Üretici</span><span>{{ a.manufacturer || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Model</span><span>{{ a.model || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Seri No</span><span>{{ a.serialNumber || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Marka</span><span>{{ a.brand || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Kategori</span><span>{{ getCategoryLabel(a.category) }}</span>
              </div>
              <div class="detail-row">
                <span>Üretim Yılı</span><span>{{ a.yearOfManufacture || '-' }}</span>
              </div>
            </p-card>
            <p-card header="Konum">
              <div class="detail-row">
                <span>Bölüm</span><span>{{ a.department?.name || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Birim</span><span>{{ a.unit?.name || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Blok</span><span>{{ a.block || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Kat</span><span>{{ a.floor || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Oda</span><span>{{ a.room?.name || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Hastane</span><span>{{ a.hospital?.name || '-' }}</span>
              </div>
            </p-card>
            <p-card header="Finans & Tedarik">
              <div class="detail-row">
                <span>Tedarikçi</span><span>{{ a.supplier?.name || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Sözleşme No</span><span>{{ a.contractNumber || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Fatura No</span><span>{{ a.invoiceNumber || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Satın Alma No</span><span>{{ a.purchaseOrderNumber || '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Satın Alma Maliyeti</span
                ><span>{{ a.purchaseCost ? (a.purchaseCost | currency: 'TRY' : '₺') : '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Güncel Değer</span
                ><span>{{ a.currentValue ? (a.currentValue | currency: 'TRY' : '₺') : '-' }}</span>
              </div>
            </p-card>
            <p-card header="Garanti">
              <div class="detail-row">
                <span>Başlangıç</span
                ><span>{{ a.warrantyStart ? (a.warrantyStart | date: 'dd.MM.yyyy') : '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Bitiş</span
                ><span>{{ a.warrantyEnd ? (a.warrantyEnd | date: 'dd.MM.yyyy') : '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Beklenen Ömür</span
                ><span>{{ a.expectedLifetimeYears ? a.expectedLifetimeYears + ' yıl' : '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Garanti Süresi</span><span>{{ getWarrantyStatusLabel(a) }}</span>
              </div>
            </p-card>
            <p-card header="Kabul & Devreye Alma">
              <div class="detail-row">
                <span>Kurulum</span
                ><span>{{
                  a.installationDate ? (a.installationDate | date: 'dd.MM.yyyy') : '-'
                }}</span>
              </div>
              <div class="detail-row">
                <span>Kabul</span
                ><span>{{ a.acceptanceDate ? (a.acceptanceDate | date: 'dd.MM.yyyy') : '-' }}</span>
              </div>
              <div class="detail-row">
                <span>Devreye Alma</span
                ><span>{{
                  a.commissioningDate ? (a.commissioningDate | date: 'dd.MM.yyyy') : '-'
                }}</span>
              </div>
            </p-card>
            <p-card header="Bağlı Vardiya Cihazı">
              @if (a.device) {
                <div class="detail-row">
                  <span>Kod</span><span>{{ a.device.code }}</span>
                </div>
                <div class="detail-row">
                  <span>Ad</span><span>{{ a.device.name }}</span>
                </div>
              } @else {
                <div class="detail-row"><span>Bağlı cihaz yok</span><span>-</span></div>
              }
            </p-card>
          </div>
        </p-tabpanel>

        <p-tabpanel value="maintenance">
          @if (a.maintenanceRecords.length) {
            <p-table [value]="a.maintenanceRecords" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>Tür</th>
                  <th>Başlık</th>
                  <th>Durum</th>
                  <th>Öncelik</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>Maliyet</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-r>
                <tr>
                  <td>{{ r.type }}</td>
                  <td>{{ r.title }}</td>
                  <td>
                    <p-tag
                      [value]="r.status"
                      [severity]="
                        r.status === 'completed'
                          ? 'success'
                          : r.status === 'in_progress'
                            ? 'info'
                            : 'warn'
                      "
                    ></p-tag>
                  </td>
                  <td>{{ r.priority }}</td>
                  <td>{{ r.startDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ r.endDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ r.cost ? (r.cost | currency: 'TRY' : '₺') : '-' }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Bakım kaydı bulunamadı.</p>
          }
        </p-tabpanel>

        <p-tabpanel value="calibration">
          @if (a.calibrationRecords.length) {
            <p-table [value]="a.calibrationRecords" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>No</th>
                  <th>Tür</th>
                  <th>Durum</th>
                  <th>Planlanan</th>
                  <th>Tamamlanan</th>
                  <th>Sertifika</th>
                  <th>Bir Sonraki</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-r>
                <tr>
                  <td>{{ r.calibrationNumber }}</td>
                  <td>{{ r.type }}</td>
                  <td>
                    <p-tag
                      [value]="r.status"
                      [severity]="
                        r.status === 'completed'
                          ? 'success'
                          : r.status === 'in_progress'
                            ? 'info'
                            : 'warn'
                      "
                    ></p-tag>
                  </td>
                  <td>{{ r.scheduledDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ r.completedDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ r.certificateRef || '-' }}</td>
                  <td>{{ r.nextCalibrationDate | date: 'dd.MM.yyyy' }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Kalibrasyon kaydı bulunamadı.</p>
          }
        </p-tabpanel>

        <p-tabpanel value="lifecycle">
          @if (a.lifecycleEvents.length) {
            <p-table [value]="a.lifecycleEvents" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>Olay</th>
                  <th>Tarih</th>
                  <th>Başlık</th>
                  <th>Açıklama</th>
                  <th>Referans</th>
                  <th>Konum</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-r>
                <tr>
                  <td><p-tag [value]="r.eventType"></p-tag></td>
                  <td>{{ r.eventDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ r.title }}</td>
                  <td>{{ r.description || '-' }}</td>
                  <td>{{ r.referenceNumber || '-' }}</td>
                  <td>{{ (r.locationFrom || '') + (r.locationTo ? ' → ' + r.locationTo : '') }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Yaşam döngüsü kaydı bulunamadı.</p>
          }
        </p-tabpanel>

        <p-tabpanel value="documents">
          @if (a.documents.length) {
            <p-table [value]="a.documents" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>Tür</th>
                  <th>Başlık</th>
                  <th>Açıklama</th>
                  <th>Dosya</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-d>
                <tr>
                  <td><p-tag [value]="d.type"></p-tag></td>
                  <td>{{ d.title }}</td>
                  <td>{{ d.description || '-' }}</td>
                  <td>
                    <a [href]="d.fileUrl" target="_blank">{{ d.fileUrl }}</a>
                  </td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Döküman bulunamadı.</p>
          }
        </p-tabpanel>

        <p-tabpanel value="contracts">
          @if (a.serviceContracts.length) {
            <p-table [value]="a.serviceContracts" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>Sözleşme No</th>
                  <th>Tür</th>
                  <th>Başlangıç</th>
                  <th>Bitiş</th>
                  <th>Durum</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-c>
                <tr>
                  <td>{{ c.contractNumber }}</td>
                  <td>{{ c.type }}</td>
                  <td>{{ c.startDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ c.endDate | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ c.status }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Servis sözleşmesi bulunamadı.</p>
          }
        </p-tabpanel>

        <p-tabpanel value="movements">
          @if (a.movements.length) {
            <p-table [value]="a.movements" [tableStyle]="{ 'min-width': '50rem' }">
              <ng-template pTemplate="header">
                <tr>
                  <th>Tarih</th>
                  <th>Kaynak</th>
                  <th>Hedef</th>
                  <th>Sebep</th>
                  <th>Not</th>
                </tr>
              </ng-template>
              <ng-template pTemplate="body" let-m>
                <tr>
                  <td>{{ m.movedAt | date: 'dd.MM.yyyy' }}</td>
                  <td>{{ m.fromLocation || '-' }}</td>
                  <td>{{ m.toLocation }}</td>
                  <td>{{ m.reason }}</td>
                  <td>{{ m.notes || '-' }}</td>
                </tr>
              </ng-template>
            </p-table>
          } @else {
            <p>Taşıma kaydı bulunamadı.</p>
          }
        </p-tabpanel>
      </p-tabs>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        padding: 1.25rem;
      }

      .page-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 1rem;
      }

      .back-btn {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        background: none;
        border: none;
        color: var(--text-color);
        cursor: pointer;
        font-size: 0.9rem;
        opacity: 0.7;
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .back-btn:hover {
        opacity: 1;
        background: var(--surface-hover);
      }

      .header-actions {
        display: flex;
        gap: 0.5rem;
      }

      .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 300px;
      }

      .asset-header {
        margin-bottom: 1.5rem;
      }

      .asset-title {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex-wrap: wrap;
      }

      .asset-title h2 {
        font-size: 1.5rem;
        font-weight: 600;
        margin: 0;
      }

      .asset-number {
        font-size: 0.9rem;
        opacity: 0.6;
        font-family: monospace;
      }

      .detail-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
        gap: 1rem;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--surface-border);
        font-size: 0.9rem;
      }

      .detail-row:last-child {
        border-bottom: none;
      }

      .detail-row span:first-child {
        opacity: 0.7;
      }

      .detail-row span:last-child {
        font-weight: 500;
        text-align: right;
      }

      .qr-card {
        margin-bottom: 1rem;
      }

      .qr-display {
        display: flex;
        align-items: center;
        gap: 0.75rem;
      }

      .qr-info {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
      }

      .qr-info code {
        background: var(--surface-ground);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-family: monospace;
      }
    `,
  ],
})
export class AssetDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly assetService = inject(AssetService);
  private readonly messageService = inject(MessageService);

  readonly asset = this.assetService.selectedAsset;
  readonly isLoading = this.assetService.isLoading;
  readonly qrResult = this.assetService.qrResult;
  readonly qrGenerating = signal(false);
  readonly activeTab = signal<string>('info');

  onTabChange(event: any): void {
    this.activeTab.set(typeof event === 'string' ? event : event?.value || 'info');
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadAsset(id);
    }
  }

  loadAsset(id: string): void {
    this.assetService.getAssetDetail(id).subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Cihaz detayı yüklenemedi',
          life: 3000,
        }),
    });
  }

  generateQR(): void {
    const a = this.asset();
    if (!a) return;
    this.qrGenerating.set(true);
    this.assetService.generateQR(a.id).subscribe({
      next: () =>
        this.messageService.add({
          severity: 'success',
          summary: 'Başarılı',
          detail: 'QR kod oluşturuldu',
          life: 3000,
        }),
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'QR kod oluşturulamadı',
          life: 3000,
        }),
      complete: () => this.qrGenerating.set(false),
    });
  }

  copyQR(qrCode: string): void {
    navigator.clipboard.writeText(qrCode).then(() => {
      this.messageService.add({
        severity: 'success',
        summary: 'Kopyalandı',
        detail: 'QR kod panoya kopyalandı',
        life: 2000,
      });
    });
  }

  goBack(): void {
    this.router.navigate(['/app/assets']);
  }

  onEdit(): void {
    const a = this.asset();
    if (a) {
      this.messageService.add({
        severity: 'info',
        summary: 'Bilgi',
        detail: `${a.name} düzenleniyor`,
        life: 3000,
      });
    }
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

  getWarrantyStatusLabel(a: any): string {
    if (!a.warrantyEnd) {
      return 'Garanti Yok';
    }
    const end = new Date(a.warrantyEnd);
    const now = new Date();
    const daysLeft = Math.floor((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft < 0) {
      return 'Süresi Doldu';
    }
    if (daysLeft <= 90) {
      return daysLeft + ' gün kaldı';
    }
    return 'Aktif';
  }
}
