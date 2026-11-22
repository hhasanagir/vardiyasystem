import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { MinRole } from '../../../guards/min-role';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { DeviceIncidentsController } from '../../device-incidents/device-incidents.controller';
import { EmergencyAccessController } from '../../emergency-access/emergency-access.controller';
import { AssetManagementController } from '../../asset-management/asset-management.controller';
import { QualityController } from '../../quality/quality.controller';
import { DeviceLifecycleController } from '../../device-lifecycle/device-lifecycle.controller';
import { DeviceStatusController } from '../../device-status/device-status.controller';
import { SchedulesController } from '../../schedules/schedules.controller';
import { SchedulesService } from '../../schedules/schedules.service';

/**
 * Phase 5C.15 — F: cross-endpoint authorization consistency.
 *
 * Verifies that every scoped mutation endpoint introduced/hardened in this
 * phase is (1) routed at the expected HTTP method+path, and (2) gated at the
 * expected minimum role (method-level, or class-level where the whole
 * controller shares one guard, e.g. emergency-access).
 */
describe('Phase 5C.15 — F: cross-endpoint authorization consistency', () => {
  function methodRoles(cls: any, name: string): string[] {
    const selected = cls.prototype.constructor.name === cls.name ? ROLES_KEY : ROLES_KEY;
    const methodMeta = Reflect.getMetadata(ROLES_KEY, cls.prototype[name]) ?? [];
    return [...methodMeta];
  }
  function clsRoles(cls: any): string[] {
    return Reflect.getMetadata(ROLES_KEY, cls) ?? [];
  }
  function routePath(cls: any, name: string) {
    return Reflect.getMetadata('path', cls.prototype[name]);
  }
  function routeMethod(cls: any, name: string) {
    return Reflect.getMetadata('method', cls.prototype[name]);
  }
  function allRoles(cls: any, name: string): string[] {
    // class-level @Roles applies controller-wide; union method-level on top.
    return Array.from(new Set([...clsRoles(cls), ...methodRoles(cls, name)]));
  }

  const methodCases: Array<{ ctrl: any; name: string; route: string; method: RequestMethod; minRole: string }> = [
    { ctrl: DeviceIncidentsController, name: 'create', route: 'POST /', method: RequestMethod.POST, minRole: MinRole.TECHNICIAN },
    { ctrl: DeviceIncidentsController, name: 'update', route: 'PATCH :id', method: RequestMethod.PATCH, minRole: MinRole.TECHNICIAN },
    { ctrl: DeviceIncidentsController, name: 'updateStatus', route: 'PATCH :id/status', method: RequestMethod.PATCH, minRole: MinRole.TECHNICIAN },
    { ctrl: AssetManagementController, name: 'create', route: 'POST /', method: RequestMethod.POST, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: AssetManagementController, name: 'update', route: 'PATCH :id', method: RequestMethod.PATCH, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: AssetManagementController, name: 'remove', route: 'DELETE :id', method: RequestMethod.DELETE, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: QualityController, name: 'updateRecord', route: 'PATCH records/:id', method: RequestMethod.PATCH, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: QualityController, name: 'approveRecord', route: 'POST records/:id/approve', method: RequestMethod.POST, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: DeviceLifecycleController, name: 'create', route: 'POST /', method: RequestMethod.POST, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: DeviceLifecycleController, name: 'update', route: 'PATCH :id', method: RequestMethod.PATCH, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: DeviceLifecycleController, name: 'remove', route: 'DELETE :id', method: RequestMethod.DELETE, minRole: MinRole.FIELD_SUPERVISOR },
    { ctrl: DeviceStatusController, name: 'updateStatus', route: 'POST /', method: RequestMethod.POST, minRole: MinRole.VIEWER },
    { ctrl: EmergencyAccessController, name: 'requestAccess', route: 'POST request', method: RequestMethod.POST, minRole: MinRole.HOSPITAL_ADMIN },
    { ctrl: EmergencyAccessController, name: 'revokeAccess', route: 'POST :id/revoke', method: RequestMethod.POST, minRole: MinRole.HOSPITAL_ADMIN },
  ];

  methodCases.forEach((c) => {
    it(`${c.ctrl.name}.${c.name} routes ${c.route}`, () => {
      expect(routeMethod(c.ctrl, c.name)).toBe(c.method);
      const p = routePath(c.ctrl, c.name) ?? '';
      const normalized = p === '/' ? '' : p;
      const expectedRaw = c.route.split(' ')[1];
      const expected = expectedRaw === '/' ? '' : expectedRaw;
      expect(normalized).toBe(expected);
    });
  });

  methodCases.forEach((c) => {
    it(`${c.ctrl.name}.${c.name} requires at least ${c.minRole} (method or class level)`, () => {
      const roles = allRoles(c.ctrl, c.name);
      expect(roles.length).toBeGreaterThan(0);
      expect(roles).toContain(c.minRole);
    });
  });

  it('hardened services do NOT expose raw client-controlled scope hints (optional/derived only)', () => {
    // requestAccess(data, callerOrganizationId?) — the caller org is optional
    // because it originates from the authenticated session, never the client.
    expect(EmergencyAccessController.prototype.requestAccess.length).toBeGreaterThan(0);
    // controller derives scope from req.user (auth session) rather than a DTO.
    expect(EmergencyAccessController.prototype.requestAccess.toString()).toContain('req.user');
  });

  it('legacy schedule mutations accept a trailing expectedVersion through the controller', () => {
    const proto: any = SchedulesController.prototype;
    // Controller's addAssignment wires expectedVersion into the service call.
    const src = Function.prototype.toString.call(proto.addAssignment);
    expect(src).toContain('expectedVersion');
    expect(src).toContain("this.schedulesService.addAssignment(id, dto, req.user.id, req.user.role, expectedVersion)");
  });
});
