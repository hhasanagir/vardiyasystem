import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { SkillController } from '../skill.controller';

const PATH_KEY = 'path';
const METHOD_KEY = 'method';

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
    if (Reflect.getMetadata(METHOD_KEY, handler) !== RequestMethod.GET) continue;
    routes.push({ methodName, path });
  }
  return routes;
}

describe('Phase 5C.14 — skills route order', () => {
  it('registers static GET /skills/expiring before dynamic GET /skills/:id', () => {
    const routes = listGetRoutes(SkillController);
    const order = routes.map((r) => r.path);
    const expiringIndex = order.indexOf('expiring');
    const idIndex = order.indexOf(':id');
    expect(expiringIndex).toBeGreaterThanOrEqual(0);
    expect(idIndex).toBeGreaterThan(expiringIndex);
  });

  it('binds /skills/expiring to getExpiring and /skills/:id to getSkill (distinct handlers)', () => {
    const routes = listGetRoutes(SkillController);
    const expiring = routes.find((r) => r.path === 'expiring');
    const byId = routes.find((r) => r.path === ':id');
    expect(expiring).toBeDefined();
    expect(byId).toBeDefined();
    expect(expiring!.methodName).toBe('getExpiring');
    expect(byId!.methodName).toBe('getSkill');
    expect(expiring!.methodName).not.toBe(byId!.methodName);
  });

  it('binds GET /skills/matrix/all to getSkillMatrix (2-segment, not shadowable by :id)', () => {
    const routes = listGetRoutes(SkillController);
    const matrix = routes.find((r) => r.path === 'matrix/all');
    expect(matrix).toBeDefined();
    expect(matrix!.methodName).toBe('getSkillMatrix');
    expect(matrix!.path.split('/')).toHaveLength(2);
  });
});