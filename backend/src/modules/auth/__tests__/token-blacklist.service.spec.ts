import { Test, TestingModule } from '@nestjs/testing';
import { TokenBlacklistService } from '../token-blacklist.service';
import { PrismaService } from '../../../prisma.service';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let prisma: PrismaService;

  const mockPrisma = {
    tokenBlacklist: {
      create: vi.fn(),
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenBlacklistService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<TokenBlacklistService>(TokenBlacklistService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
  });

  describe('add', () => {
    it('should create a blacklist entry', async () => {
      mockPrisma.tokenBlacklist.create.mockResolvedValue({
        id: 'bl-1',
        jti: 'test-jti',
      });

      await service.add('test-jti', 'user-1', 'User logout');

      expect(mockPrisma.tokenBlacklist.create).toHaveBeenCalledWith({
        data: {
          jti: 'test-jti',
          userId: 'user-1',
          reason: 'User logout',
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should not throw on duplicate jti', async () => {
      mockPrisma.tokenBlacklist.create.mockRejectedValue(
        new Error('Unique constraint'),
      );

      await expect(service.add('dup-jti', 'user-1')).resolves.toBeUndefined();
    });
  });

  describe('isBlacklisted', () => {
    it('should return true if jti is blacklisted', async () => {
      mockPrisma.tokenBlacklist.findUnique.mockResolvedValue({ id: 'bl-1' });

      const result = await service.isBlacklisted('test-jti');

      expect(result).toBe(true);
      expect(mockPrisma.tokenBlacklist.findUnique).toHaveBeenCalledWith({
        where: { jti: 'test-jti' },
        select: { id: true },
      });
    });

    it('should return false if jti is not blacklisted', async () => {
      mockPrisma.tokenBlacklist.findUnique.mockResolvedValue(null);

      const result = await service.isBlacklisted('unknown-jti');

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired entries', async () => {
      mockPrisma.tokenBlacklist.deleteMany.mockResolvedValue({ count: 5 });

      const result = await service.cleanupExpired();

      expect(result).toBe(5);
      expect(mockPrisma.tokenBlacklist.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });
  });
});
