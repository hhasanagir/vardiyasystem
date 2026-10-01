import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface DeviceStatusEntry {
  id: string;
  deviceId: string;
  userId: string;
  status: 'active' | 'maintenance' | 'fault' | 'out_of_service';
  notes: string | null;
  createdAt: string;
  device?: { id: string; name: string; code: string };
}

export interface UnitDeviceWithStatus {
  id: string;
  name: string;
  code: string;
  currentStatus: DeviceStatusEntry | null;
}

@Injectable({ providedIn: 'root' })
export class DeviceStatusService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/device-status';

  getMyUnitDevices(): Observable<UnitDeviceWithStatus[]> {
    return this.http.get<UnitDeviceWithStatus[]>(this.baseUrl).pipe(
      catchError((err) => {
        console.error('DeviceStatus getMyUnitDevices failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getDeviceStatus(deviceId: string): Observable<DeviceStatusEntry> {
    return this.http.get<DeviceStatusEntry>(`${this.baseUrl}/device/${deviceId}`).pipe(
      catchError((err) => {
        console.error('DeviceStatus getDeviceStatus failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getDeviceHistory(deviceId: string, limit = 10): Observable<DeviceStatusEntry[]> {
    return this.http
      .get<DeviceStatusEntry[]>(`${this.baseUrl}/device/${deviceId}/history?limit=${limit}`)
      .pipe(
        catchError((err) => {
          console.error('DeviceStatus getDeviceHistory failed:', err);
          return throwError(() => err);
        }),
      );
  }

  updateStatus(deviceId: string, status: string, notes?: string): Observable<DeviceStatusEntry> {
    return this.http.post<DeviceStatusEntry>(this.baseUrl, { deviceId, status, notes }).pipe(
      catchError((err) => {
        console.error('DeviceStatus updateStatus failed:', err);
        return throwError(() => err);
      }),
    );
  }
}
