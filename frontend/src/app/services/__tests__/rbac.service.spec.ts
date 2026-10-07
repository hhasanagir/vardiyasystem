// @vitest-environment jsdom
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RbacService, RbacPermissionsResponse } from '../rbac.service';

const PERMISSIONS: RbacPermissionsResponse = {
  permissions: ['personnel.read'],
  rbacRoles: [{ roleId: 'role-1', roleName: 'system_admin', scope: 'global' }],
};

const isPermissionsRequest = (url: string) => url.includes('/rbac/me/permissions');

describe('RbacService', () => {
  let service: RbacService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [provideRouter([])],
    });
    service = TestBed.inject(RbacService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('populates permissions after ensureLoaded resolves', async () => {
    const pending = service.ensureLoaded();

    http.expectOne((req) => isPermissionsRequest(req.url)).flush(PERMISSIONS);

    await pending;

    expect(service.hasPermission('personnel.read')).toBe(true);
    expect(service.hasRole('system_admin')).toBe(true);
  });

  it('makes a concurrent caller wait for the in-flight load instead of returning early', async () => {
    const first = service.ensureLoaded();
    const second = service.ensureLoaded();

    let secondSettled = false;
    void second.then(() => {
      secondSettled = true;
    });

    await Promise.resolve();
    expect(secondSettled).toBe(false);

    http.expectOne((req) => isPermissionsRequest(req.url)).flush(PERMISSIONS);

    await Promise.all([first, second]);

    expect(secondSettled).toBe(true);
    expect(service.hasPermission('personnel.read')).toBe(true);
  });

  it('resolves with an empty permission set when the request fails', async () => {
    const pending = service.ensureLoaded();

    http
      .expectOne((req) => isPermissionsRequest(req.url))
      .flush('boom', { status: 500, statusText: 'Server Error' });

    await pending;

    expect(service.hasPermission('personnel.read')).toBe(false);
  });

  it('does not refetch once loaded', async () => {
    const first = service.ensureLoaded();
    http.expectOne((req) => isPermissionsRequest(req.url)).flush(PERMISSIONS);
    await first;

    await service.ensureLoaded();

    http.expectNone((req) => isPermissionsRequest(req.url));
  });
});
