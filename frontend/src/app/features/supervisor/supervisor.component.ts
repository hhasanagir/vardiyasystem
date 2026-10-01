import { Component, OnInit, inject, ChangeDetectionStrategy, computed } from '@angular/core';
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
import { SupervisorService } from './services/supervisor.service';

@Component({
  selector: 'app-supervisor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    CardModule,
    ButtonModule,
    TagModule,
    ToastModule,
    ProgressSpinnerModule,
    TableModule,
    BadgeModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './supervisor.component.html',
  styleUrls: ['./supervisor.component.scss'],
})
export class SupervisorComponent implements OnInit {
  private readonly supervisorService = inject(SupervisorService);
  private readonly messageService = inject(MessageService);

  readonly data = this.supervisorService.data;
  readonly isLoading = this.supervisorService.isLoading;

  readonly kpis = computed(() => this.data()?.kpis ?? null);
  readonly deviceStatusByUnit = computed(() => this.data()?.deviceStatusByUnit ?? []);
  readonly personnelByUnit = computed(() => this.data()?.personnelByUnit ?? []);
  readonly todayRoster = computed(() => this.data()?.todayRoster ?? []);
  readonly recentIncidents = computed(() => this.data()?.recentIncidents ?? []);
  readonly recentAlerts = computed(() => this.data()?.recentAlerts ?? []);

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.supervisorService.loadDashboard().subscribe({
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: 'Hata',
          detail: 'Süpervizör verileri yüklenemedi',
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
}
