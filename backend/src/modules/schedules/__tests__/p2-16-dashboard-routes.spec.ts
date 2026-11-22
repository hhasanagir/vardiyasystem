import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { SchedulesController } from '../schedules.controller';

const PATH_KEY = 'path';
const METHOD_KEY = 'method';
const GET_REQUEST_METHOD = 0;

interface RegisteredRoute {
  methodName: string;
  path: string;
}

function listGetRoutes(): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  for (const methodName of Object.getOwnPropertyNames(SchedulesController.prototype)) {
    if (methodName === 'constructor') continue;
    const descriptor = Object.getOwnPropertyDescriptor(SchedulesController.prototype, methodName);
    if (!descriptor || typeof descriptor.value !== 'function') continue;
    // NestJS stores @Get() metadata on the handler function itself.
    const handler = descriptor.value;
    const path: unknown = Reflect.getMetadata(PATH_KEY, handler);
    if (typeof path !== 'string') continue;
    const method: unknown = Reflect.getMetadata(METHOD_KEY, handler);
    if (method !== GET_REQUEST_METHOD) continue;
    routes.push({ methodName, path });
  }
  return routes;
}

function controllerWith(deps: Record<string, unknown>): SchedulesController {
  const controller = Object.create(SchedulesController.prototype) as SchedulesController;
  const bag = controller as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(deps)) bag[key] = value;
  return controller;
}

const req = (organizationId?: string) => ({
  user: {
    id: 'u-1', email: 'u@example.com', name: 'User', role: 'viewer', organizationId,
  },
}) as never;

describe('P2-16 — dashboard schedule routes', () => {
  it('registers activities/live-metrics before the dynamic :id route', () => {
    const order = listGetRoutes().map(r => r.path);
    const idIndex = order.indexOf(':id');
    expect(idIndex).toBeGreaterThanOrEqual(0);
    for (const path of ['activities', 'live-metrics']) {
      expect(order.indexOf(path)).toBeGreaterThanOrEqual(0);
      expect(order.indexOf(path)).toBeLessThan(idIndex);
    }
    const byHandler = listGetRoutes();
    expect(byHandler.find(r => r.path === 'activities')?.methodName).toBe('getActivities');
    expect(byHandler.find(r => r.path === 'live-metrics')?.methodName).toBe('getLiveMetrics');
    expect(byHandler.find(r => r.path === ':id')?.methodName).toBe('findOne');
  });

  it('scopes activities to the authenticated organization and maps action types', async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: 'a-1', actionType: 'ASSIGNMENTS_APPLIED', description: 'Atama yapıldı',
        createdAt: new Date('2026-11-20T10:00:00Z'), userName: 'Operator',
      },
      {
        id: 'a-2', actionType: 'SCHEDULE_REJECTED', description: 'Plan reddedildi',
        createdAt: new Date('2026-11-20T09:00:00Z'), userName: 'Supervisor',
      },
    ]);
    const controller = controllerWith({ prisma: { auditLog: { findMany } } });

    const result = await controller.getActivities('250', req('org-1'));

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { organizationId: 'org-1', status: 'SUCCESS' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }));
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      id: 'a-1', type: 'shift_assigned', message: 'Atama yapıldı', employeeName: 'Operator',
    });
    expect(result[1].type).toBe('approval_rejected');
  });

  it('returns no cross-tenant rows when the caller has no organization', async () => {
    const findMany = vi.fn();
    const controller = controllerWith({ prisma: { auditLog: { findMany } } });

    await expect(controller.getActivities('10', req(undefined))).resolves.toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('reports live WebSocket connections from the real gateway', () => {
    const controller = controllerWith({ gateway: { server: { sockets: { sockets: { size: 7 } } } } });
    const metrics = controller.getLiveMetrics();
    expect(metrics.online).toBe(true);
    expect(metrics.activeConnections).toBe(7);
    expect(metrics.lastUpdate).toBeInstanceOf(Date);
  });
});
