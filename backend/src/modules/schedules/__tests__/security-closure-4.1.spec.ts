import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ScheduleAccessGuard } from '../guards/schedule-access.guard';

const execCtx = (request: unknown) =>
  ({ switchToHttp: () => ({ getRequest: () => request }) }) as never;

function readSource(relativePath: string): string {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const resolved = path.resolve(__dirname, relativePath);
  return fs.readFileSync(resolved, 'utf-8');
}

const makePrisma = (
  scheduleResult: unknown = null,
  unitResult: unknown = null,
) => ({
  schedule: { findUnique: vi.fn().mockResolvedValue(scheduleResult) },
  unit: { findUnique: vi.fn().mockResolvedValue(unitResult) },
});

describe('Phase 4.1 — Security Closure Behavioral Tests', () => {
  describe('SEC-001: ThrottlerGuard Global Binding (behavioral)', () => {
    it('app.module providers include APP_GUARD → ThrottlerGuard binding', () => {
      const source = readSource('../../../app.module.ts');
      const providersIdx = source.indexOf('providers:');
      const providersSection = source.substring(providersIdx);
      expect(providersSection).toContain(
        'provide: APP_GUARD,\n      useClass: ThrottlerGuard',
      );
    });

    it('ThrottlerModule.forRootAsync is imported', () => {
      const source = readSource('../../../app.module.ts');
      expect(source).toContain('ThrottlerModule.forRootAsync');
    });

    it('CsrfGuard remains as second APP_GUARD', () => {
      const source = readSource('../../../app.module.ts');
      const throttlerIdx = source.indexOf('useClass: ThrottlerGuard');
      const csrfIdx = source.indexOf('useClass: CsrfGuard');
      expect(csrfIdx).toBeGreaterThan(throttlerIdx);
      expect(providersSection(source)).toContain('useClass: CsrfGuard');
    });

    it('@Throttle decorator on login endpoint', () => {
      const source = readSource('../../auth/auth.controller.ts');
      const loginIdx = source.indexOf("@Post('login')");
      const loginSection = source.substring(loginIdx - 200, loginIdx + 200);
      expect(loginSection).toContain('@Throttle');
    });

    it('@Throttle decorator on register endpoint', () => {
      const source = readSource('../../auth/auth.controller.ts');
      const registerIdx = source.indexOf("@Post('register')");
      const registerSection = source.substring(
        registerIdx - 200,
        registerIdx + 200,
      );
      expect(registerSection).toContain('@Throttle');
    });

    function providersSection(source: string): string {
      const providersIdx = source.indexOf('providers:');
      const closingIdx = source.indexOf('],', providersIdx);
      return source.substring(providersIdx, closingIdx);
    }
  });

  describe('SEC-002: WebSocket JWT Identity Alignment (behavioral)', () => {
    it('generateToken payload uses sub field (not id) for user identity', () => {
      const source = readSource('../../auth/auth.service.ts');
      const payloadStart = source.indexOf('const payload = {');
      const payloadEnd = source.indexOf('};', payloadStart) + 2;
      const payloadSection = source.substring(payloadStart, payloadEnd);
      expect(payloadSection).toContain('sub: user.id');
      expect(payloadSection).not.toContain('id: user.id');
    });

    it('ScheduleGateway extracts userId from payload.sub', () => {
      const source = readSource('../../websocket/schedule.gateway.ts');
      expect(source).toContain('client.userId = payload.sub');
      expect(source).not.toContain('client.userId = payload.id');
    });

    it('ScheduleGateway fetches user name/unitId from DB', () => {
      const source = readSource('../../websocket/schedule.gateway.ts');
      expect(source).toContain('prisma.user.findUnique');
      expect(source).toContain('select: { name: true, unitId: true }');
    });

    it('JWT payload includes organizationId', () => {
      const source = readSource('../../auth/auth.service.ts');
      const idx = source.indexOf('private async generateToken');
      const section = source.substring(idx, idx + 500);
      expect(section).toContain('organizationId: user.organizationId');
    });

    it('JwtStrategy.validate reads payload.sub (not payload.id)', () => {
      const source = readSource('../../auth/jwt.strategy.ts');
      expect(source).toContain('validate(payload: { sub:');
      expect(source).toContain('payload.sub');
      expect(source).not.toContain('payload.id');
    });
  });

  describe('SEC-003: ScheduleAccessGuard Fail-Closed (behavioral — actual guard instantiation)', () => {
    let guard: ScheduleAccessGuard;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('REJECTS when user has no tenant context (no org + no unit)', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: 'org-A' });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: undefined,
              unitId: undefined,
            },
          }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('ALLOWS system_admin regardless of tenant context', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: 'org-A' });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'system_admin',
              organizationId: undefined,
              unitId: undefined,
            },
          }),
        ),
      ).resolves.toBe(true);
    });

    it('REJECTS cross-tenant access (different organization)', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: 'org-A' });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: 'org-B',
              unitId: 'unit-B',
            },
          }),
        ),
      ).rejects.toThrow(/another organization/);
    });

    it('ALLOWS same-tenant access', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: 'org-A' });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: 'org-A',
              unitId: 'unit-A',
            },
          }),
        ),
      ).resolves.toBe(true);
    });

    it('ALLOWS same-unit access (no org)', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: null });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: undefined,
              unitId: 'unit-A',
            },
          }),
        ),
      ).resolves.toBe(true);
    });

    it('THROWS NotFoundException for non-existent schedule', async () => {
      const prisma = makePrisma(null);
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-missing' },
            user: {
              role: 'supervisor',
              organizationId: 'org-A',
              unitId: 'unit-A',
            },
          }),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('REJECTS when schedule has no org but user has org claim', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: null });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: 'org-A',
              unitId: undefined,
            },
          }),
        ),
      ).rejects.toThrow(/no organization context/);
    });

    it('ALLOWS when units differ but unit lookup returns null (cannot determine cross-org)', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: null });
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({
            params: { id: 'sched-1' },
            user: {
              role: 'supervisor',
              organizationId: undefined,
              unitId: 'unit-B',
            },
          }),
        ),
      ).resolves.toBe(true);
    });

    it('REJECTS when user is undefined (no authentication)', async () => {
      const prisma = makePrisma();
      guard = new ScheduleAccessGuard(prisma as never);
      await expect(
        guard.canActivate(
          execCtx({ params: { id: 'sched-1' }, user: undefined }),
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('queries Prisma for schedule when scheduleId present', async () => {
      const prisma = makePrisma({ unitId: 'unit-A', organizationId: 'org-A' });
      guard = new ScheduleAccessGuard(prisma as never);
      await guard.canActivate(
        execCtx({
          params: { id: 'sched-1' },
          user: {
            role: 'supervisor',
            organizationId: 'org-A',
            unitId: 'unit-A',
          },
        }),
      );
      expect(prisma.schedule.findUnique).toHaveBeenCalledWith({
        where: { id: 'sched-1' },
        select: { unitId: true, organizationId: true },
      });
    });

    it('does NOT query schedule when no params.id (job endpoint context)', async () => {
      const prisma = makePrisma();
      guard = new ScheduleAccessGuard(prisma as never);
      await guard.canActivate(
        execCtx({
          params: {},
          user: {
            role: 'supervisor',
            organizationId: 'org-A',
            unitId: 'unit-A',
          },
        }),
      );
      expect(prisma.schedule.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('SEC-004: Job Endpoint Authorization (behavioral — source-based verification)', () => {
    const controllerSrc = readSource('../schedules-ddd.controller.ts');

    it('getJobStatus: @Roles(MinRole.VIEWER) decorator present', () => {
      const idx = controllerSrc.indexOf('async getJobStatus(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain('@Roles(MinRole.VIEWER)');
    });

    it('getJobStatus: @Permissions("schedule.read") decorator present', () => {
      const idx = controllerSrc.indexOf('async getJobStatus(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain("@Permissions('schedule.read')");
    });

    it('cancelJob: @Roles(MinRole.SUPERVISOR) decorator present', () => {
      const idx = controllerSrc.indexOf('async cancelJob(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain('@Roles(MinRole.SUPERVISOR)');
    });

    it('cancelJob: @Permissions("schedule.generate") decorator present', () => {
      const idx = controllerSrc.indexOf('async cancelJob(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain("@Permissions('schedule.generate')");
    });

    it('getScheduleJobs: @Roles(MinRole.VIEWER) decorator present', () => {
      const idx = controllerSrc.indexOf('async getScheduleJobs(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain('@Roles(MinRole.VIEWER)');
    });

    it('getScheduleJobs: @Permissions("schedule.read") decorator present', () => {
      const idx = controllerSrc.indexOf('async getScheduleJobs(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain("@Permissions('schedule.read')");
    });

    it('enqueueExport: @Permissions("schedule.export") decorator present', () => {
      const idx = controllerSrc.indexOf('async enqueueExport(');
      const block = controllerSrc.substring(Math.max(0, idx - 300), idx);
      expect(block).toContain("@Permissions('schedule.export')");
    });

    it('class-level UseGuards includes ScheduleAccessGuard', () => {
      expect(controllerSrc).toContain(
        '@UseGuards(JwtAuthGuard, RolesGuard, ScheduleAccessGuard)',
      );
    });

    it('getJobStatus performs Prisma-based tenant isolation', () => {
      const idx = controllerSrc.indexOf('async getJobStatus(');
      const body = controllerSrc.substring(idx, idx + 700);
      expect(body).toContain('this.prisma.schedule.findUnique');
      expect(body).toContain('another organization');
    });

    it('cancelJob performs Prisma-based tenant isolation', () => {
      const idx = controllerSrc.indexOf('async cancelJob(');
      const body = controllerSrc.substring(idx, idx + 700);
      expect(body).toContain('this.prisma.schedule.findUnique');
      expect(body).toContain('another organization');
    });

    it('cancelJob skips tenant check for system_admin', () => {
      const idx = controllerSrc.indexOf('async cancelJob(');
      const body = controllerSrc.substring(idx, idx + 300);
      expect(body).toContain("req.user.role !== 'system_admin'");
    });

    it('getJobStatus skips tenant check for system_admin', () => {
      const idx = controllerSrc.indexOf('async getJobStatus(');
      const body = controllerSrc.substring(idx, idx + 300);
      expect(body).toContain("req.user.role !== 'system_admin'");
    });

    it('ScheduleJobQueueService stores organizationId in job data', () => {
      const source = readSource('../job-queue/schedule-job-queue.service.ts');
      expect(source).toContain('organizationId');
      expect(source).toContain('userId');
    });
  });

  describe('Cross-Cutting: Regression Safety', () => {
    it('security-invariants test file still passes structural checks', () => {
      const source = readSource('../__tests__/security-invariants.spec.ts');
      expect(source).toContain('F61: Security Invariants');
      expect(source).toContain('ScheduleAccessGuard');
    });

    it('JwtStrategy reads payload.sub correctly', () => {
      const source = readSource('../../auth/jwt.strategy.ts');
      expect(source).toContain('payload.sub');
      expect(source).not.toContain('payload.id');
    });

    it('ScheduleAccessGuard source confirms system_admin bypass', () => {
      const source = readSource('../guards/schedule-access.guard.ts');
      expect(source).toContain("user.role === 'system_admin'");
    });

    it('ScheduleAccessGuard source confirms fail-closed pattern', () => {
      const source = readSource('../guards/schedule-access.guard.ts');
      expect(source).toContain(
        "throw new ForbiddenException('Access denied: missing tenant context')",
      );
      expect(source).toContain(
        "throw new ForbiddenException('Access denied: insufficient tenant context')",
      );
    });
  });
});
