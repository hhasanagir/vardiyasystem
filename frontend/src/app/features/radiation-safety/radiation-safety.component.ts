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
import { RadiationSafetyService } from './services/radiation-safety.service';

@Component({
  selector: 'app-radiation-safety',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule, FormsModule,
    TabsModule, TableModule, ButtonModule, TagModule,
    ToastModule, ProgressSpinnerModule, TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './radiation-safety.component.html',
  styleUrls: ['./radiation-safety.component.scss'],
})
export class RadiationSafetyComponent implements OnInit {
  private readonly radiationService = inject(RadiationSafetyService);
  private readonly messageService = inject(MessageService);

  readonly dosimeters = this.radiationService.dosimeters;
  readonly measurements = this.radiationService.measurements;
  readonly areas = this.radiationService.areas;
  readonly isLoading = this.radiationService.isLoading;

  readonly activeTab = signal<string>('dosimeters');

  onTabChange(event: any): void {
    this.activeTab.set(typeof event === 'string' ? event : event?.value || 'dosimeters');
  }

  ngOnInit(): void {
    this.loadDosimeters();
    this.loadMeasurements();
    this.loadAreas();
  }

  loadDosimeters(): void {
    this.radiationService.getDosimeters().subscribe({
      error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Dozimetreler yüklenemedi', life: 3000 }),
    });
  }

  loadMeasurements(): void {
    this.radiationService.getMeasurements().subscribe({
      error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Ölçümler yüklenemedi', life: 3000 }),
    });
  }

  loadAreas(): void {
    this.radiationService.getAreas().subscribe({
      error: () => this.messageService.add({ severity: 'error', summary: 'Hata', detail: 'Alanlar yüklenemedi', life: 3000 }),
    });
  }

  getDosimeterStatusSeverity(status: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'active': return 'success';
      case 'calibration_due': return 'warn';
      case 'expired': return 'danger';
      case 'inactive': return 'secondary';
      default: return 'info';
    }
  }

  getAreaStatusSeverity(status: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'safe': return 'success';
      case 'caution': return 'warn';
      case 'danger': return 'danger';
      case 'restricted': return 'secondary';
      default: return 'info';
    }
  }

  getDoseSeverity(current: number, max: number): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    const ratio = current / max;
    if (ratio >= 0.9) return 'danger';
    if (ratio >= 0.7) return 'warn';
    return 'success';
  }
}
