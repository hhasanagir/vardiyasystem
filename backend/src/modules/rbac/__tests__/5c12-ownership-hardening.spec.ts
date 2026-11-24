import 'reflect-metadata';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { RbacService } from '../rbac.service';
import { PrismaService } from '../../../prisma.service';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { MinRole } from '../../../guards/min-role';
import { ConsentController } from '../../consent/consent.controller';
import { DataSubjectController } from '../../data-subject/data-subject.controller';
import { BreachNotificationController } from '../../breach-notification/breach-notification.controller';
import { ProcessingActivityController } from '../../processing-activity/processing-activity.controller';
import { AuditLogController } from '../../audit-log/audit-log.controller';
import { SkillController } from '../../skills/skill.controller';
import { AuditLogService } from '../../audit-log/audit-log.service';

/**
 * Phase 5C.12 - Repository ownership + integration hardening regression pack.
 *
 * Guards the DEFECT FIXES introduced in 5C.12:
 *  1. RBAC dominance: assign/remove/update-permissions require the actor to be
 *     strictly dominant over the target role level and contained to their own
 *     organization (no self-escalation to SYSTEM_ADMIN, no cross-org assigns).
 *  2. GDPR authorization: consent/data-subject/admin operations and all of
 *     breach-notification + processing-activities require SYSTEM_ADMIN
 *     (previously any authenticated user reached them via JwtAuthGuard only).
 *  3. Shadowed-route fixes: literal single-segment GET routes on audit-log and
 *     skills are now declared BEFORE @Get(':id'), making them reachable.
 *  4. Suspicious-activity detection is now org-scoped in the service.
 */
