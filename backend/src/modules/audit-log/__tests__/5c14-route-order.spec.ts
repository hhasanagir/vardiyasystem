import 'reflect-metadata';
import { describe, it, expect } from 'vitest';
import { RequestMethod } from '@nestjs/common';
import { AuditLogController } from '../audit-log.controller';

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

describe('Phase 5C.14 — audit-log route order', () => {
  it('registers GET /audit/export/csv and binds it to exportCsv', () => {
    const routes = listGetRoutes(AuditLogController);
    const csv = routes.find((r) => r.path === 'export/csv');
    expect(csv).toBeDefined();
    expect(csv!.methodName).toBe('exportCsv');
  });

  it('registers GET /audit/export/report and binds it to exportReport', () => {
    const routes = listGetRoutes(AuditLogController);
    const report = routes.find((r) => r.path === 'export/report');
    expect(report).toBeDefined();
    expect(report!.methodName).toBe('exportReport');
  });

  it('keeps :id as a single-segment route so it can never shadow the 2-segment export routes', () => {
    const routes = listGetRoutes(AuditLogController);
    const byId = routes.find((r) => r.path === ':id');
    const csv = routes.find((r) => r.path === 'export/csv');
    const report = routes.find((r) => r.path === 'export/report');
    expect(byId).toBeDefined();
    expect(byId!.methodName).toBe('findById');
    expect(byId!.path.split('/')).toHaveLength(1);
    expect(csv!.path.split('/')).toHaveLength(2);
    expect(report!.path.split('/')).toHaveLength(2);
    expect(csv!.methodName).not.toBe(byId!.methodName);
    expect(report!.methodName).not.toBe(byId!.methodName);
  });
});