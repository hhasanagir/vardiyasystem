import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../environments';
import { Shift } from '../domain/models';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class ShiftService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private getOrganizationId(): string {
    return this.authService.user()?.organizationId || '';
  }

  private getUnitId(): string {
    return this.authService.user()?.unitId || '';
  }

  getAll(): Observable<Shift[]> {
    const orgId = this.getOrganizationId();
    const unitId = this.getUnitId();
    return this.http
      .get<Shift[]>(`${this.apiUrl}/shifts`, {
        headers: this.getHeaders(),
        params: { organizationId: orgId, unitId },
      })
      .pipe(
        catchError((err) => {
          console.error('[ShiftService] getAll failed:', err);
          return throwError(() => err);
        }),
      );
  }

  getByUnit(unitId: string): Observable<Shift[]> {
    const orgId = this.getOrganizationId();
    return this.http
      .get<Shift[]>(`${this.apiUrl}/shifts`, {
        headers: this.getHeaders(),
        params: { organizationId: orgId, unitId },
      })
      .pipe(
        catchError((err) => {
          console.error('[ShiftService] getByUnit failed:', err);
          return throwError(() => err);
        }),
      );
  }

  getById(id: string): Observable<Shift> {
    return this.http.get<Shift>(`${this.apiUrl}/shifts/${id}`, { headers: this.getHeaders() }).pipe(
      catchError((err) => {
        console.error('[ShiftService] getById failed:', err);
        return throwError(() => err);
      }),
    );
  }

  create(data: {
    name: string;
    type: string;
    startTime: string;
    endTime: string;
  }): Observable<Shift> {
    const orgId = this.getOrganizationId();
    const unitId = this.getUnitId();
    return this.http
      .post<Shift>(
        `${this.apiUrl}/shifts`,
        {
          ...data,
          durationHours: this.calculateDuration(data.startTime, data.endTime),
          organizationId: orgId,
          unitId,
        },
        { headers: this.getHeaders() },
      )
      .pipe(
        catchError((err) => {
          console.error('[ShiftService] create failed:', err);
          return throwError(() => err);
        }),
      );
  }

  update(id: string, data: Partial<Shift>): Observable<Shift> {
    return this.http
      .put<Shift>(`${this.apiUrl}/shifts/${id}`, data, { headers: this.getHeaders() })
      .pipe(
        catchError((err) => {
          console.error('[ShiftService] update failed:', err);
          return throwError(() => err);
        }),
      );
  }

  delete(id: string): Observable<void> {
    return this.http
      .delete<void>(`${this.apiUrl}/shifts/${id}`, { headers: this.getHeaders() })
      .pipe(
        catchError((err) => {
          console.error('[ShiftService] delete failed:', err);
          return throwError(() => err);
        }),
      );
  }

  private calculateDuration(startTime: string, endTime: string): number {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    if (endMinutes <= startMinutes) endMinutes += 24 * 60;
    return (endMinutes - startMinutes) / 60;
  }
}
