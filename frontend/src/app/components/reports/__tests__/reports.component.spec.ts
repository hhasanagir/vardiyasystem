// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ReportsComponent } from '../reports.component';
import { ScheduleService } from '../../../services/schedule.service';

describe('ReportsComponent', () => {
  let component: ReportsComponent;

  beforeEach(() => {
    const injector = Injector.create({
      providers: [
        MessageService,
        {
          provide: ScheduleService,
          useValue: {
            getAnalytics: vi.fn(() =>
              of({
                totalShifts: 10,
                nightShifts: 2,
                weekendShifts: 0,
                emptyShifts: 2,
                averageHoursPerEmployee: 8,
                fairnessScore: 90,
                coveragePercent: 80,
              }),
            ),
            getEmployeeWorkload: vi.fn(() => of([])),
            loadSchedules: vi.fn(() => of({ schedules: [], total: 0, page: 1, pageSize: 20 })),
          },
        },
      ],
    });

    component = runInInjectionContext(injector, () => new ReportsComponent());
    component.ngOnInit();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have overview report active by default', () => {
    expect(component.activeReport()).toBe('overview');
  });

  it('should switch report tabs correctly', () => {
    component.setActiveReport('daily');
    expect(component.activeReport()).toBe('daily');

    component.setActiveReport('employee');
    expect(component.activeReport()).toBe('employee');

    component.setActiveReport('unit');
    expect(component.activeReport()).toBe('unit');
  });

  it('should default to May 2026', () => {
    expect(component.selectedMonth().getFullYear()).toBe(2026);
    expect(component.selectedMonth().getMonth()).toBe(4);
  });

  it('should compute the month label', () => {
    expect(component.monthLabel()).toContain('Mayıs');
  });

  it('should return initials from a full name', () => {
    expect(component.getInitials('Tekniker Test')).toBe('TT');
  });

  it('should populate analytics from the schedule service', () => {
    expect(component.analytics()).toBeDefined();
    expect(component.analytics()?.totalShifts).toBe(10);
  });

  it('should derive total summary from analytics', () => {
    expect(component.loading()).toBe(false);
    const summary = component.totalSummary();
    expect(summary.totalShifts).toBe(10);
    expect(summary.filledShifts).toBe(8);
    expect(summary.emptyShifts).toBe(2);
    expect(summary.coverage).toBe(80);
  });
});