import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/api/api.service';

export interface DutyRosterEntry {
  id: string;
  organizationId: string;
  unitId?: string;
  deviceId?: string;
  personnelId: string;
  date: string;
  shiftType: string;
  role: string;
  startTime: string;
  endTime: string;
  notes?: string;
  isActive: boolean;
  personnel?: { id: string; name: string; role: string };
  unit?: { id: string; name: string; code: string };
  device?: { id: string; name: string; code: string };
}

export interface DutyRosterCalendarDay {
  date: string;
  entries: DutyRosterEntry[];
  shiftSummary: { day: number; evening: number; night: number };
}

export interface CreateDutyRosterEntry {
  unitId?: string;
  deviceId?: string;
  personnelId: string;
  date: string;
  shiftType: string;
  role: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

export interface UpdateDutyRosterEntry {
  role?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  isActive?: boolean;
}

export interface DutyRosterFilter {
  date?: string;
  startDate?: string;
  endDate?: string;
  unitId?: string;
  deviceId?: string;
  personnelId?: string;
  shiftType?: string;
  role?: string;
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class DutyRosterService {
  private readonly api = inject(ApiService);
  private readonly basePath = '/duty-roster';

  findAll(filter?: DutyRosterFilter): Observable<DutyRosterEntry[]> {
    const params: Record<string, string> = {};
    if (filter) {
      for (const [key, value] of Object.entries(filter)) {
        if (value !== undefined && value !== null) {
          params[key] = String(value);
        }
      }
    }
    return this.api.get<DutyRosterEntry[]>(this.basePath, { params });
  }

  findById(id: string): Observable<DutyRosterEntry> {
    return this.api.get<DutyRosterEntry>(`${this.basePath}/${id}`);
  }

  getCalendar(month: number, year: number): Observable<DutyRosterCalendarDay[]> {
    return this.api.get<DutyRosterCalendarDay[]>(`${this.basePath}/calendar`, {
      params: { month: month.toString(), year: year.toString() },
    });
  }

  create(dto: CreateDutyRosterEntry): Observable<DutyRosterEntry> {
    return this.api.post<DutyRosterEntry>(this.basePath, dto);
  }

  update(id: string, dto: UpdateDutyRosterEntry): Observable<DutyRosterEntry> {
    return this.api.put<DutyRosterEntry>(`${this.basePath}/${id}`, dto);
  }

  remove(id: string): Observable<void> {
    return this.api.delete<void>(`${this.basePath}/${id}`);
  }

  softRemove(id: string): Observable<void> {
    return this.api.delete<void>(`${this.basePath}/${id}/soft`);
  }
}