describe('Phase 5C.12 ownership hardening', () => {
  const ORG = 'org-a';
  const ACTOR = 'actor-1';
  const TARGET = 'target-1';

  describe('RBAC dominance (no self-escalation)', () => {
    let service: RbacService;
    let prisma: any;

    beforeEach(async () => {
      vi.clearAllMocks();
      prisma = {
        role: {
          findMany: vi.fn().mockResolvedValue([]),
          findUnique: vi.fn(),
        },
        permission: { findMany: vi.fn().mockResolvedValue([]) },
        rolePermission: {
          findMany: vi.fn().mockResolvedValue([]),
          deleteMany: vi.fn().mockResolvedValue({}),
          createMany: vi.fn().mockResolvedValue({}),
        },
        userRoleAssignment: {
          findMany: vi.fn(),
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'new' }),
          update: vi.fn().mockResolvedValue({}),
        },
      };
      const module: TestingModule = await Test.createTestingModule({
        providers: [RbacService, { provide: PrismaService, useValue: prisma }],
      }).compile();
      service = module.get(RbacService);
    });

    it('denies assigning a role whose level is >= the actor level', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 500 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 1000 });
      await expect(
        service.assignRoleToUser(TARGET, 'role-sysadmin', ACTOR, { organizationId: ORG }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.userRoleAssignment.create).not.toHaveBeenCalled();
    });

    it('allows assigning a strictly lower role within the actor organization', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 1000 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 200 });
      await expect(
        service.assignRoleToUser(TARGET, 'role-low', ACTOR, { organizationId: ORG }),
      ).resolves.toBeUndefined();
      expect(prisma.userRoleAssignment.create).toHaveBeenCalled();
    });

    it('denies cross-organization assignments (scope containment)', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 1000 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 200 });
      await expect(
        service.assignRoleToUser(TARGET, 'role-low', ACTOR, { organizationId: 'org-other' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('denies removeRole when the actor is not dominant over the target role', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 200 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 500 });
      await expect(
        service.removeRoleFromUser(TARGET, 'role-sup', { organizationId: ORG }, ACTOR),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows internal removeRole calls without an actor id (non-breaking)', async () => {
      prisma.userRoleAssignment.findFirst.mockResolvedValue({ id: 'x', isActive: true });
      await expect(service.removeRoleFromUser(TARGET, 'role-x')).resolves.toBeUndefined();
      expect(prisma.userRoleAssignment.update).toHaveBeenCalled();
    });

    it('denies updating permissions of a role whose level is >= actor level, allows lower', async () => {
      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 500 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 500 });
      await expect(service.updateRolePermissions('role-sup', ['x'], ACTOR)).rejects.toThrow(ForbiddenException);

      prisma.userRoleAssignment.findMany.mockResolvedValue([{ organizationId: ORG, role: { level: 800 } }]);
      prisma.role.findUnique.mockResolvedValue({ level: 400 });
      await expect(service.updateRolePermissions('role-mid', ['x'], ACTOR)).resolves.toBeUndefined();
    });
  });

  describe('GDPR authorization gating', () => {
    it('consent admin routes are SYSTEM_ADMIN gated, self-service untouched', () => {
      expect(Reflect.getMetadata(ROLES_KEY, ConsentController.prototype.getStatistics)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, ConsentController.prototype.getUserConsents)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, ConsentController.prototype.getMyConsents)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, ConsentController.prototype.giveConsent)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, ConsentController.prototype.withdrawConsent)).toBeUndefined();
    });

    it('data-subject processing/erasure/statistics gated, self-service untouched', () => {
      expect(Reflect.getMetadata(ROLES_KEY, DataSubjectController.prototype.processRequest)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, DataSubjectController.prototype.processErasure)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, DataSubjectController.prototype.getStatistics)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, DataSubjectController.prototype.getMyData)).toBeUndefined();
      expect(Reflect.getMetadata(ROLES_KEY, DataSubjectController.prototype.requestExport)).toBeUndefined();
    });

    it('breach-notification and processing-activities are class-level SYSTEM_ADMIN with RolesGuard', () => {
      expect(Reflect.getMetadata(ROLES_KEY, BreachNotificationController)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata(ROLES_KEY, ProcessingActivityController)).toEqual([MinRole.SYSTEM_ADMIN]);
      expect(Reflect.getMetadata('guards', BreachNotificationController)).toContain(RolesGuard);
      expect(Reflect.getMetadata('guards', ProcessingActivityController)).toContain(RolesGuard);
    });

    it('consent and data-subject classes attach RolesGuard (no-op for un-gated methods)', () => {
      expect(Reflect.getMetadata('guards', ConsentController)).toContain(RolesGuard);
      expect(Reflect.getMetadata('guards', DataSubjectController)).toContain(RolesGuard);
    });
  });

  describe('shadowed-route fixes (literal routes before :id)', () => {
    const protoIndex = (Target: any, name: string) =>
      Object.getOwnPropertyNames(Target.prototype).filter((n) => n !== 'constructor').indexOf(name);

    it('audit statistics/flagged/suspicious are declared before :id', () => {
      for (const name of ['getStatistics', 'getFlagged', 'detectSuspicious']) {
        expect(protoIndex(AuditLogController, name)).toBeGreaterThanOrEqual(0);
        expect(protoIndex(AuditLogController, name)).toBeLessThan(protoIndex(AuditLogController, 'findById'));
      }
    });

    it('skills expiring is declared before :id', () => {
      expect(protoIndex(SkillController, 'getExpiring')).toBeGreaterThanOrEqual(0);
      expect(protoIndex(SkillController, 'getExpiring')).toBeLessThan(protoIndex(SkillController, 'getSkill'));
    });
  });

  describe('suspicious-activity org scoping', () => {
    it('restricts the scanned users and published schedules to the caller organization', async () => {
      const prisma = {
        user: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
        schedule: { findMany: vi.fn().mockResolvedValue([]) },
        auditLog: { findMany: vi.fn().mockResolvedValue([]) },
      } as any;
      const service = new AuditLogService(prisma as any);
      await service.detectSuspiciousActivity(undefined, ORG);

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true }, where: { organizationId: ORG } }),
      );
      expect(prisma.schedule.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'published', organizationId: ORG }),
        }),
      );
    });

    it('returns no activities for a cross-organization userId probe', async () => {
      const prisma = {
        user: {
          findMany: vi.fn(),
          findUnique: vi.fn().mockResolvedValue({ organizationId: 'org-other' }),
        },
        schedule: { findMany: vi.fn() },
        auditLog: { findMany: vi.fn() },
      } as any;
      const service = new AuditLogService(prisma as any);
      const result = await service.detectSuspiciousActivity(TARGET, ORG);
      expect(result).toEqual([]);
      expect(prisma.user.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: TARGET } }),
      );
    });
  });
});