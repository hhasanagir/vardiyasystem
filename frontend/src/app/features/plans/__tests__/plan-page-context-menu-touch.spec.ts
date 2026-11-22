import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
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
 * P3.3 — the plan-page context menu must clamp inside the viewport (mobile
 * long-press opens the menu with raw clientX/clientY near the screen edge) and
 * still dismiss cleanly.
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

describe('P3.3 — PlanPageComponent context-menu viewport clamping', () => {
  let component: PlanPageComponent;
  let fixture: ComponentFixture<PlanPageComponent>;

  beforeAll(async () => {
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
        throw new Error(`P3.3 spec: cannot locate resource file for '${url}' under ${srcDir}`);
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

  function openContextMenuAt(clientX: number, clientY: number): void {
    component.onContextMenu({
      event: { clientX, clientY } as MouseEvent,
      deviceId: 'dev-1',
      date: '2026-05-10',
      shiftType: 'day',
      personnelName: 'Ahmet',
      personnelId: 'p1',
    });
    fixture.detectChanges();
  }

  it('keeps the context menu inside the viewport when opened near the right/bottom edge', () => {
    const menuWidth = 224;
    const menuHeight = 200;
    const margin = 8;
    const expectedX = Math.max(margin, Math.min(9999, window.innerWidth - menuWidth - margin));
    const expectedY = Math.max(margin, Math.min(9999, window.innerHeight - menuHeight - margin));

    openContextMenuAt(9999, 9999);

    const cm = component.contextMenu();
    expect(cm?.visible).toBe(true);
    expect(cm?.x).toBe(expectedX);
    expect(cm?.y).toBe(expectedY);
    expect(cm!.x + menuWidth + margin).toBeLessThanOrEqual(window.innerWidth);
    expect(cm!.y + menuHeight + margin).toBeLessThanOrEqual(window.innerHeight);
  });

  it('clamps the context menu to the margin when opened near the top-left edge', () => {
    openContextMenuAt(2, 3);

    const cm = component.contextMenu();
    expect(cm?.x).toBe(8);
    expect(cm?.y).toBe(8);
  });

  it('keeps interior coordinates unchanged', () => {
    openContextMenuAt(400, 300);

    const cm = component.contextMenu();
    expect(cm?.x).toBe(400);
    expect(cm?.y).toBe(300);
  });

  it('dismisses a clamped context menu via closeContextMenu', () => {
    openContextMenuAt(9999, 9999);
    expect(component.contextMenu()?.visible).toBe(true);

    component.closeContextMenu();

    expect(component.contextMenu()).toBeNull();
  });

  it('ESC dismisses a clamped context menu', () => {
    openContextMenuAt(9999, 9999);
    expect(component.contextMenu()?.visible).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(component.contextMenu()).toBeNull();
  });
});