import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { SchedulesController } from '../schedules.controller';

const PATH_KEY = 'path';
const METHOD_KEY = 'method';
const GET_REQUEST_METHOD = 0;

interface RegisteredRoute {
  methodName: string;
  path: string;
}

function listGetRoutes(controller: any): RegisteredRoute[] {
  const routes: RegisteredRoute[] = [];
  for (const methodName of Object.getOwnPropertyNames(controller.prototype)) {
    if (methodName === 'constructor') continue;
    const handler = controller.prototype[methodName];
    const path = Reflect.getMetadata(PATH_KEY, handler);
    if (path === undefined) continue;
    if (Reflect.getMetadata(METHOD_KEY, handler) !== GET_REQUEST_METHOD) continue;
    routes.push({ methodName, path });
  }
  return routes;
}

describe('Phase 5C.13 — schedules route order', () => {
  it('registers static GET /schedules/analytics before dynamic GET /schedules/:id', () => {
    const routes = listGetRoutes(SchedulesController);
    const order = routes.map((r) => r.path);
    const analyticsIndex = order.indexOf('analytics');
    const idIndex = order.indexOf(':id');
    expect(analyticsIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThan(analyticsIndex);
  });

  it('binds /schedules/analytics to the analytics handler and never to :id', () => {
    const routes = listGetRoutes(SchedulesController);
    const analytics = routes.find((r) => r.path === 'analytics');
    const byId = routes.find((r) => r.path === ':id');
    expect(analytics).toBeDefined();
    expect(byId).toBeDefined();
    expect(analytics!.methodName).toBe('getAnalytics');
    expect(byId!.methodName).toBe('findOne');
    expect(analytics!.methodName).not.toBe(byId!.methodName);
  });
});