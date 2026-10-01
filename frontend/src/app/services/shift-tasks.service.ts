import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';

export interface ShiftTask {
  id: string;
  userId: string;
  date: string;
  taskType: string;
  label: string;
  status: 'pending' | 'completed' | 'skipped';
  completedAt: string | null;
}

export interface TaskProgress {
  completed: number;
  total: number;
  percentage: number;
}

export interface TaskSummary {
  tasks: ShiftTask[];
  progress: TaskProgress;
}

@Injectable({ providedIn: 'root' })
export class ShiftTasksService {
  private http = inject(HttpClient);
  private baseUrl = '/api/v1/shift-tasks';

  getTodayTasks(): Observable<ShiftTask[]> {
    return this.http.get<ShiftTask[]>(`${this.baseUrl}/`).pipe(
      catchError((err) => {
        console.error('ShiftTasks getTodayTasks failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getTasksByDate(date: string): Observable<ShiftTask[]> {
    return this.http.get<ShiftTask[]>(`${this.baseUrl}/${date}`).pipe(
      catchError((err) => {
        console.error('ShiftTasks getTasksByDate failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getProgress(date: string): Observable<TaskProgress> {
    return this.http.get<TaskProgress>(`${this.baseUrl}/${date}/progress`).pipe(
      catchError((err) => {
        console.error('ShiftTasks getProgress failed:', err);
        return throwError(() => err);
      }),
    );
  }

  updateTaskStatus(
    taskId: string,
    status: 'pending' | 'completed' | 'skipped',
  ): Observable<ShiftTask> {
    return this.http.patch<ShiftTask>(`${this.baseUrl}/${taskId}`, { status }).pipe(
      catchError((err) => {
        console.error('ShiftTasks updateTaskStatus failed:', err);
        return throwError(() => err);
      }),
    );
  }
}
