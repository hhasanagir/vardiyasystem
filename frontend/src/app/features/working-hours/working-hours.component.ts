import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ScheduleService } from '../../services/schedule.service';

interface PersonnelHours {
  personnelId: string;
  employeeNo: string;
  personnelName: string;
  role: string;
  unitId: string;
  unitName: string;
  maxWeeklyHours: number;
  standardMonthlyHours: number;
  normalHours: number;
  overtimeHours: number;
  leaveHours: number;
  trainingHours: number;
  totalHours: number;
  shifts: {
    day: number;
    evening: number;
    night: number;
    morning: number;
    off: number;
    leave: number;
    sick: number;
    training: number;
  };
}

interface UnitSummary {
  unitId: string;
  unitName: string;
  unitType: string;
  personnelCount: number;
  totalNormalHours: number;
  totalOvertimeHours: number;
  totalLeaveHours: number;
}

type SortKey =
  | 'personnelName'
  | 'role'
  | 'day'
  | 'evening'
  | 'night'
  | 'morning'
  | 'off'
  | 'sick'
  | 'normalHours'
  | 'overtimeHours'
  | 'leaveHours'
  | 'totalHours'
  | 'workload';
type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-working-hours',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page">
      <div class="page-header">
        <div class="header-left">
          <h1 class="page-title">Aylık Çalışma Saatleri</h1>
          <p class="page-subtitle">Bölüm bazlı personel çalışma, fazla mesai ve izin saatleri</p>
        </div>
        <div class="header-actions">
          <div class="filters">
            <select
              class="filter-select"
              [ngModel]="selectedMonth()"
              (ngModelChange)="onFilterChange($event, 'month')"
            >
              @for (m of months; track m.value) {
                <option [value]="m.value">{{ m.label }}</option>
              }
            </select>
            <select
              class="filter-select"
              [ngModel]="selectedYear()"
              (ngModelChange)="onFilterChange($event, 'year')"
            >
              @for (y of years; track y) {
                <option [value]="y">{{ y }}</option>
              }
            </select>
            <select
              class="filter-select"
              [ngModel]="selectedUnit()"
              (ngModelChange)="onFilterChange($event, 'unit')"
            >
              <option value="">Tüm Bölümler</option>
              @for (u of allUnits(); track u.unitId) {
                <option [value]="u.unitId">{{ u.unitName }}</option>
              }
            </select>
          </div>
          <div class="export-group">
            <button
              class="btn btn-export-csv"
              (click)="exportCSV()"
              [disabled]="!personnelData().length"
              title="CSV olarak indir"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
              CSV
            </button>
            <button
              class="btn btn-export-pdf"
              (click)="exportPDF()"
              [disabled]="!personnelData().length"
              title="PDF olarak yazdır"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M9 15h6" />
                <path d="M9 11h6" />
              </svg>
              PDF
            </button>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="loading">
          <div class="spinner"></div>
          <span>Veriler yükleniyor...</span>
        </div>
      } @else if (!data()) {
        <div class="empty">
          <svg
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            style="opacity:0.3;margin-bottom:12px"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <div>Veri bulunamadı</div>
          <div class="empty-hint">Bu dönem için planlama verisi olmayabilir.</div>
        </div>
      } @else {
        <div class="summary-cards">
          <div class="card card-normal">
            <div class="card-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <div class="card-body">
              <div class="card-label">Toplam Çalışma</div>
              <div class="card-value">
                {{ totalNormalHours() }} <span class="card-unit">saat</span>
              </div>
            </div>
          </div>
          <div class="card card-overtime">
            <div class="card-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div class="card-body">
              <div class="card-label">Fazla Mesai</div>
              <div class="card-value">
                {{ totalOvertimeHours() }} <span class="card-unit">saat</span>
              </div>
            </div>
          </div>
          <div class="card card-leave">
            <div class="card-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                <line x1="6" y1="1" x2="6" y2="4" />
                <line x1="10" y1="1" x2="10" y2="4" />
                <line x1="14" y1="1" x2="14" y2="4" />
              </svg>
            </div>
            <div class="card-body">
              <div class="card-label">Toplam İzin</div>
              <div class="card-value">
                {{ totalLeaveHours() }} <span class="card-unit">saat</span>
              </div>
            </div>
          </div>
          <div class="card card-standard">
            <div class="card-icon">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div class="card-body">
              <div class="card-label">Standart Aylık</div>
              <div class="card-value">
                {{ data()?.standardMonthlyHours || 0 }} <span class="card-unit">saat</span>
              </div>
            </div>
          </div>
        </div>

        @for (unit of filteredUnits(); track unit.unitId) {
          <div class="unit-section">
            <div class="unit-header">
              <div class="unit-title-row">
                <h2 class="unit-name">{{ unit.unitName }}</h2>
                <span class="unit-type-badge" [attr.data-type]="unit.unitType">{{
                  unitTypeLabel(unit.unitType)
                }}</span>
              </div>
              <div class="unit-stats">
                <span class="stat-chip">
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                  {{ unit.personnelCount }} kişi
                </span>
                <span class="stat-chip stat-normal">{{ unit.totalNormalHours }}s çalışma</span>
                <span class="stat-chip stat-overtime">{{ unit.totalOvertimeHours }}s fazla</span>
                <span class="stat-chip stat-leave">{{ unit.totalLeaveHours }}s izin</span>
              </div>
            </div>

            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th class="col-name sortable" (click)="toggleSort('personnelName')">
                      Personel
                      @if (sortKey() === 'personnelName') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-role sortable" (click)="toggleSort('role')">
                      Görev
                      @if (sortKey() === 'role') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('day')">
                      Gündüz
                      @if (sortKey() === 'day') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('evening')">
                      Akşam
                      @if (sortKey() === 'evening') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('night')">
                      Gece
                      @if (sortKey() === 'night') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('morning')">
                      Sabah
                      @if (sortKey() === 'morning') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('off')">
                      İzin
                      @if (sortKey() === 'off') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num sortable" (click)="toggleSort('sick')">
                      Raporlu
                      @if (sortKey() === 'sick') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num normal sortable" (click)="toggleSort('normalHours')">
                      Çalışma (sa)
                      @if (sortKey() === 'normalHours') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num overtime sortable" (click)="toggleSort('overtimeHours')">
                      Fazla (sa)
                      @if (sortKey() === 'overtimeHours') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num leave sortable" (click)="toggleSort('leaveHours')">
                      İzin (sa)
                      @if (sortKey() === 'leaveHours') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-num total sortable" (click)="toggleSort('totalHours')">
                      Toplam
                      @if (sortKey() === 'totalHours') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                    <th class="col-bar sortable" (click)="toggleSort('workload')">
                      Yük
                      @if (sortKey() === 'workload') {
                        <span class="sort-arrow">{{ sortDir() === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </th>
                  </tr>
                </thead>
                <tbody>
                  @for (p of getSortedPersonnel(unit.unitId); track p.personnelId) {
                    <tr>
                      <td class="col-name">
                        <div class="personnel-info">
                          <div
                            class="personnel-avatar"
                            [attr.data-initials]="getInitials(p.personnelName)"
                          >
                            {{ getInitials(p.personnelName) }}
                          </div>
                          <div>
                            <span class="personnel-name">{{ p.personnelName }}</span>
                            @if (p.employeeNo) {
                              <span class="personnel-no">{{ p.employeeNo }}</span>
                            }
                          </div>
                        </div>
                      </td>
                      <td class="col-role">
                        <span class="role-tag">{{ roleLabel(p.role) }}</span>
                      </td>
                      <td class="col-num">{{ p.shifts.day || '—' }}</td>
                      <td class="col-num">{{ p.shifts.evening || '—' }}</td>
                      <td class="col-num night-val">{{ p.shifts.night || '—' }}</td>
                      <td class="col-num">{{ p.shifts.morning || '—' }}</td>
                      <td class="col-num leave-val">{{ p.shifts.off + p.shifts.leave || '—' }}</td>
                      <td class="col-num sick-val">{{ p.shifts.sick || '—' }}</td>
                      <td class="col-num normal">{{ p.normalHours }}</td>
                      <td class="col-num overtime" [class.has-overtime]="p.overtimeHours > 0">
                        {{ p.overtimeHours || '—' }}
                      </td>
                      <td class="col-num leave">{{ p.leaveHours || '—' }}</td>
                      <td class="col-num total">{{ p.totalHours }}</td>
                      <td class="col-bar">
                        <div class="bar-wrap">
                          <div class="bar-track">
                            <div
                              class="bar-fill"
                              [style.width.%]="Math.min(workloadPercent(p), 100)"
                              [class]="workloadClass(p)"
                            ></div>
                          </div>
                          <span class="bar-label" [class.bar-over]="workloadPercent(p) > 100"
                            >{{ workloadPercent(p) }}%</span
                          >
                        </div>
                      </td>
                    </tr>
                  }
                </tbody>
                <tfoot>
                  <tr class="total-row">
                    <td class="col-name"><strong>TOPLAM</strong></td>
                    <td class="col-role">{{ getSortedPersonnel(unit.unitId).length }} kişi</td>
                    <td class="col-num">{{ unitSum(unit.unitId, 'day') }}</td>
                    <td class="col-num">{{ unitSum(unit.unitId, 'evening') }}</td>
                    <td class="col-num">{{ unitSum(unit.unitId, 'night') }}</td>
                    <td class="col-num">{{ unitSum(unit.unitId, 'morning') }}</td>
                    <td class="col-num">
                      {{ unitSum(unit.unitId, 'off') + unitSum(unit.unitId, 'leave') }}
                    </td>
                    <td class="col-num">{{ unitSum(unit.unitId, 'sick') }}</td>
                    <td class="col-num normal">{{ unit.totalNormalHours }}</td>
                    <td class="col-num overtime">{{ unit.totalOvertimeHours }}</td>
                    <td class="col-num leave">{{ unit.totalLeaveHours }}</td>
                    <td class="col-num total">
                      {{ unit.totalNormalHours + unit.totalOvertimeHours }}
                    </td>
                    <td class="col-bar"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .page {
        padding: 24px;
        max-width: 1440px;
        margin: 0 auto;
      }

      /* Header */
      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 24px;
        flex-wrap: wrap;
        gap: 16px;
      }
      .page-title {
        font-size: 22px;
        font-weight: 700;
        color: var(--text-primary, #f1f5f9);
        margin: 0;
        letter-spacing: -0.3px;
      }
      .page-subtitle {
        font-size: 13px;
        color: var(--text-secondary, #94a3b8);
        margin: 4px 0 0;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .filters {
        display: flex;
        gap: 8px;
      }
      .filter-select {
        background: var(--bg-secondary, #0f172a);
        border: 1px solid var(--border-color, #334155);
        border-radius: 8px;
        padding: 8px 12px;
        color: var(--text-primary, #f1f5f9);
        font-size: 13px;
        outline: none;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .filter-select:focus {
        border-color: #3b82f6;
      }

      /* Buttons */
      .export-group {
        display: flex;
        gap: 6px;
      }
      .btn {
        padding: 8px 14px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        transition: all 0.15s;
      }
      .btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-export-csv {
        background: #065f46;
        color: #6ee7b7;
      }
      .btn-export-csv:hover:not(:disabled) {
        background: #047857;
        color: #a7f3d0;
      }
      .btn-export-pdf {
        background: #7c2d12;
        color: #fdba74;
      }
      .btn-export-pdf:hover:not(:disabled) {
        background: #9a3412;
        color: #fed7aa;
      }

      /* Loading / Empty */
      .loading {
        padding: 80px;
        text-align: center;
        color: var(--text-secondary, #94a3b8);
        font-size: 14px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
      }
      .spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 2px solid rgba(59, 130, 246, 0.2);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.7s linear infinite;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      .empty {
        padding: 80px;
        text-align: center;
        color: var(--text-secondary, #94a3b8);
        font-size: 14px;
      }
      .empty-hint {
        font-size: 12px;
        margin-top: 6px;
        opacity: 0.6;
      }

      /* Summary Cards */
      .summary-cards {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 14px;
        margin-bottom: 28px;
      }
      .card {
        background: var(--bg-secondary, #0f172a);
        border-radius: 12px;
        padding: 18px 20px;
        border: 1px solid var(--border-color, #334155);
        display: flex;
        align-items: center;
        gap: 14px;
        transition:
          border-color 0.2s,
          transform 0.15s;
      }
      .card:hover {
        transform: translateY(-1px);
      }
      .card-icon {
        width: 44px;
        height: 44px;
        border-radius: 10px;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
      .card-normal .card-icon {
        background: rgba(59, 130, 246, 0.12);
        color: #60a5fa;
      }
      .card-overtime .card-icon {
        background: rgba(245, 158, 11, 0.12);
        color: #fbbf24;
      }
      .card-leave .card-icon {
        background: rgba(139, 92, 246, 0.12);
        color: #a78bfa;
      }
      .card-standard .card-icon {
        background: rgba(100, 116, 139, 0.12);
        color: #94a3b8;
      }
      .card-normal {
        border-color: rgba(59, 130, 246, 0.15);
      }
      .card-overtime {
        border-color: rgba(245, 158, 11, 0.15);
      }
      .card-leave {
        border-color: rgba(139, 92, 246, 0.15);
      }
      .card-standard {
        border-color: rgba(100, 116, 139, 0.15);
      }
      .card-body {
        min-width: 0;
      }
      .card-label {
        font-size: 12px;
        color: var(--text-secondary, #94a3b8);
        margin-bottom: 2px;
        white-space: nowrap;
      }
      .card-value {
        font-size: 24px;
        font-weight: 700;
        color: var(--text-primary, #f1f5f9);
        line-height: 1.1;
      }
      .card-unit {
        font-size: 13px;
        font-weight: 400;
        color: var(--text-secondary, #64748b);
      }

      /* Unit Section */
      .unit-section {
        margin-bottom: 28px;
      }
      .unit-header {
        margin-bottom: 12px;
      }
      .unit-title-row {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 6px;
      }
      .unit-name {
        font-size: 16px;
        font-weight: 600;
        color: var(--text-primary, #f1f5f9);
        margin: 0;
      }
      .unit-type-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 20px;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .unit-type-badge[data-type='onkoloji'] {
        background: rgba(239, 68, 68, 0.12);
        color: #fca5a5;
      }
      .unit-type-badge[data-type='pet-ct'] {
        background: rgba(59, 130, 246, 0.12);
        color: #93c5fd;
      }
      .unit-type-badge[data-type='mri'] {
        background: rgba(139, 92, 246, 0.12);
        color: #c4b5fd;
      }
      .unit-type-badge[data-type='tomografi'] {
        background: rgba(245, 158, 11, 0.12);
        color: #fcd34d;
      }
      .unit-type-badge[data-type='laboratuvar'] {
        background: rgba(16, 185, 129, 0.12);
        color: #6ee7b7;
      }
      .unit-type-badge[data-type='ultrason'] {
        background: rgba(236, 72, 153, 0.12);
        color: #f9a8d4;
      }
      .unit-type-badge[data-type='polyclinic'] {
        background: rgba(100, 116, 139, 0.12);
        color: #cbd5e1;
      }
      .unit-type-badge:not([data-type]) {
        background: rgba(100, 116, 139, 0.12);
        color: #94a3b8;
      }
      .unit-stats {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }
      .stat-chip {
        font-size: 12px;
        color: var(--text-secondary, #94a3b8);
        display: inline-flex;
        align-items: center;
        gap: 4px;
        background: rgba(51, 65, 85, 0.3);
        padding: 2px 8px;
        border-radius: 6px;
      }
      .stat-normal {
        color: #60a5fa;
      }
      .stat-overtime {
        color: #fbbf24;
      }
      .stat-leave {
        color: #a78bfa;
      }

      /* Table */
      .table-wrap {
        overflow-x: auto;
        border-radius: 10px;
        border: 1px solid var(--border-color, #334155);
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .data-table th {
        background: var(--bg-secondary, #0f172a);
        padding: 10px 12px;
        text-align: left;
        font-weight: 600;
        color: var(--text-secondary, #94a3b8);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        white-space: nowrap;
        border-bottom: 1px solid var(--border-color, #334155);
        user-select: none;
      }
      .data-table th.sortable {
        cursor: pointer;
        transition: color 0.15s;
      }
      .data-table th.sortable:hover {
        color: #e2e8f0;
      }
      .sort-arrow {
        font-size: 10px;
        margin-left: 2px;
        color: #3b82f6;
      }
      .data-table td {
        padding: 10px 12px;
        color: var(--text-primary, #f1f5f9);
        border-bottom: 1px solid rgba(51, 65, 85, 0.2);
      }
      .data-table tbody tr {
        transition: background 0.1s;
      }
      .data-table tbody tr:hover {
        background: rgba(59, 130, 246, 0.05);
      }
      .col-num {
        text-align: right;
        font-variant-numeric: tabular-nums;
        white-space: nowrap;
      }
      .col-num.normal {
        color: #60a5fa;
        font-weight: 600;
      }
      .col-num.overtime {
        color: #fbbf24;
      }
      .col-num.overtime.has-overtime {
        font-weight: 700;
      }
      .col-num.leave {
        color: #a78bfa;
      }
      .col-num.total {
        font-weight: 700;
        color: #e2e8f0;
      }
      .night-val {
        color: #818cf8;
      }
      .leave-val {
        color: #c4b5fd;
      }
      .sick-val {
        color: #fca5a5;
      }
      .col-role {
        font-size: 12px;
        color: var(--text-secondary, #94a3b8);
      }
      .role-tag {
        background: rgba(51, 65, 85, 0.4);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        white-space: nowrap;
      }

      /* Personnel avatar */
      .personnel-info {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .personnel-avatar {
        width: 32px;
        height: 32px;
        border-radius: 8px;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        letter-spacing: 0.5px;
      }
      .personnel-name {
        font-weight: 500;
        display: block;
      }
      .personnel-no {
        display: block;
        font-size: 11px;
        color: var(--text-secondary, #64748b);
        margin-top: 1px;
      }

      /* Workload bar */
      .col-bar {
        width: 130px;
      }
      .bar-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .bar-track {
        flex: 1;
        height: 7px;
        background: rgba(51, 65, 85, 0.3);
        border-radius: 4px;
        overflow: hidden;
      }
      .bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s ease;
      }
      .bar-fill.level-low {
        background: linear-gradient(90deg, #22c55e, #4ade80);
      }
      .bar-fill.level-ok {
        background: linear-gradient(90deg, #3b82f6, #60a5fa);
      }
      .bar-fill.level-warn {
        background: linear-gradient(90deg, #f59e0b, #fbbf24);
      }
      .bar-fill.level-over {
        background: linear-gradient(90deg, #ef4444, #f87171);
      }
      .bar-label {
        font-size: 11px;
        color: var(--text-secondary, #94a3b8);
        white-space: nowrap;
        min-width: 32px;
        text-align: right;
      }
      .bar-label.bar-over {
        color: #f87171;
        font-weight: 600;
      }

      /* Total row */
      .total-row {
        border-top: 2px solid var(--border-color, #334155);
      }
      .total-row td {
        padding: 12px;
        font-weight: 600;
        color: var(--text-primary, #e2e8f0);
        background: rgba(15, 23, 42, 0.5);
      }
      .total-row td:first-child {
        border-radius: 0 0 0 10px;
      }
      .total-row td:last-child {
        border-radius: 0 0 10px 0;
      }
    `,
  ],
})
export class WorkingHoursComponent implements OnInit {
  protected readonly Math = Math;
  private readonly scheduleApi = inject(ScheduleService);

  readonly loading = signal(false);
  readonly data = signal<any>(null);
  readonly selectedMonth = signal(new Date().getMonth() + 1);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedUnit = signal('');

  readonly sortKey = signal<SortKey>('normalHours');
  readonly sortDir = signal<SortDir>('desc');

  readonly months = [
    { value: 1, label: 'Ocak' },
    { value: 2, label: 'Şubat' },
    { value: 3, label: 'Mart' },
    { value: 4, label: 'Nisan' },
    { value: 5, label: 'Mayıs' },
    { value: 6, label: 'Haziran' },
    { value: 7, label: 'Temmuz' },
    { value: 8, label: 'Ağustos' },
    { value: 9, label: 'Eylül' },
    { value: 10, label: 'Ekim' },
    { value: 11, label: 'Kasım' },
    { value: 12, label: 'Aralık' },
  ];
  readonly years = [2025, 2026, 2027];

  readonly allUnits = computed(() => this.data()?.units || []);

  readonly filteredUnits = computed(() => {
    const units = this.data()?.units || [];
    const u = this.selectedUnit();
    return u ? units.filter((x: UnitSummary) => x.unitId === u) : units;
  });

  readonly personnelData = computed(() => this.data()?.personnel || []);

  readonly totalNormalHours = computed(() =>
    this.filteredUnits()
      .reduce((s: number, u: UnitSummary) => s + u.totalNormalHours, 0)
      .toFixed(1),
  );
  readonly totalOvertimeHours = computed(() =>
    this.filteredUnits()
      .reduce((s: number, u: UnitSummary) => s + u.totalOvertimeHours, 0)
      .toFixed(1),
  );
  readonly totalLeaveHours = computed(() =>
    this.filteredUnits()
      .reduce((s: number, u: UnitSummary) => s + u.totalLeaveHours, 0)
      .toFixed(1),
  );

  ngOnInit() {
    this.loadData();
  }

  onFilterChange(value: any, type: 'month' | 'year' | 'unit'): void {
    if (type === 'month') this.selectedMonth.set(+value);
    else if (type === 'year') this.selectedYear.set(+value);
    else this.selectedUnit.set(value);
    this.loadData();
  }

  async loadData(): Promise<void> {
    this.loading.set(true);
    const result = await firstValueFrom(
      this.scheduleApi.getWorkingHours({
        month: this.selectedMonth(),
        year: this.selectedYear(),
        unitType: this.selectedUnit() || undefined,
      }),
    );
    this.data.set(result);
    this.loading.set(false);
  }

  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortDir.set('desc');
    }
  }

  getSortedPersonnel(unitId: string): PersonnelHours[] {
    const list = this.personnelData().filter((p: PersonnelHours) => p.unitId === unitId);
    const key = this.sortKey();
    const dir = this.sortDir() === 'asc' ? 1 : -1;

    return [...list].sort((a: PersonnelHours, b: PersonnelHours) => {
      let va: number | string;
      let vb: number | string;
      switch (key) {
        case 'personnelName':
          va = a.personnelName;
          vb = b.personnelName;
          return dir * va.localeCompare(vb, 'tr');
        case 'role':
          va = a.role;
          vb = b.role;
          return dir * va.localeCompare(vb, 'tr');
        case 'day':
          va = a.shifts.day;
          vb = b.shifts.day;
          break;
        case 'evening':
          va = a.shifts.evening;
          vb = b.shifts.evening;
          break;
        case 'night':
          va = a.shifts.night;
          vb = b.shifts.night;
          break;
        case 'morning':
          va = a.shifts.morning;
          vb = b.shifts.morning;
          break;
        case 'off':
          va = a.shifts.off + a.shifts.leave;
          vb = b.shifts.off + b.shifts.leave;
          break;
        case 'sick':
          va = a.shifts.sick;
          vb = b.shifts.sick;
          break;
        case 'normalHours':
          va = a.normalHours;
          vb = b.normalHours;
          break;
        case 'overtimeHours':
          va = a.overtimeHours;
          vb = b.overtimeHours;
          break;
        case 'leaveHours':
          va = a.leaveHours;
          vb = b.leaveHours;
          break;
        case 'totalHours':
          va = a.totalHours;
          vb = b.totalHours;
          break;
        case 'workload':
          va = this.workloadPercent(a);
          vb = this.workloadPercent(b);
          break;
        default:
          return 0;
      }
      return dir * ((va as number) - (vb as number));
    });
  }

  unitSum(unitId: string, field: string): number {
    return this.personnelData()
      .filter((p: PersonnelHours) => p.unitId === unitId)
      .reduce((s: number, p: PersonnelHours) => {
        if (field === 'off') return s + p.shifts.off + p.shifts.leave;
        return s + ((p.shifts as any)[field] || 0);
      }, 0);
  }

  getInitials(name: string): string {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return (parts[0] || '?').substring(0, 2).toUpperCase();
  }

  workloadPercent(p: PersonnelHours): number {
    if (!p.standardMonthlyHours) return 0;
    return Math.min(Math.round((p.normalHours / p.standardMonthlyHours) * 100), 999);
  }

  workloadClass(p: PersonnelHours): string {
    const pct = this.workloadPercent(p);
    if (pct > 100) return 'level-over';
    if (pct > 80) return 'level-warn';
    if (pct > 50) return 'level-ok';
    return 'level-low';
  }

  roleLabel(role: string): string {
    const labels: Record<string, string> = {
      technician: 'Tekniker',
      assistant_technician: 'Yardımcı Tekniker',
      senior_technician: 'Sorumlu Tekniker',
      supervisor: 'Süpervizör',
      medical_engineer: 'Medikal Mühendis',
      field_supervisor: 'Saha Sorumlusu',
      medical_physicist: 'Sağlık Fizikçisi',
      pharmacist: 'Eczacı',
      planning: 'Planlama',
    };
    return labels[role] || role;
  }

  unitTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      onkoloji: 'Onkoloji',
      'pet-ct': 'PET-CT',
      mri: 'MR',
      tomografi: 'BT',
      laboratuvar: 'Laboratuvar',
      ultrason: 'Ultrason',
      polyclinic: 'Poliklinik',
    };
    return labels[type] || type;
  }

  exportCSV(): void {
    const header = [
      'Bölüm,Personel,No,Görev,Gündüz,Akşam,Gece,Sabah,İzin,Raporlu,Çalışma (sa),Fazla (sa),İzin (sa),Toplam (sa),Yük (%)',
    ];
    const rows: string[] = header;
    for (const u of this.filteredUnits()) {
      for (const p of this.getSortedPersonnel(u.unitId)) {
        const cols = [
          `"${p.unitName}"`,
          `"${p.personnelName}"`,
          p.employeeNo || '',
          `"${this.roleLabel(p.role)}"`,
          p.shifts.day,
          p.shifts.evening,
          p.shifts.night,
          p.shifts.morning,
          p.shifts.off + p.shifts.leave,
          p.shifts.sick,
          p.normalHours,
          p.overtimeHours,
          p.leaveHours,
          p.totalHours,
          this.workloadPercent(p) + '%',
        ];
        rows.push(cols.join(','));
      }
    }
    const csv = rows.join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `calisma_saatleri_${this.selectedMonth()}_${this.selectedYear()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  exportPDF(): void {
    window.print();
  }
}
