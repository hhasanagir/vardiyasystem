import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface TodayAttendance {
  date: string;
  status: 'none' | 'active' | 'completed';
  clockIn: string | null;
  clockOut: string | null;
  assignment: any;
}

export interface AttendanceHistoryItem {
  id: string;
  date: string;
  status: string;
  clockIn: string;
  clockOut: string;
  duration: number | null;
  deviceName: string | null;
}

export interface MonthlyStats {
  totalDays: number;
  totalHours: number;
  avgHoursPerDay: number;
  onTimeRate: number;
  overtimeHours?: number;
  nightShifts?: number;
  weekendShifts?: number;
  completedShifts?: number;
  mostUsedDevice?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/attendance';

  getToday(): Observable<TodayAttendance> {
    return this.http.get<TodayAttendance>(`${this.baseUrl}/today`).pipe(
      catchError(err => {
        console.error('Attendance getToday failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getHistory(limit = 30): Observable<AttendanceHistoryItem[]> {
    return this.http.get<AttendanceHistoryItem[]>(`${this.baseUrl}/history?limit=${limit}`).pipe(
      catchError(err => {
        console.error('Attendance getHistory failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getStats(month: number, year: number): Observable<MonthlyStats> {
    return this.http.get<MonthlyStats>(`${this.baseUrl}/stats?month=${month}&year=${year}`).pipe(
      catchError(err => {
        console.error('Attendance getStats failed:', err);
        return throwError(() => err);
      }),
    );
  }

  clockIn(assignmentId?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/clock-in`, { assignmentId }).pipe(
      catchError(err => {
        console.error('Attendance clockIn failed:', err);
        return throwError(() => err);
      }),
    );
  }

  clockOut(): Observable<any> {
    return this.http.post(`${this.baseUrl}/clock-out`, {}).pipe(
      catchError(err => {
        console.error('Attendance clockOut failed:', err);
        return throwError(() => err);
      }),
    );
  }
}
