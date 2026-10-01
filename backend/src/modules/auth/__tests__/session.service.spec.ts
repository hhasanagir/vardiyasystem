import { Test, TestingModule } from '@nestjs/testing';
import { SessionService } from '../session.service';
import { PrismaService } from '../../../prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { NotFoundException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('SessionService', () => {
  let service: SessionService;

  const mockAuthSession = {
    id: 'session-1',
    userId: 'user-1',
    hashedToken: '',
    jti: 'jti-1',
    ipAddress: '192.168.1.1',
    userAgent: 'test-agent',
    deviceInfo: null,
    lastUsedAt: new Date(),
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
    createdAt: new Date(),
  };

  const mockPrisma = {
    authSession: {
      create: vi.fn().mockResolvedValue(mockAuthSession),
      findUnique: vi.fn().mockResolvedValue(mockAuthSession),
      findFirst: vi.fn().mockResolvedValue(mockAuthSession),
      findMany: vi.fn().mockResolvedValue([mockAuthSession]),
      update: vi.fn().mockResolvedValue(mockAuthSession),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      deleteMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultValue?: any) => defaultValue),
  };

  const mockAuditLogService = {
    log: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<SessionService>(SessionService);
    vi.clearAllMocks();
  });

  describe('hashToken', () => {
    it('should produce SHA-256 hash', () => {
      const hash = service.hashToken('test-token');
      expect(hash).toBe(
        '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e',
      );
    });

    it('should produce consistent hashes for same input', () => {
      const hash1 = service.hashToken('same-token');
      const hash2 = service.hashToken('same-token');
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hashToken('token-a');
      const hash2 = service.hashToken('token-b');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createSession', () => {
    it('should create a new session', async () => {
      const result = await service.createSession({
        userId: 'user-1',
        jti: 'jti-1',
        ipAddress: '192.168.1.1',
        userAgent: 'test-agent',
        expiresAt: new Date(Date.now() + 86400000),
      });

      expect(result.id).toBe('session-1');
      expect(result.userId).toBe('user-1');
      expect(mockPrisma.authSession.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-1',
          jti: 'jti-1',
          ipAddress: '192.168.1.1',
          userAgent: 'test-agent',
        }),
      });
    });

    it('should generate jti if not provided', async () => {
      await service.createSession({
        userId: 'user-1',
        expiresAt: new Date(Date.now() + 86400000),
      });

      const createCall = mockPrisma.authSession.create.mock.calls[0][0];
      expect(createCall.data.jti).toBeDefined();
      expect(createCall.data.jti.length).toBe(36);
    });
  });

  describe('linkTokenToSession', () => {
    it('should update hashed token on session', async () => {
      await service.linkTokenToSession('session-1', 'raw-refresh-token');

      expect(mockPrisma.authSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { hashedToken: expect.any(String) },
      });
    });
  });

  describe('findByToken', () => {
    it('should find session by hashed token', async () => {
      const result = await service.findByToken('raw-refresh-token');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('session-1');
    });

    it('should return null when session not found', async () => {
      mockPrisma.authSession.findFirst.mockResolvedValue(null);
      const result = await service.findByToken('unknown-token');
      expect(result).toBeNull();
    });
  });

  describe('findByUser', () => {
    it('should return sessions for user ordered by lastUsedAt desc', async () => {
      const result = await service.findByUser('user-1');
      expect(result).toHaveLength(1);
      expect(mockPrisma.authSession.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { lastUsedAt: 'desc' },
      });
    });
  });

  describe('updateLastUsed', () => {
    it('should update lastUsedAt timestamp', async () => {
      await service.updateLastUsed('session-1');
      expect(mockPrisma.authSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { lastUsedAt: expect.any(Date) },
      });
    });
  });

  describe('revoke', () => {
    it('should revoke an active session', async () => {
      mockPrisma.authSession.findUnique.mockResolvedValue(mockAuthSession);

      await service.revoke('session-1', 'user-1', 'User logout');

      expect(mockPrisma.authSession.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: { revokedAt: expect.any(Date) },
      });
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SESSION_REVOKED',
          entityType: 'AUTH_SESSION',
          entityId: 'session-1',
        }),
      );
    });

    it('should throw NotFoundException if session does not exist', async () => {
      mockPrisma.authSession.findUnique.mockResolvedValue(null);

      await expect(service.revoke('session-404', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if session belongs to another user', async () => {
      const otherUserSession = { ...mockAuthSession, userId: 'other-user' };
      mockPrisma.authSession.findUnique.mockResolvedValue(otherUserSession);

      await expect(service.revoke('session-1', 'user-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should be idempotent if already revoked', async () => {
      const revokedSession = { ...mockAuthSession, revokedAt: new Date() };
      mockPrisma.authSession.findUnique.mockResolvedValue(revokedSession);

      await service.revoke('session-1', 'user-1');
      expect(mockPrisma.authSession.update).not.toHaveBeenCalled();
    });
  });

  describe('revokeAllForUser', () => {
    it('should revoke all non-revoked sessions for user', async () => {
      const count = await service.revokeAllForUser('user-1');
      expect(count).toBe(1);
      expect(mockPrisma.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should exclude current session when specified', async () => {
      await service.revokeAllForUser('user-1', 'current-session-id');
      expect(mockPrisma.authSession.updateMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          revokedAt: null,
          id: { not: 'current-session-id' },
        },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('isSessionValid', () => {
    it('should return true for active session', async () => {
      mockPrisma.authSession.findUnique.mockResolvedValue(mockAuthSession);
      const valid = await service.isSessionValid('session-1');
      expect(valid).toBe(true);
    });

    it('should return false for revoked session', async () => {
      mockPrisma.authSession.findUnique.mockResolvedValue({
        ...mockAuthSession,
        revokedAt: new Date(),
      });
      const valid = await service.isSessionValid('session-1');
      expect(valid).toBe(false);
    });

    it('should return false for expired session', async () => {
      mockPrisma.authSession.findUnique.mockResolvedValue({
        ...mockAuthSession,
        expiresAt: new Date(Date.now() - 1000),
      });
      const valid = await service.isSessionValid('session-1');
      expect(valid).toBe(false);
    });

    it('should return false if session not found', async () => {
      mockPrisma.authSession.findUnique.mockRejectedValue(
        new Error('not found'),
      );
      const valid = await service.isSessionValid('session-404');
      expect(valid).toBe(false);
    });
  });

  describe('cleanExpired', () => {
    it('should delete expired and revoked sessions', async () => {
      const count = await service.cleanExpired();
      expect(count).toBe(2);
      expect(mockPrisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: {
          revokedAt: { not: null },
          expiresAt: { lt: expect.any(Date) },
        },
      });
    });
  });
});
