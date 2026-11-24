import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmployeeService } from '../employee.service';
import { AuthService } from '../auth.service';
import { RbacService } from '../rbac.service';
import { WebSocketService } from '../websocket.service';

const LIST_URL = '/api/v1/personnel';

interface AuthStubOptions {
  role: string;
  unitId?: string | null;
  organizationId?: string;
}

function buildService(options: AuthStubOptions, isFieldSupervisor: boolean) {
  TestBed.resetTestingModule();
  const user = {
    role: options.role,
    unitId: options.unitId ?? null,
    organizationId: options.organizationId ?? 'org-1',
  };

  TestBed.configureTestingModule({
    imports: [HttpClientTestingModule],
    providers: [
      {
        provide: AuthService,
        useValue: {
          user: () => user,
          getToken: () => 'test-token',
        },
      },
      {
        provide: RbacService,
        useValue: { isFieldSupervisor: () => isFieldSupervisor },
      },
      {
        provide: WebSocketService,
        useValue: { on: () => ({ subscribe: () => ({ unsubscribe: () => undefined }) }) },
      },
      EmployeeService,
    ],
  });

  return {
    service: TestBed.inject(EmployeeService),
    http: TestBed.inject(HttpTestingController),
  };
}

describe('EmployeeService roster scoping', () => {
  let http: HttpTestingController | null = null;

  afterEach(() => {
    http?.verify();
    http = null;
  });

  it('scopes a field supervisor to their own unit', () => {
    const built = buildService({ role: 'field_supervisor', unitId: 'unit-mr' }, true);
    http = built.http;

    built.service.getAll(9, 2026).subscribe();

    const req = http.expectOne(
      (r) => r.url === LIST_URL && r.params.get('unitId') === 'unit-mr'
    );
    expect(req.request.params.get('organizationId')).toBe('org-1');
    expect(req.request.params.get('month')).toBe('9');
    req.flush([]);
  });

  it('keeps a supervisor organization-scoped instead of filtering by their own department', () => {
    // A supervisor owns a department unit of its own; sending it as a filter hid
    // the whole roster on the personnel page.
    const built = buildService({ role: 'supervisor', unitId: 'unit-supervizor' }, false);
    http = built.http;

    built.service.getAll(9, 2026).subscribe();

    const req = http.expectOne((r) => r.url === LIST_URL);
    expect(req.request.params.has('unitId')).toBe(false);
    expect(req.request.params.get('organizationId')).toBe('org-1');
    req.flush([]);
  });

  it('keeps an administrator organization-scoped', () => {
    const built = buildService({ role: 'system_admin', unitId: null }, false);
    http = built.http;

    built.service.getAll().subscribe();

    const req = http.expectOne((r) => r.url === LIST_URL);
    expect(req.request.params.has('unitId')).toBe(false);
    expect(req.request.params.has('month')).toBe(false);
    req.flush([]);
  });

  it('treats an RBAC field supervisor without a legacy role as unit-scoped', () => {
    const built = buildService({ role: 'supervisor', unitId: 'unit-bt' }, true);
    http = built.http;

    built.service.getAll().subscribe();

    const req = http.expectOne((r) => r.url === LIST_URL && r.params.get('unitId') === 'unit-bt');
    expect(req).toBeTruthy();
    req.flush([]);
  });

  it('omits the unit filter when a field supervisor has no unit assigned', () => {
    const built = buildService({ role: 'field_supervisor', unitId: null }, true);
    http = built.http;

    built.service.getAll().subscribe();

    const req = http.expectOne((r) => r.url === LIST_URL);
    expect(req.request.params.has('unitId')).toBe(false);
    req.flush([]);
  });

  it('still publishes the roster to its signal', async () => {
    const built = buildService({ role: 'supervisor', unitId: 'unit-supervizor' }, false);
    http = built.http;

    const rows = [{ id: 'p-1', name: 'Test', role: 'technician' }];
    const done = new Promise<void>((resolve, reject) =>
      built.service.getAll().subscribe({ next: () => undefined, error: reject, complete: resolve })
    );
    http.expectOne((r) => r.url === LIST_URL).flush(rows);
    await done;

    expect(built.service.employees()).toEqual(rows as never);
  });
});
