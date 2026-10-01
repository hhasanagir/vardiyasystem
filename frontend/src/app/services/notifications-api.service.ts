import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../environments';

export interface NotificationItem {
  id: string;
  organizationId: string;
  type: string;
  priority: string;
  title: string;
  message: string;
  data?: Record<string, unknown>;
  senderId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  recipients: {
    isRead: boolean;
    readAt?: string;
    isDeleted: boolean;
  }[];
}

export interface NotificationRecipientInfo {
  id: string;
  notificationId: string;
  userId: string;
  isRead: boolean;
  readAt?: string;
  isDeleted: boolean;
  createdAt: string;
  notification: NotificationItem;
}

export interface UnreadCountByType {
  type: string;
  count: number;
}

export interface NotificationPreferences {
  pushEnabled: boolean;
  emailEnabled: boolean;
  smsEnabled: boolean;
  announcementEnabled: boolean;
  trainingReminders: boolean;
  scheduleReminders: boolean;
  emergencyAlerts: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

@Injectable({ providedIn: 'root' })
export class NotificationsApiService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/notifications`;

  getMyNotifications(params?: {
    page?: number;
    limit?: number;
    type?: string;
    priority?: string;
    isRead?: boolean;
  }): Observable<PaginatedResponse<NotificationRecipientInfo>> {
    let httpParams = new HttpParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) httpParams = httpParams.set(k, String(v));
      });
    }
    return this.http.get<PaginatedResponse<NotificationRecipientInfo>>(this.apiUrl, {
      params: httpParams,
    });
  }

  getUnreadCount(): Observable<{ count: number }> {
    return this.http.get<{ count: number }>(`${this.apiUrl}/unread-count`);
  }

  getUnreadByType(): Observable<UnreadCountByType[]> {
    return this.http.get<UnreadCountByType[]>(`${this.apiUrl}/unread-by-type`);
  }

  getById(id: string): Observable<NotificationRecipientInfo> {
    return this.http.get<NotificationRecipientInfo>(`${this.apiUrl}/${id}`);
  }

  markRead(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/read`, {});
  }

  markAllRead(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/read-all`, {});
  }

  markClicked(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/${id}/clicked`, {});
  }

  delete(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }

  getPreferences(): Observable<NotificationPreferences> {
    return this.http.get<NotificationPreferences>(`${this.apiUrl}/preferences`);
  }

  updatePreferences(prefs: Partial<NotificationPreferences>): Observable<NotificationPreferences> {
    return this.http.post<NotificationPreferences>(`${this.apiUrl}/preferences`, prefs);
  }

  getStats(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/stats/overview`);
  }

  getFailedDeliveries(): Observable<any[]> {
    return this.http.get<any[]>(`${this.apiUrl}/stats/failed`);
  }

  retryFailed(id: string): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/stats/failed/${id}/retry`, {});
  }
}
