import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { NotificationsController } from '../notifications.controller';

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

describe('Phase 5C.14 — notifications route order', () => {
  it('registers static GET /notifications/stats before dynamic GET /notifications/:id', () => {
    const routes = listGetRoutes(NotificationsController);
    const order = routes.map((r) => r.path);
    const statsIndex = order.indexOf('stats');
    const idIndex = order.indexOf(':id');
    expect(statsIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThan(statsIndex);
  });

  it('registers static GET /notifications/engagement before dynamic GET /notifications/:id', () => {
    const routes = listGetRoutes(NotificationsController);
    const order = routes.map((r) => r.path);
    const engagementIndex = order.indexOf('engagement');
    const idIndex = order.indexOf(':id');
    expect(engagementIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThan(engagementIndex);
  });

  it('binds stats and engagement to their dedicated handlers, never to :id', () => {
    const routes = listGetRoutes(NotificationsController);
    const stats = routes.find((r) => r.path === 'stats');
    const engagement = routes.find((r) => r.path === 'engagement');
    const byId = routes.find((r) => r.path === ':id');
    expect(stats).toBeDefined();
    expect(engagement).toBeDefined();
    expect(byId).toBeDefined();
    expect(stats!.methodName).toBe('getStats');
    expect(engagement!.methodName).toBe('getEngagement');
    expect(byId!.methodName).toBe('getById');
    expect(stats!.methodName).not.toBe(byId!.methodName);
    expect(engagement!.methodName).not.toBe(byId!.methodName);
  });
});