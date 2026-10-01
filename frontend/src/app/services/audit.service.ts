import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api/api.service';
import type {
  AuditLogEntry,
  PaginatedAuditResponse,
  AuditQueryFilters,
} from '../domain/models/audit-log';

@Injectable({ providedIn: 'root' })
export class AuditService {
  private api = inject(ApiService);

  findAll(filters?: AuditQueryFilters): Observable<PaginatedAuditResponse> {
    return this.api.get<PaginatedAuditResponse>('/audit', {
      params: filters as Record<string, string>,
    });
  }

  findById(id: string): Observable<AuditLogEntry> {
    return this.api.get<AuditLogEntry>(`/audit/${id}`);
  }

  findByUser(userId: string, filters?: AuditQueryFilters): Observable<PaginatedAuditResponse> {
    return this.api.get<PaginatedAuditResponse>(`/audit/user/${userId}`, {
      params: filters as Record<string, string>,
    });
  }

  findByEntity(entityType: string, entityId: string): Observable<AuditLogEntry[]> {
    return this.api.get<AuditLogEntry[]>(`/audit/entity/${entityType}/${entityId}`);
  }

  getStatistics(startDate: string, endDate: string): Observable<any> {
    return this.api.get<any>('/audit/statistics', { params: { startDate, endDate } });
  }

  getFlagged(): Observable<AuditLogEntry[]> {
    return this.api.get<AuditLogEntry[]>('/audit/flagged');
  }

  getSuspicious(userId?: string): Observable<any[]> {
    const params = userId ? { userId } : undefined;
    return this.api.get<any[]>('/audit/suspicious', { params: params as Record<string, string> });
  }

  flagEntry(id: string, reason: string): Observable<any> {
    return this.api.post<any>(`/audit/${id}/flag`, { reason });
  }

  unflagEntry(id: string): Observable<any> {
    return this.api.post<any>(`/audit/${id}/unflag`, {});
  }

  exportCsvUrl(filters?: AuditQueryFilters): string {
    const params = new URLSearchParams();
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') {
          params.set(k, String(v));
        }
      });
    }
    return `/api/v1/audit/export/csv?${params.toString()}`;
  }

  exportReportUrl(startDate: string, endDate: string, filters?: AuditQueryFilters): string {
    const params = new URLSearchParams();
    params.set('startDate', startDate);
    params.set('endDate', endDate);
    if (filters) {
      Object.entries(filters).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '' && k !== 'startDate' && k !== 'endDate') {
          params.set(k, String(v));
        }
      });
    }
    return `/api/v1/audit/export/report?${params.toString()}`;
  }
}
