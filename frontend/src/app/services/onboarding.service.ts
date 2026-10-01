import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ScheduleService, ScheduleAnalytics } from './schedule.service';

export type OnboardingStep =
  | 'welcome'
  | 'demo'
  | 'generate'
  | 'interact'
  | 'scenario'
  | 'insights'
  | 'cta';

@Injectable({ providedIn: 'root' })
export class OnboardingService {
  constructor(private scheduleService: ScheduleService) {}

  getFairnessScore(startDate?: string, endDate?: string): Observable<ScheduleAnalytics> {
    return this.scheduleService.getAnalytics(startDate, endDate);
  }

  completeAndStart(): void {
    localStorage.setItem('onboarding_completed', 'true');
  }

  isCompleted(): boolean {
    return localStorage.getItem('onboarding_completed') === 'true';
  }

  reset(): void {
    localStorage.removeItem('onboarding_completed');
  }
}
