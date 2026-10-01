import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../environments';
import { SwapRequest, CreateSwapRequest } from '../domain/models';

@Injectable({ providedIn: 'root' })
export class SwapRequestService {
  private apiUrl = environment.apiUrl;
  private http = inject(HttpClient);

  create(dto: CreateSwapRequest): Observable<SwapRequest> {
    return this.http.post<SwapRequest>(`${this.apiUrl}/swap-requests`, dto).pipe(
      catchError((err) => {
        console.error('[SwapRequestService] create failed:', err);
        return throwError(() => err);
      }),
    );
  }

  getAll(): Observable<SwapRequest[]> {
    return this.http.get<SwapRequest[]>(`${this.apiUrl}/swap-requests`).pipe(
      catchError((err) => {
        console.error('[SwapRequestService] getAll failed:', err);
        return throwError(() => err);
      }),
    );
  }

  approve(id: string): Observable<SwapRequest> {
    return this.http.patch<SwapRequest>(`${this.apiUrl}/swap-requests/${id}/approve`, {}).pipe(
      catchError((err) => {
        console.error('[SwapRequestService] approve failed:', err);
        return throwError(() => err);
      }),
    );
  }

  reject(id: string): Observable<SwapRequest> {
    return this.http.patch<SwapRequest>(`${this.apiUrl}/swap-requests/${id}/reject`, {}).pipe(
      catchError((err) => {
        console.error('[SwapRequestService] reject failed:', err);
        return throwError(() => err);
      }),
    );
  }
}
