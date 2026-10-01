import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../core/api/api.service';

export interface HandoverNote {
  id: string;
  userId: string;
  unitId: string;
  deviceId: string | null;
  shiftType: string | null;
  title: string;
  content: string;
  priority: 'info' | 'warning' | 'critical';
  status: 'active' | 'resolved';
  readBy: string[];
  isReadByMe: boolean;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; role: string };
  unit: { id: string; name: string };
  device: { id: string; name: string; code: string } | null;
}

export interface HandoverNotesResponse {
  data: HandoverNote[];
  total: number;
}

export interface UnreadCountResponse {
  count: number;
}

export interface CreateHandoverNotePayload {
  unitId: string;
  deviceId?: string;
  shiftType?: string;
  title: string;
  content: string;
  priority?: 'info' | 'warning' | 'critical';
}

export interface UpdateHandoverNotePayload {
  title?: string;
  content?: string;
  priority?: 'info' | 'warning' | 'critical';
  status?: 'active' | 'resolved';
}

@Injectable({ providedIn: 'root' })
export class HandoverNotesService {
  private api = inject(ApiService);

  getNotes(params?: Record<string, string>): Observable<HandoverNotesResponse> {
    return this.api.get<HandoverNotesResponse>('/handover-notes', { params });
  }

  getNote(id: string): Observable<HandoverNote> {
    return this.api.get<HandoverNote>(`/handover-notes/${id}`);
  }

  createNote(payload: CreateHandoverNotePayload): Observable<HandoverNote> {
    return this.api.post<HandoverNote>('/handover-notes', payload);
  }

  updateNote(id: string, payload: UpdateHandoverNotePayload): Observable<HandoverNote> {
    return this.api.patch<HandoverNote>(`/handover-notes/${id}`, payload);
  }

  markAsRead(id: string): Observable<HandoverNote> {
    return this.api.patch<HandoverNote>(`/handover-notes/${id}/read`, {});
  }

  getUnreadCount(): Observable<UnreadCountResponse> {
    return this.api.get<UnreadCountResponse>('/handover-notes/unread-count');
  }
}
