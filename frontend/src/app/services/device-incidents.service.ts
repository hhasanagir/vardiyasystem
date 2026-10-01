import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api/api.service';

export interface DeviceIncident {
  id: string;
  userId: string;
  unitId: string;
  deviceId: string | null;
  issueType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  imageUrl: string | null;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  reportedAt: string;
  updatedAt: string;
  user: { id: string; name: string; role: string };
  unit: { id: string; name: string; organizationId: string };
  device: { id: string; name: string; code: string } | null;
}

export interface DeviceIncidentsResponse {
  data: DeviceIncident[];
  total: number;
}

export interface CreateDeviceIncidentPayload {
  unitId: string;
  deviceId?: string;
  issueType: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  imageUrl?: string;
}

export interface UpdateDeviceIncidentPayload {
  issueType?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  description?: string;
  imageUrl?: string;
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
}

@Injectable({ providedIn: 'root' })
export class DeviceIncidentsService {
  private api = inject(ApiService);

  getIncidents(params?: Record<string, string>): Observable<DeviceIncidentsResponse> {
    return this.api.get<DeviceIncidentsResponse>('/device-incidents', { params });
  }

  getIncident(id: string): Observable<DeviceIncident> {
    return this.api.get<DeviceIncident>(`/device-incidents/${id}`);
  }

  createIncident(payload: CreateDeviceIncidentPayload): Observable<DeviceIncident> {
    return this.api.post<DeviceIncident>('/device-incidents', payload);
  }

  updateIncident(id: string, payload: UpdateDeviceIncidentPayload): Observable<DeviceIncident> {
    return this.api.patch<DeviceIncident>(`/device-incidents/${id}`, payload);
  }

  updateStatus(id: string, status: string): Observable<DeviceIncident> {
    return this.api.patch<DeviceIncident>(`/device-incidents/${id}/status`, { status });
  }
}
