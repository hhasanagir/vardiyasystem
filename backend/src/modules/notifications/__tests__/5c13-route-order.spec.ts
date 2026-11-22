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

describe('Phase 5C.13 — notifications route order', () => {
  it('registers static GET /notifications/preferences before dynamic GET /notifications/:id', () => {
    const routes = listGetRoutes(NotificationsController);
    const order = routes.map((r) => r.path);
    const preferencesIndex = order.indexOf('preferences');
    const idIndex = order.indexOf(':id');
    expect(preferencesIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThan(preferencesIndex);
  });

  it('binds /notifications/preferences to the preferences handler and never to :id', () => {
    const routes = listGetRoutes(NotificationsController);
    const preferences = routes.find((r) => r.path === 'preferences');
    const byId = routes.find((r) => r.path === ':id');
    expect(preferences).toBeDefined();
    expect(byId).toBeDefined();
    expect(preferences!.methodName).toBe('getPreferences');
    expect(byId!.methodName).toBe('getById');
    expect(preferences!.methodName).not.toBe(byId!.methodName);
  });
});