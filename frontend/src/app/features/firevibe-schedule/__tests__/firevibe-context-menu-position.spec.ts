import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { resolveComponentResources } from '../../../../../node_modules/@angular/core/fesm2022/_debug_node-chunk.mjs';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { of } from 'rxjs';
import { FirevibeScheduleComponent } from '../firevibe-schedule.component';
import { ScheduleService } from '../../../services/schedule.service';
import { EmployeeService } from '../../../services/employee.service';
import { DeviceStatusService } from '../../../services/device-status.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { CONTEXT_MENU_MARGIN } from '../../../core/utils/context-menu-position';

/**
 * P3.3 — the FireVibe grid context menu must clamp inside the viewport (mobile
 * long-press near the screen edge) and dismiss via ESC without a re-render.
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

describe('P3.3 — FirevibeScheduleComponent context-menu positioning', () => {
  let component: FirevibeScheduleComponent;
  let fixture: ComponentFixture<FirevibeScheduleComponent>;

  beforeAll(async () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const srcDir = resolve(here, '..', '..', '..', '..');
    const byName = new Map<string, string>();
    collectFiles(srcDir, byName);
    try {
      (FirevibeScheduleComponent as unknown as { ɵcmp?: unknown }).ɵcmp;
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
    TestBed.overrideComponent(FirevibeScheduleComponent, {
      set: { template: '<div></div>', styleUrls: [], styles: [] },
    });
    await TestBed.configureTestingModule({
      imports: [FirevibeScheduleComponent],
      providers: [
        {
          provide: ScheduleService,
          useValue: {
            loadScheduleByUnit: () => of({ id: 'sched-1', unit: 'mr', month: 5, year: 2026, status: 'draft', version: 1, assignments: [], devices: [], deviceShiftConfig: [], deviceOffDates: [] }),
            getShiftOverrides: () => of([]),
          },
        },
        { provide: EmployeeService, useValue: { getAll: () => of([]) } },
        { provide: DeviceStatusService, useValue: { getMyUnitDevices: () => of([]) } },
        { provide: NotificationService, useValue: { info: () => {}, success: () => {}, error: () => {} } },
        { provide: AuthService, useValue: { user: () => ({ id: 'u1', role: 'supervisor' as const, unitId: 'mr' }) } },
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(FirevibeScheduleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('keeps the grid context menu fully inside the viewport near the bottom-right edge', () => {
    const menuWidth = 240;
    const menuHeight = 340;
    const pos = component.contextMenuPosition(9999, 9999);

    expect(pos.x).toBe(Math.max(CONTEXT_MENU_MARGIN, window.innerWidth - menuWidth - CONTEXT_MENU_MARGIN));
    expect(pos.y).toBe(Math.max(CONTEXT_MENU_MARGIN, window.innerHeight - menuHeight - CONTEXT_MENU_MARGIN));
    expect(pos.x + menuWidth + CONTEXT_MENU_MARGIN).toBeLessThanOrEqual(window.innerWidth);
    expect(pos.y + menuHeight + CONTEXT_MENU_MARGIN).toBeLessThanOrEqual(window.innerHeight);
  });

  it('clamps near the top-left edge up to the margin', () => {
    const pos = component.contextMenuPosition(2, 3);
    expect(pos.x).toBe(CONTEXT_MENU_MARGIN);
    expect(pos.y).toBe(CONTEXT_MENU_MARGIN);
  });

  it('stores clamped coordinates on the context-menu signal via onCellContextMenu', () => {
    const day = {
      dayNumber: 10,
      dateStr: '2026-05-10',
      dayName: 'Pazar',
      dayOfWeek: 0,
      isWeekend: true,
      isToday: false,
      isHoliday: false,
      holidayName: null as string | null,
    };
    const cell = {
      day,
      assignment: null,
      showOverride: false,
      overrideOn: false,
      isClosed: false,
      isDeviceOff: false,
      deviceOffReason: null as string | null,
      conflict: false,
      leave: false,
      warning: false,
      report: false,
      overtime: false,
      cert: false,
      note: false,
      warnings: [],
    };
    const row = {
      key: 'row-1',
      deviceId: 'dev-1',
      deviceCode: 'D1',
      deviceName: 'Röntgen 1',
      mode: 'shift',
      slot: {
        key: 's1',
        id: 's1',
        type: 'day',
        startTime: '08:00',
        endTime: '20:00',
        name: 'Gündüz',
        personnelType: null as string | null,
        blockId: null as string | null,
        optionalOnWeekends: false,
        optionalOnHolidays: false,
      },
      roster: [],
      filled: 0,
      total: 1,
      cells: [cell],
    };

    component.onCellContextMenu({ clientX: 9999, clientY: 9999, preventDefault: () => {} } as MouseEvent, row, cell);

    const cm = component.contextMenu();
    expect(cm).not.toBeNull();
    expect(cm!.x).toBe(Math.max(CONTEXT_MENU_MARGIN, window.innerWidth - 240 - CONTEXT_MENU_MARGIN));
    expect(cm!.y).toBe(Math.max(CONTEXT_MENU_MARGIN, window.innerHeight - 340 - CONTEXT_MENU_MARGIN));
  });

  it('ESC dismisses an open grid context menu', () => {
    const day = {
      dayNumber: 10,
      dateStr: '2026-05-10',
      dayName: 'Pazar',
      dayOfWeek: 0,
      isWeekend: true,
      isToday: false,
      isHoliday: false,
      holidayName: null as string | null,
    };
    const cell = {
      day,
      assignment: null,
      showOverride: false,
      overrideOn: false,
      isClosed: false,
      isDeviceOff: false,
      deviceOffReason: null as string | null,
      conflict: false,
      leave: false,
      warning: false,
      report: false,
      overtime: false,
      cert: false,
      note: false,
      warnings: [],
    };
    const row = {
      key: 'row-1',
      deviceId: 'dev-1',
      deviceCode: 'D1',
      deviceName: 'Röntgen 1',
      mode: 'shift',
      slot: {
        key: 's1',
        id: 's1',
        type: 'day',
        startTime: '08:00',
        endTime: '20:00',
        name: 'Gündüz',
        personnelType: null as string | null,
        blockId: null as string | null,
        optionalOnWeekends: false,
        optionalOnHolidays: false,
      },
      roster: [],
      filled: 0,
      total: 1,
      cells: [cell],
    };

    component.onCellContextMenu({ clientX: 400, clientY: 300, preventDefault: () => {} } as MouseEvent, row, cell);
    expect(component.contextMenu()).not.toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(component.contextMenu()).toBeNull();
  });
});