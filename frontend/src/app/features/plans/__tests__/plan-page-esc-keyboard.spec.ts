import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
// resolveComponentResources is not a public named export of `@angular/core`
// (it is re-exported there only under a dev-gated `?`-aliased name), so it is
// imported directly from the internal core chunk.
import { resolveComponentResources } from '../../../../../node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';
import { PlanPageComponent } from '../plan-page.component';
import { ScheduleStore } from '../../../core/state';
import { ScheduleService } from '../../../services/schedule.service';
import { NotificationService } from '../../../services/notification.service';
import { WebSocketService } from '../../../services/websocket.service';
import { AuthService } from '../../../services/auth.service';
import { AuthorizationService } from '../../../services/authorization.service';
import { ApiService } from '../../../core/api/api.service';

/**
 * P3.2 — ESC keyboard: the open context menu must close through the existing
 * close/dismiss mechanism (`closeContextMenu()`), and ESC with the menu closed
 * must not mutate any schedule/assignment state.
 */
function collectFiles(dir: string, map: Map<string, string>): void {
  for (const entry of readdirSync(dir)) {
    const p = resolve(dir, entry);
    if (statSync(p).isDirectory()) {
      collectFiles(p, map);
    } else {
      map.set(entry, p);
    }
  }
}

describe('P3.2 — PlanPageComponent ESC context-menu close', () => {
  let component: PlanPageComponent;
  let fixture: ComponentFixture<PlanPageComponent>;

  beforeAll(async () => {
    // The vitest harness does not JIT-resolve `templateUrl`/`styleUrls` like the
    // webpack-based CLI does, so prime Angular's resource-resolution queue from
    // disk (plain string loader, same contract the compiler uses).
    const here = dirname(fileURLToPath(import.meta.url));
    const srcDir = resolve(here, '..', '..', '..', '..');
    const byName = new Map<string, string>();
    collectFiles(srcDir, byName);
    try {
      (PlanPageComponent as unknown as { ɵcmp?: unknown }).ɵcmp;
    } catch {
      /* expected: resources not yet resolved on first def access */
    }
    await resolveComponentResources((url: string) => {
      const filename = url.split('/').pop() ?? url;
      const target = byName.get(filename);
      if (!target) {
        throw new Error(`P3.2 spec: cannot locate resource file for '${url}' under ${srcDir}`);
      }
      return Promise.resolve(readFileSync(target, 'utf8'));
    });
  });

  beforeEach(async () => {
    const scheduleStoreStub = {
      selectedMonth: () => 5,
      selectedYear: () => 2026,
      selectedUnit: () => 'mr' as const,
      setSelectedUnit: () => {},
      setSchedule: () => {},
    };

    TestBed.overrideComponent(PlanPageComponent, {
      set: { template: '<div></div>', styleUrls: [], styles: [] },
    });
    await TestBed.configureTestingModule({
      imports: [PlanPageComponent],
      providers: [
        { provide: ScheduleStore, useValue: scheduleStoreStub },
        {
          provide: ScheduleService,
          useValue: {
            loadScheduleByUnit: () => of({ id: 'sched-1', unit: 'mr', month: 5, year: 2026, status: 'draft', version: 1, assignments: [], devices: [] }),
            getScheduleAlerts: () => of([]),
            getDeviceOffDates: () => of([]),
          },
        },
        { provide: ApiService, useValue: {} },
        { provide: NotificationService, useValue: { info: () => {}, success: () => {}, error: () => {} } },
        { provide: WebSocketService, useValue: { alert$: of(null) } },
        { provide: AuthService, useValue: { user: () => ({ id: 'u1', role: 'supervisor' as const, unitId: 'mr' }) } },
        { provide: AuthorizationService, useValue: { canManageUnit: () => Promise.resolve(true), canMutate: () => true } },
        { provide: ActivatedRoute, useValue: { data: of({ unit: 'mr' }) } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PlanPageComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function openContextMenu(): void {
    component.onContextMenu({
      event: { clientX: 120, clientY: 80 } as MouseEvent,
      deviceId: 'dev-1',
      date: '2026-05-10',
      shiftType: 'day',
      personnelName: 'Ahmet',
      personnelId: 'p1',
    });
    fixture.detectChanges();
  }

  function pressEscape(): void {
    const event = new KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
  }

  it('should not have a context menu open initially', () => {
    expect(component.contextMenu()).toBeNull();
  });

  it('ESC closes an open context menu via the existing closeContextMenu mechanism', () => {
    openContextMenu();
    expect(component.contextMenu()?.visible).toBe(true);

    pressEscape();

    expect(component.contextMenu()).toBeNull();
  });

  it('ESC with the menu closed leaves schedule/assignment state untouched', () => {
    // Menu already closed; capture the baseline assignment state.
    const viewStateBefore = component.viewState();
    const membersBefore = JSON.stringify(component.contextMenu());

    pressEscape();

    expect(component.contextMenu()).toBeNull();
    expect(JSON.stringify(component.contextMenu())).toBe(membersBefore);
    expect(component.viewState()).toEqual(viewStateBefore);
  });
});