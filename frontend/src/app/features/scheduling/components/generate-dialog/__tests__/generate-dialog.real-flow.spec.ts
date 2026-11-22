import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GenerateDialogComponent } from '../generate-dialog.component';
import { ScheduleStore } from '../../../store/schedule.store';
import { ScheduleCommandService } from '../../../services/schedule-command.service';
import { ScheduleService } from '../../../../../services/schedule.service';
import { RbacService } from '../../../../../services/rbac.service';

const VALIDATION = {
  hardViolations: { total: 2 },
  softViolations: { total: 1 },
  score: { overall: 88 },
};

interface Harness {
  component: GenerateDialogComponent;
  store: any;
  cmd: any;
  scheduleService: any;
  rbac: any;
}

async function build(unitType: string | null = 'mr', assignments: unknown[] = [{ personnelId: 'p1' }]): Promise<Harness> {
  const store = {
    schedule: signal<any>({ id: 's-1', unitId: 'unit-uuid-1', month: 11, year: 2026, version: 3 }),
    assignmentCount: signal(0),
    setGenerating: vi.fn(),
    loadSchedule: vi.fn(),
  };
  const cmd = {
    loadSchedule: vi.fn(() => of({ id: 's-1' })),
    validate: vi.fn(() => of(VALIDATION)),
  };
  const scheduleService = {
    generateSchedule: vi.fn(() => of({ assignments })),
    applyGeneratedSchedule: vi.fn(() => of({ created: assignments.length })),
  };
  const rbac = { resolveUnitTypeById: vi.fn(async () => unitType ?? undefined) };

  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [GenerateDialogComponent],
    providers: [
      { provide: ScheduleStore, useValue: store },
      { provide: ScheduleCommandService, useValue: cmd },
      { provide: ScheduleService, useValue: scheduleService },
      { provide: RbacService, useValue: rbac },
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(GenerateDialogComponent);
  return { component: fixture.componentInstance, store, cmd, scheduleService, rbac };
}

describe('GenerateDialogComponent — real generation flow (P1-A2)', () => {
  let h: Harness;

  beforeEach(async () => {
    h = await build();
  });

  it('runs generate → apply → reload → validate and reports real server numbers', async () => {
    h.store.assignmentCount.set(7);

    await h.component.onGenerate();

    expect(h.rbac.resolveUnitTypeById).toHaveBeenCalledWith('unit-uuid-1');
    expect(h.scheduleService.generateSchedule).toHaveBeenCalledWith(expect.objectContaining({
      unitType: 'mr', month: 11, year: 2026, minRestHours: 11, maxConsecutiveDays: 6,
    }));
    expect(h.scheduleService.applyGeneratedSchedule).toHaveBeenCalledWith(
      's-1', [{ personnelId: 'p1' }], 3,
    );
    expect(h.cmd.loadSchedule).toHaveBeenCalledWith('s-1');
    expect(h.cmd.validate).toHaveBeenCalledWith('s-1');

    expect(h.component.resultAssignments()).toBe(7);
    expect(h.component.resultViolations()).toBe(2);
    expect(h.component.resultWarnings()).toBe(1);
    expect(h.component.resultScore()).toBe(88);
    expect(h.component.resultTime()).toBeGreaterThanOrEqual(0);
    expect(h.component.resultAlgorithm()).toBe('genetik optimizasyon');
    expect(h.component.resultMode()).toBe(true);
    expect(h.component.generating()).toBe(false);
  });

  it('fails closed and does not call the API when the unit type is unresolved', async () => {
    const blocked = await build(null);

    await blocked.component.onGenerate();

    expect(blocked.scheduleService.generateSchedule).not.toHaveBeenCalled();
    expect(blocked.scheduleService.applyGeneratedSchedule).not.toHaveBeenCalled();
    expect(blocked.component.error()).toContain('birim tipi çözümlenemedi');
    expect(blocked.component.resultMode()).toBe(false);
  });

  it('does not apply anything when generation returns no assignments', async () => {
    const empty = await build('mr', []);

    await empty.component.onGenerate();

    expect(empty.scheduleService.generateSchedule).toHaveBeenCalled();
    expect(empty.scheduleService.applyGeneratedSchedule).not.toHaveBeenCalled();
    expect(empty.cmd.validate).not.toHaveBeenCalled();
    expect(empty.component.resultMode()).toBe(false);
  });

  it('uses measured elapsed time instead of a synthetic random duration', async () => {
    const fresh = await build();
    const clock = [1_000, 3_600];
    vi.spyOn(Date, 'now').mockImplementation(() => clock.shift() ?? 3_600);
    try {
      await fresh.component.onGenerate();
      expect(fresh.component.resultTime()).toBe(2.6);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
