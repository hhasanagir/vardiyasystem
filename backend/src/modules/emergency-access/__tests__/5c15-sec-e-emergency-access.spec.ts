import 'reflect-metadata';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { EmergencyAccessService } from '../emergency-access.service';
import { PrismaService } from '../../../prisma.service';

/**
 * Phase 5C.15 — E: emergency access must be organization-scoped.
 *
 * An org admin may only grant/revoke/list emergency access for users within
 * their own organization. Cross-organization grants must be rejected with 403
 * and list endpoints must be filtered by the caller's organization.
 */
describe('Phase 5C.15 — E: emergency-access org scope', () => {
  let service: EmergencyAccessService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      emergencyAccessGrant: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      user: { findUnique: vi.fn() },
    };
    service = new EmergencyAccessService(prisma as unknown as PrismaService);
  });

  describe('requestAccess', () => {
    it('rejects a grant for a user in another organization (cross-org => 403)', async () => {
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ organizationId: 'org-B' });

      await expect(
        service.requestAccess(
          { userId: 'u-target', grantedById: 'u-caller', reason: 'x', justification: 'y' },
          'org-A',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows a grant when the target user belongs to the caller organization', async () => {
      prisma.emergencyAccessGrant.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ organizationId: 'org-A' });
      prisma.emergencyAccessGrant.create.mockResolvedValue({ id: 'g-1' });

      const created = await service.requestAccess(
        { userId: 'u-target', grantedById: 'u-caller', reason: 'x', justification: 'y' },
        'org-A',
      );

      expect(created.id).toBe('g-1');
      expect(prisma.emergencyAccessGrant.create).toHaveBeenCalled();
    });
  });

  describe('revokeAccess', () => {
    it('rejects revoking a grant whose user belongs to another organization', async () => {
      prisma.emergencyAccessGrant.findUnique.mockResolvedValue({
        id: 'g-1',
        isActive: true,
        user: { organizationId: 'org-B' },
      });

      await expect(
        service.revokeAccess('g-1', 'u-caller', 'org-A'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows revocation within the same organization', async () => {
      prisma.emergencyAccessGrant.findUnique.mockResolvedValue({
        id: 'g-1',
        isActive: true,
        accessLog: {},
        user: { organizationId: 'org-A' },
      });
      prisma.emergencyAccessGrant.update.mockResolvedValue({ id: 'g-1' });

      const updated = await service.revokeAccess('g-1', 'u-caller', 'org-A');

      expect(updated.id).toBe('g-1');
    });
  });

  describe('getActiveGrants', () => {
    it('filters active grants to the caller organization via the user relation', async () => {
      prisma.emergencyAccessGrant.findMany.mockResolvedValue([]);

      await service.getActiveGrants('org-A');

      expect(prisma.emergencyAccessGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user: { organizationId: 'org-A' } }),
        }),
      );
    });
  });

  describe('getGrantHistory', () => {
    it('filters history to the caller organization', async () => {
      prisma.emergencyAccessGrant.findMany.mockResolvedValue([]);

      await service.getGrantHistory(undefined, 'org-A');

      expect(prisma.emergencyAccessGrant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ user: { organizationId: 'org-A' } }),
        }),
      );
    });
  });
});
