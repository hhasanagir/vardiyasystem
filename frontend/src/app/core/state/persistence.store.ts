import { Injectable, inject, effect } from '@angular/core';
import { ScheduleStore } from './schedule.store';
import { MetricsStore } from './metrics.store';
import { UnitStore } from './unit.store';
import { ApiService, ScheduleApiResponse } from '../../services/api.service';
import { Schedule, ShiftAssignment, Device, Personnel } from './state.models';

const STORAGE_KEYS = {
  SCHEDULES: 'vardiya_schedules',
  METRICS: 'vardiya_metrics',
  PREFERENCES: 'vardiya_preferences',
  DEVICES: 'vardiya_devices',
  PERSONNEL: 'vardiya_personnel',
} as const;

export interface StoredSchedule {
  key: string;
  schedule: Schedule;
  savedAt: Date;
}

export interface UserPreferences {
  sidebarExpanded: boolean;
  selectedUnit: string;
  theme: 'dark' | 'light';
  notifications: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class PersistenceStore {
  private scheduleStore = inject(ScheduleStore);
  private metricsStore = inject(MetricsStore);
  private unitStore = inject(UnitStore);
  private apiService = inject(ApiService);

  private readonly schedulesKey = STORAGE_KEYS.SCHEDULES;
  private readonly preferencesKey = STORAGE_KEYS.PREFERENCES;
  private readonly devicesKey = STORAGE_KEYS.DEVICES;
  private readonly personnelKey = STORAGE_KEYS.PERSONNEL;

  constructor() {
    this.initializeAutoSave();
  }

  async saveScheduleToApi(
    unitId: string,
    month: number,
    year: number,
    assignments: ShiftAssignment[],
  ): Promise<boolean> {
    try {
      const schedule = await this.apiService
        .get<ScheduleApiResponse>(`/schedules/unit/${unitId}?month=${month}&year=${year}`)
        .toPromise();

      if (schedule && schedule.id) {
        await this.apiService
          .put(`/schedules/${schedule.id}`, {
            assignments: assignments.map((a) => ({
              personnelId: a.personnelId,
              deviceId: a.deviceId,
              date: a.date,
              shiftType: a.shiftType,
              startTime: a.startTime,
              endTime: a.endTime,
            })),
          })
          .toPromise();
      } else {
        await this.apiService
          .post('/schedules', {
            unitId,
            month,
            year,
            assignments: assignments.map((a) => ({
              personnelId: a.personnelId,
              deviceId: a.deviceId,
              date: a.date,
              shiftType: a.shiftType,
              startTime: a.startTime,
              endTime: a.endTime,
            })),
          })
          .toPromise();
      }

      this.saveToLocalCache(unitId, month, year, assignments);
      return true;
    } catch (error) {
      console.error('Failed to save schedule to API:', error);
      this.saveToLocalCache(unitId, month, year, assignments);
      return false;
    }
  }

  async loadScheduleFromApi(unitId: string, month: number, year: number): Promise<Schedule | null> {
    try {
      const schedule = await this.apiService
        .get<ScheduleApiResponse>(`/schedules/unit/${unitId}?month=${month}&year=${year}`)
        .toPromise();

      if (schedule) {
        const parsed = this.parseApiSchedule(schedule);
        this.saveToLocalCache(unitId, month, year, parsed.assignments);
        return parsed;
      }

      return this.loadFromLocalCache(unitId, month, year);
    } catch (error) {
      console.error('Failed to load schedule from API:', error);
      return this.loadFromLocalCache(unitId, month, year);
    }
  }

  private saveToLocalCache(
    unit: string,
    month: number,
    year: number,
    assignments: ShiftAssignment[],
  ): void {
    try {
      const key = `schedule_${unit}_${year}_${month}`;
      localStorage.setItem(
        key,
        JSON.stringify({
          assignments,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch (error) {
      console.error('Failed to save to local cache:', error);
    }
  }

  private loadFromLocalCache(unit: string, month: number, year: number): Schedule | null {
    try {
      const key = `schedule_${unit}_${year}_${month}`;
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const data = JSON.parse(cached);
      return {
        id: key,
        unit: unit as any,
        month,
        year,
        assignments: data.assignments || [],
        version: 1,
        status: 'draft',
        createdAt: new Date(data.savedAt),
        updatedAt: new Date(data.savedAt),
      };
    } catch {
      return null;
    }
  }

  private parseApiSchedule(apiSchedule: ScheduleApiResponse): Schedule {
    return {
      id: apiSchedule.id,
      unit: apiSchedule.unitId as any,
      month: apiSchedule.month,
      year: apiSchedule.year,
      version: apiSchedule.version,
      status: apiSchedule.status,
      assignments: apiSchedule.assignments.map((a) => ({
        id: a.id,
        deviceId: a.deviceId,
        personnelId: a.personnelId,
        date: a.date,
        shiftType: a.shiftType,
        startTime: a.startTime,
        endTime: a.endTime,
        isConfirmed: a.isConfirmed,
      })),
      createdAt: new Date(apiSchedule.createdAt),
      updatedAt: new Date(apiSchedule.updatedAt),
    };
  }

  saveSchedules(): boolean {
    try {
      const data = this.scheduleStore.toJSON();
      const serialized = JSON.stringify({
        ...data,
        schedules: this.serializeSchedules(data['schedules'] as Record<string, Schedule>),
        savedAt: new Date().toISOString(),
      });
      localStorage.setItem(this.schedulesKey, serialized);
      return true;
    } catch (error) {
      console.error('Failed to save schedules:', error);
      return false;
    }
  }

  loadSchedules(): Map<string, Schedule> {
    try {
      const stored = localStorage.getItem(this.schedulesKey);
      if (!stored) return new Map();

      const data = JSON.parse(stored);
      const schedulesMap = new Map<string, Schedule>();

      if (data.schedules) {
        for (const [key, schedule] of Object.entries(data.schedules)) {
          const parsed = this.deserializeSchedule(schedule as Record<string, unknown>);
          if (parsed) {
            schedulesMap.set(key, parsed);
          }
        }
      }

      return schedulesMap;
    } catch (error) {
      console.error('Failed to load schedules:', error);
      return new Map();
    }
  }

  saveScheduleForUnit(unit: string, month: number, year: number, schedule: Schedule): boolean {
    try {
      const existing = this.loadAllStoredSchedules();
      const key = `${unit}-${year}-${month}`;
      existing[key] = {
        key,
        schedule,
        savedAt: new Date(),
      };

      localStorage.setItem(this.schedulesKey, JSON.stringify(existing));
      return true;
    } catch (error) {
      console.error('Failed to save schedule:', error);
      return false;
    }
  }

  loadScheduleForUnit(unit: string, month: number, year: number): Schedule | null {
    try {
      const all = this.loadAllStoredSchedules();
      const key = `${unit}-${year}-${month}`;
      const stored = all[key];

      if (stored) {
        return this.deserializeSchedule(stored.schedule as unknown as Record<string, unknown>);
      }

      return null;
    } catch (error) {
      console.error('Failed to load schedule:', error);
      return null;
    }
  }

  private loadAllStoredSchedules(): Record<string, StoredSchedule> {
    try {
      const stored = localStorage.getItem(this.schedulesKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }

  saveDevices(devices: Device[]): boolean {
    try {
      localStorage.setItem(this.devicesKey, JSON.stringify(devices));
      return true;
    } catch (error) {
      console.error('Failed to save devices:', error);
      return false;
    }
  }

  loadDevices(): Device[] {
    try {
      const stored = localStorage.getItem(this.devicesKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  savePersonnel(personnel: Personnel[]): boolean {
    try {
      localStorage.setItem(this.personnelKey, JSON.stringify(personnel));
      return true;
    } catch (error) {
      console.error('Failed to save personnel:', error);
      return false;
    }
  }

  loadPersonnel(): Personnel[] {
    try {
      const stored = localStorage.getItem(this.personnelKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  savePreferences(preferences: UserPreferences): boolean {
    try {
      localStorage.setItem(
        this.preferencesKey,
        JSON.stringify({
          ...preferences,
          savedAt: new Date().toISOString(),
        }),
      );
      return true;
    } catch (error) {
      console.error('Failed to save preferences:', error);
      return false;
    }
  }

  loadPreferences(): UserPreferences | null {
    try {
      const stored = localStorage.getItem(this.preferencesKey);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  }

  clearAll(): void {
    try {
      localStorage.removeItem(this.schedulesKey);
      localStorage.removeItem(this.preferencesKey);
      localStorage.removeItem(this.devicesKey);
      localStorage.removeItem(this.personnelKey);
    } catch (error) {
      console.error('Failed to clear storage:', error);
    }
  }

  clearSchedules(): void {
    try {
      localStorage.removeItem(this.schedulesKey);
    } catch (error) {
      console.error('Failed to clear schedules:', error);
    }
  }

  exportAllData(): string {
    const data = {
      schedules: this.loadAllStoredSchedules(),
      devices: this.loadDevices(),
      personnel: this.loadPersonnel(),
      preferences: this.loadPreferences(),
      exportedAt: new Date().toISOString(),
    };
    return JSON.stringify(data, null, 2);
  }

  importData(jsonData: string): { success: boolean; message: string } {
    try {
      const data = JSON.parse(jsonData);

      if (data.schedules) {
        localStorage.setItem(this.schedulesKey, JSON.stringify(data.schedules));
      }
      if (data.devices) {
        localStorage.setItem(this.devicesKey, JSON.stringify(data.devices));
      }
      if (data.personnel) {
        localStorage.setItem(this.personnelKey, JSON.stringify(data.personnel));
      }
      if (data.preferences) {
        localStorage.setItem(this.preferencesKey, JSON.stringify(data.preferences));
      }

      return { success: true, message: 'Veriler başarıyla içe aktarıldı' };
    } catch (error) {
      return { success: false, message: 'İçe aktarma başarısız: Geçersiz veri formatı' };
    }
  }

  getStorageUsage(): { used: number; available: number; percentage: number } {
    let used = 0;
    for (const key of Object.values(STORAGE_KEYS)) {
      const item = localStorage.getItem(key);
      if (item) {
        used += item.length * 2;
      }
    }

    const maxSize = 5 * 1024 * 1024;
    return {
      used,
      available: maxSize - used,
      percentage: Math.round((used / maxSize) * 100),
    };
  }

  private serializeSchedules(schedules: Record<string, Schedule>): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    for (const [key, schedule] of Object.entries(schedules)) {
      result[key] = {
        ...schedule,
        createdAt: schedule.createdAt?.toISOString(),
        updatedAt: schedule.updatedAt?.toISOString(),
        assignments: schedule.assignments.map((a) => ({
          ...a,
          createdAt: a.createdAt?.toISOString(),
          updatedAt: a.updatedAt?.toISOString(),
        })),
      };
    }

    return result;
  }

  private deserializeSchedule(data: Record<string, unknown>): Schedule | null {
    try {
      const assignments = ((data['assignments'] as Array<Record<string, unknown>>) || []).map(
        (a) => ({
          id: a['id'] as string,
          deviceId: a['deviceId'] as string,
          personnelId: a['personnelId'] as string,
          date: a['date'] as string,
          shiftType: a['shiftType'] as 'day' | 'evening' | 'night',
          startTime: a['startTime'] as string,
          endTime: a['endTime'] as string,
          isConfirmed: a['isConfirmed'] as boolean,
          createdAt: a['createdAt'] ? new Date(a['createdAt'] as string) : undefined,
          updatedAt: a['updatedAt'] ? new Date(a['updatedAt'] as string) : undefined,
        }),
      );

      return {
        id: data['id'] as string,
        unit: data['unit'] as 'mr' | 'bt' | 'rontgen' | 'nukleer',
        month: data['month'] as number,
        year: data['year'] as number,
        assignments,
        version: data['version'] as number,
        createdAt: new Date(data['createdAt'] as string),
        updatedAt: new Date(data['updatedAt'] as string),
        status: data['status'] as 'draft' | 'published' | 'archived',
      };
    } catch {
      return null;
    }
  }

  private initializeAutoSave(): void {
    effect(() => {
      const schedules = this.scheduleStore.schedules();
      if (schedules.length > 0) {
        this.saveSchedules();
      }
    });
  }
}
