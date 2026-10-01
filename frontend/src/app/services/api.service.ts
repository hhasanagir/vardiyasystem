import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, catchError, tap, map } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class ApiService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private baseUrl = '/api/v1';

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    });
  }

  get<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.baseUrl}${path}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(err => {
        console.error(`API GET ${path} failed:`, err);
        throw err;
      })
    );
  }

  post<T>(path: string, body: any): Observable<T> {
    return this.http.post<T>(`${this.baseUrl}${path}`, body, {
      headers: this.getHeaders()
    }).pipe(
      catchError(err => {
        console.error(`API POST ${path} failed:`, err);
        throw err;
      })
    );
  }

  put<T>(path: string, body: any): Observable<T> {
    return this.http.put<T>(`${this.baseUrl}${path}`, body, {
      headers: this.getHeaders()
    }).pipe(
      catchError(err => {
        console.error(`API PUT ${path} failed:`, err);
        throw err;
      })
    );
  }

  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(`${this.baseUrl}${path}`, {
      headers: this.getHeaders()
    }).pipe(
      catchError(err => {
        console.error(`API DELETE ${path} failed:`, err);
        throw err;
      })
    );
  }

  download(path: string, params: Record<string, any> = {}): Observable<Blob> {
    return this.http.get(`${this.baseUrl}${path}`, {
      headers: this.getHeaders(),
      params,
      responseType: 'blob',
    }).pipe(
      tap(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const contentDisposition = blob.type;
        const ext = params['format'] || 'xlsx';
        a.download = `export-${Date.now()}.${ext}`;
        a.click();
        window.URL.revokeObjectURL(url);
      }),
      catchError(err => {
        console.error(`API Download ${path} failed:`, err);
        throw err;
      })
    );
  }
}

export interface ScheduleApiResponse {
  id: string;
  unitId: string;
  month: number;
  year: number;
  version: number;
  status: 'draft' | 'published' | 'archived';
  unit?: any;
  assignments: AssignmentApiResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentApiResponse {
  id: string;
  personnelId: string;
  deviceId: string;
  date: string;
  shiftType: 'day' | 'evening' | 'night';
  startTime: string;
  endTime: string;
  isConfirmed: boolean;
  personnel?: any;
  device?: any;
}

export interface ConflictResponse {
  id: string;
  type: string;
  severity: string;
  message: string;
  date?: string;
  personnelId?: string;
  deviceId?: string;
}

export interface ValidationResponse {
  isValid: boolean;
  errors: any[];
  warnings: any[];
  score: number;
}

export interface SnapshotResponse {
  id: string;
  version: number;
  createdAt: string;
  createdBy?: { id: string; name: string };
}
