import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api/api.service';

export interface Training {
  id: string;
  name: string;
  provider: string | null;
  category: string;
  description: string | null;
  isActive: boolean;
  _count?: { personnelTrainings: number };
  personnelTrainings: PersonnelTrainingItem[];
}

export interface PersonnelTrainingItem {
  id: string;
  personnelId: string;
  trainingId: string;
  issueDate: string | null;
  expiryDate: string | null;
  documentUrl: string | null;
  status: string;
  isActive: boolean;
  personnel: { id: string; name: string; role: string; employeeNo: string | null };
  training?: Training;
}

export interface TrainingRiskSummary {
  total: number;
  valid: number;
  expired: number;
  expiring30: number;
  expiring90: number;
  noExpiry: number;
  riskScore: number;
}

export interface CreateTrainingPayload {
  name: string;
  provider?: string;
  category?: string;
  description?: string;
}

export interface AssignTrainingPayload {
  trainingId: string;
  issueDate?: string;
  expiryDate?: string;
  documentUrl?: string;
  status?: string;
}

@Injectable({ providedIn: 'root' })
export class TrainingService {
  private api = inject(ApiService);

  getAll(query?: {
    status?: string;
    category?: string;
    personnelId?: string;
    search?: string;
  }): Observable<Training[]> {
    return this.api.get<Training[]>('/trainings', { params: query as any });
  }

  create(dto: CreateTrainingPayload): Observable<Training> {
    return this.api.post<Training>('/trainings', dto);
  }

  update(id: string, dto: Partial<CreateTrainingPayload>): Observable<Training> {
    return this.api.patch<Training>(`/trainings/${id}`, dto);
  }

  delete(id: string): Observable<any> {
    return this.api.delete(`/trainings/${id}`);
  }

  getRiskSummary(): Observable<TrainingRiskSummary> {
    return this.api.get<TrainingRiskSummary>('/trainings/risk-summary');
  }

  getExpiring(days = 30): Observable<PersonnelTrainingItem[]> {
    return this.api.get<PersonnelTrainingItem[]>('/trainings/expiring', {
      params: { days: String(days) },
    });
  }

  assign(personnelId: string, dto: AssignTrainingPayload): Observable<PersonnelTrainingItem> {
    return this.api.post<PersonnelTrainingItem>(`/trainings/personnel/${personnelId}`, dto);
  }

  getPersonnelTrainings(personnelId: string): Observable<PersonnelTrainingItem[]> {
    return this.api.get<PersonnelTrainingItem[]>(`/trainings/personnel/${personnelId}`);
  }

  updateAssignment(
    id: string,
    dto: Partial<AssignTrainingPayload>,
  ): Observable<PersonnelTrainingItem> {
    return this.api.patch<PersonnelTrainingItem>(`/trainings/personnel-training/${id}`, dto);
  }

  removeAssignment(id: string): Observable<any> {
    return this.api.delete(`/trainings/personnel-training/${id}`);
  }

  getExportExcelUrl(): string {
    return `/trainings/export/excel`;
  }

  getExportPdfUrl(): string {
    return `/trainings/export/pdf`;
  }
}
