import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RbacService } from '../rbac.service';
import { AuthService } from '../auth.service';

const PERMISSIONS_URL = '/api/v1/rbac/me/permissions';
const UNITS_URL = '/api/v1/units';

function authStub(isAuthenticated: boolean): Partial<AuthService> {
  return {
    isAuthenticated: () => isAuthenticated,
    user: () => null,
  } as Partial<AuthService>;
}

function buildRbac(isAuthenticated = true): { rbac: RbacService; http: HttpTestingController } {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [HttpClientTestingModule],
    providers: [
      { provide: AuthService, useValue: authStub(isAuthenticated) },
      RbacService,
    ],
  });
  return { rbac: TestBed.inject(RbacService), http: TestBed.inject(HttpTestingController) };
}

describe('RbacService permission loading', () => {
  let http: HttpTestingController | null = null;

  beforeEach(() => {
    http = null;
  });

  afterEach(() => {
    http?.verify();
  });

  it('loads the permission set and reports it', async () => {
    const built = buildRbac();
    http = built.http;

    const pending = built.rbac.ensureLoaded();
    http.expectOne(PERMISSIONS_URL).flush({ permissions: ['personnel.read'], rbacRoles: [] });
    await pending;

    expect(built.rbac.hasPermission('personnel.read')).toBe(true);
    expect(built.rbac.hasAllPermissions(['personnel.read'])).toBe(true);
    expect(built.rbac.hasPermission('analytics.read')).toBe(false);
  });

  it('makes a concurrent caller wait for the in-flight load instead of seeing no permissions', async () => {
    // Regression: the guard used to return early while the constructor's request
    // was still running, so the first protected route was refused even though
    // the account held the permission.
    const built = buildRbac();
    http = built.http;

    const first = built.rbac.ensureLoaded();
    const second = built.rbac.ensureLoaded();

    // One request, not two, and the second caller is still waiting.
    http.expectOne(PERMISSIONS_URL).flush({ permissions: ['personnel.read'], rbacRoles: [] });
    await Promise.all([first, second]);

    expect(built.rbac.hasAllPermissions(['personnel.read'])).toBe(true);
  });

  it('issues a single request when several callers arrive while loading', async () => {
    const built = buildRbac();
    http = built.http;

    const calls = [
      built.rbac.ensureLoaded(),
      built.rbac.ensureLoaded(),
      built.rbac.ensureLoaded(),
    ];
    http.expectOne(PERMISSIONS_URL).flush({ permissions: [], rbacRoles: [] });
    await Promise.all(calls);

    http.verify();
  });

  it('does not re-request once the permissions are loaded', async () => {
    const built = buildRbac();
    http = built.http;

    const pending = built.rbac.ensureLoaded();
    http.expectOne(PERMISSIONS_URL).flush({ permissions: ['personnel.read'], rbacRoles: [] });
    await pending;

    await built.rbac.ensureLoaded();

    http.verify();
  });

  it('fails closed when the request fails', async () => {
    const built = buildRbac();
    http = built.http;

    const pending = built.rbac.ensureLoaded();
    http
      .expectOne(PERMISSIONS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await pending;

    expect(built.rbac.hasAnyPermission(['personnel.read'])).toBe(false);
    expect(built.rbac.hasAnyRole()).toBe(false);
  });

  it('stays closed for the rest of the session after a failed load', async () => {
    // A failed load is not retried: the session keeps no permissions rather than
    // hammering the endpoint, and a reload is what recovers it.
    const built = buildRbac();
    http = built.http;

    const failed = built.rbac.ensureLoaded();
    http
      .expectOne(PERMISSIONS_URL)
      .flush({ message: 'boom' }, { status: 500, statusText: 'Server Error' });
    await failed;

    await built.rbac.ensureLoaded();

    http.verify();
    expect(built.rbac.hasAnyPermission(['personnel.read'])).toBe(false);
  });

  it('does not load permissions for an anonymous visitor', () => {
    const built = buildRbac(false);
    http = built.http;

    // Constructing the service must not fire a request without a session.
    http.expectNone(PERMISSIONS_URL);
    expect(built.rbac.hasAnyPermission(['personnel.read'])).toBe(false);
  });

  it('shares the unit request between concurrent callers', async () => {
    const built = buildRbac();
    http = built.http;

    const loaded = built.rbac.ensureLoaded();
    http.expectOne(PERMISSIONS_URL).flush({
      permissions: [],
      rbacRoles: [{ roleName: 'FIELD_SUPERVISOR', unitId: 'unit-mr' }],
    });
    await loaded;

    const first = built.rbac.getFieldSupervisorUnitType();
    const second = built.rbac.getFieldSupervisorUnitType();
    // The unit request is only issued after the already-resolved permission load
    // hands control back, so let those microtasks run before matching on it.
    await new Promise((resolve) => setTimeout(resolve, 0));
    http.expectOne(UNITS_URL).flush([{ id: 'unit-mr', name: 'MR', code: 'MR', type: 'mr' }]);
    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe('mr');
    expect(b).toBe('mr');
  });
});
