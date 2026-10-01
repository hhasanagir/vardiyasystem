import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { BadgeModule } from 'primeng/badge';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { SupervisorCenterService } from './services/supervisor-center.service';

@Component({
  selector: 'app-supervisor-center',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CardModule,
    TableModule,
    ButtonModule,
    TagModule,
    BadgeModule,
    TooltipModule,
    ProgressSpinnerModule,
    ToastModule,
  ],
  providers: [MessageService],
  templateUrl: './supervisor-center.component.html',
  styleUrls: ['./supervisor-center.component.scss'],
})
export class SupervisorCenterComponent implements OnInit, OnDestroy {
  private readonly service = inject(SupervisorCenterService);
  private readonly messageService = inject(MessageService);
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  readonly data = this.service.data;
  readonly isLoading = this.service.isLoading;

  readonly kpis = computed(() => this.data()?.kpis ?? null);
  readonly deviceStatusByUnit = computed(() => this.data()?.deviceStatusByUnit ?? []);
  readonly personnelByUnit = computed(() => this.data()?.personnelByUnit ?? []);
  readonly todayRoster = computed(() => this.data()?.todayRoster ?? []);
  readonly recentIncidents = computed(() => this.data()?.recentIncidents ?? []);
  readonly recentAlerts = computed(() => this.data()?.recentAlerts ?? []);
  readonly lowStockAlerts = computed(() => this.data()?.lowStockAlerts ?? []);

  readonly onlinePercent = computed(() => {
    const k = this.kpis();
    if (!k || k.totalDevices === 0) return 0;
    return Math.round((k.devicesOnline / k.totalDevices) * 100);
  });

  ngOnInit(): void {
    this.loadData();
    this.refreshInterval = setInterval(() => this.loadData(), 30000);
  }

  ngOnDestroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
  }

  loadData(): void {
    this.service.loadDashboard().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Süpervizör Merkezi verileri yüklenemedi',
          life: 3000,
        }),
    });
  }

  readonly unitColors: Record<string, string> = {
    mr: '#3b82f6',
    bt: '#14b8a6',
    rontgen: '#f97316',
    nukleer: '#22c55e',
    onkoloji: '#ec4899',
    ultrason: '#8b5cf6',
    anjiyo: '#ef4444',
    mamografi: '#f59e0b',
    pet_ct: '#06b6d4',
    linak: '#d946ef',
  };

  getRoleEntries(roles: Record<string, number>): [string, number][] {
    return Object.entries(roles);
  }

  getSeverity(severity: string): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
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

  getStatusSeverity(
    status: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (status) {
      case 'active':
        return 'success';
      case 'open':
        return 'warn';
      case 'in_progress':
        return 'info';
      case 'resolved':
      case 'closed':
        return 'secondary';
      default:
        return 'info';
    }
  }

  getPrioritySeverity(
    priority: string,
  ): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' {
    switch (priority) {
      case 'CRITICAL':
        return 'danger';
      case 'HIGH':
        return 'warn';
      case 'NORMAL':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'info';
    }
  }

  getStockSeverity(current: number, min: number): 'success' | 'warn' | 'danger' {
    if (current <= 0) return 'danger';
    if (current < min * 0.5) return 'danger';
    if (current < min) return 'warn';
    return 'success';
  }

  getStockPercent(current: number, min: number): number {
    if (min === 0) return 100;
    return Math.min(100, Math.round((current / min) * 100));
  }
}
