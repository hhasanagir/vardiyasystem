import { Test, TestingModule } from '@nestjs/testing';
import { InviteCodeService } from '../invite-code.service';
import { PrismaService } from '../../../prisma.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('InviteCodeService', () => {
  let service: InviteCodeService;
  let prisma: PrismaService;

  const mockPrisma = {
    inviteCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InviteCodeService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InviteCodeService>(InviteCodeService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  const activeInvite = {
    id: 'inv-1',
    code: 'A1B2C3D4E5F6',
    organizationId: 'org-1',
    createdById: 'user-1',
    maxUses: 1,
    useCount: 0,
    expiresAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('create', () => {
    it('should create an invite code', async () => {
      mockPrisma.inviteCode.create.mockResolvedValue(activeInvite);

      const result = await service.create('org-1', 'user-1');

      expect(result.code).toHaveLength(12);
      expect(result.organizationId).toBe('org-1');
      expect(mockPrisma.inviteCode.create).toHaveBeenCalledWith({
        data: {
          code: expect.any(String),
          organizationId: 'org-1',
          createdById: 'user-1',
          maxUses: 1,
          expiresAt: null,
        },
      });
    });

    it('should create with custom maxUses and expiration', async () => {
      mockPrisma.inviteCode.create.mockResolvedValue(activeInvite);

      await service.create('org-1', 'user-1', {
        maxUses: 5,
        expiresInHours: 48,
      });

      expect(mockPrisma.inviteCode.create).toHaveBeenCalledWith({
        data: {
          code: expect.any(String),
          organizationId: 'org-1',
          createdById: 'user-1',
          maxUses: 5,
          expiresAt: expect.any(Date),
        },
      });
    });
  });

  describe('validate', () => {
    it('should validate a valid invite code', async () => {
      mockPrisma.inviteCode.findUnique.mockResolvedValue(activeInvite);

      const result = await service.validate('a1b2c3d4e5f6');

      expect(result.organizationId).toBe('org-1');
      expect(mockPrisma.inviteCode.findUnique).toHaveBeenCalledWith({
        where: { code: 'A1B2C3D4E5F6' },
      });
    });

    it('should throw NotFoundException for unknown code', async () => {
      mockPrisma.inviteCode.findUnique.mockResolvedValue(null);

      await expect(service.validate('UNKNOWN')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException for inactive code', async () => {
      mockPrisma.inviteCode.findUnique.mockResolvedValue({
        ...activeInvite,
        isActive: false,
      });

      await expect(service.validate('INACTIVE')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for expired code', async () => {
      mockPrisma.inviteCode.findUnique.mockResolvedValue({
        ...activeInvite,
        expiresAt: new Date(Date.now() - 3600000),
      });

      await expect(service.validate('EXPIRED')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for maxed-out code', async () => {
      mockPrisma.inviteCode.findUnique.mockResolvedValue({
        ...activeInvite,
        maxUses: 1,
        useCount: 1,
      });

      await expect(service.validate('MAXED')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('consume', () => {
    it('should increment use count', async () => {
      mockPrisma.inviteCode.update.mockResolvedValue(activeInvite);

      await service.consume('A1B2C3D4E5F6');

      expect(mockPrisma.inviteCode.update).toHaveBeenCalledWith({
        where: { code: 'A1B2C3D4E5F6' },
        data: { useCount: { increment: 1 } },
      });
    });
  });

  describe('deactivate', () => {
    it('should deactivate an invite code', async () => {
      mockPrisma.inviteCode.update.mockResolvedValue({
        ...activeInvite,
        isActive: false,
      });

      await service.deactivate('inv-1');

      expect(mockPrisma.inviteCode.update).toHaveBeenCalledWith({
        where: { id: 'inv-1' },
        data: { isActive: false },
      });
    });
  });
});
