import { Test, TestingModule } from '@nestjs/testing';
import { AuthAttemptService } from '../auth-attempt.service';
import { RefreshTokenService } from '../refresh-token.service';
import { PrismaService } from '../../../prisma.service';
import { ConfigService } from '@nestjs/config';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { SessionService } from '../session.service';
import { UnauthorizedException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('AuthAttemptService', () => {
  let authAttemptService: AuthAttemptService;

  const mockPrisma = {
    authAttempt: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
      findMany: vi.fn().mockResolvedValue([]),
    },
    user: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultValue?: any) => {
      if (key === 'AUTH_LOCKOUT_THRESHOLD') return 5;
      if (key === 'AUTH_LOCKOUT_DURATION_MS') return 900000;
      if (key === 'AUTH_LOCKOUT_PROGRESSIVE_FACTOR') return 1.5;
      if (key === 'AUTH_LOCKOUT_MAX_DURATION_MS') return 86400000;
      if (defaultValue !== undefined) return defaultValue;
      return undefined;
    }),
  };

  const mockAuditLogService = {
    log: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthAttemptService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    authAttemptService = module.get<AuthAttemptService>(AuthAttemptService);
    vi.clearAllMocks();
  });

  describe('recordAttempt', () => {
    it('should record a login attempt', async () => {
      await authAttemptService.recordAttempt({
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        attemptType: 'LOGIN',
        success: false,
      });

      expect(mockPrisma.authAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          ipAddress: '192.168.1.1',
          attemptType: 'LOGIN',
          success: false,
        }),
      });
    });

    it('should lowercase email', async () => {
      await authAttemptService.recordAttempt({
        email: 'Test@Example.COM',
        attemptType: 'LOGIN',
        success: true,
      });

      expect(mockPrisma.authAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
        }),
      });
    });
  });

  describe('isLockedOut', () => {
    it('should return not locked when no lockout record', async () => {
      mockPrisma.authAttempt.findFirst.mockResolvedValue(null);

      const result = await authAttemptService.isLockedOut({
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
      });

      expect(result.locked).toBe(false);
      expect(result.remainingMs).toBe(0);
    });

    it('should return locked when lockout is active', async () => {
      const futureDate = new Date(Date.now() + 60000);
      mockPrisma.authAttempt.findFirst.mockResolvedValue({
        lockoutUntil: futureDate,
      });

      const result = await authAttemptService.isLockedOut({
        email: 'test@example.com',
      });

      expect(result.locked).toBe(true);
      expect(result.remainingMs).toBeGreaterThan(0);
    });

    it('should return not locked when lockout has expired', async () => {
      const pastDate = new Date(Date.now() - 60000);
      mockPrisma.authAttempt.findFirst.mockResolvedValue(null);

      const result = await authAttemptService.isLockedOut({
        email: 'test@example.com',
      });

      expect(result.locked).toBe(false);
    });
  });

  describe('getConsecutiveFailures', () => {
    it('should count consecutive failures', async () => {
      const recentFailures = Array.from({ length: 3 }, (_, i) => ({
        attemptType: 'LOGIN',
        success: false,
      }));
      mockPrisma.authAttempt.findMany.mockResolvedValue(recentFailures);

      const count = await authAttemptService.getConsecutiveFailures({
        email: 'test@example.com',
      });

      expect(count).toBe(3);
    });

    it('should stop counting at first success', async () => {
      const mixed = [
        { attemptType: 'LOGIN', success: false },
        { attemptType: 'LOGIN', success: false },
        { attemptType: 'LOGIN', success: true },
        { attemptType: 'LOGIN', success: false },
      ];
      mockPrisma.authAttempt.findMany.mockResolvedValue(mixed);

      const count = await authAttemptService.getConsecutiveFailures({
        email: 'test@example.com',
      });

      expect(count).toBe(2);
    });

    it('should return 0 when empty', async () => {
      mockPrisma.authAttempt.findMany.mockResolvedValue([]);

      const count = await authAttemptService.getConsecutiveFailures({
        email: 'test@example.com',
      });

      expect(count).toBe(0);
    });
  });

  describe('applyLockout', () => {
    it('should not apply lockout below threshold', async () => {
      const result = await authAttemptService.applyLockout({
        email: 'test@example.com',
        ipAddress: '192.168.1.1',
        failureCount: 3,
      });

      expect(result).toBeNull();
      expect(mockPrisma.authAttempt.create).not.toHaveBeenCalled();
    });

    it('should apply lockout at threshold', async () => {
      mockPrisma.user.findFirst.mockResolvedValue({ id: 'user-1' });

      const result = await authAttemptService.applyLockout({
        email: 'test@example.com',
        failureCount: 5,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.authAttempt.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: 'test@example.com',
          attemptType: 'LOCKOUT',
          success: false,
        }),
      });
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          action: 'LOCKOUT',
          entityType: 'AUTH',
          reason: expect.stringContaining('5 failures'),
        }),
      );
    });

    it('should skip audit log when locked email has no user account', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await authAttemptService.applyLockout({
        email: 'ghost@example.com',
        failureCount: 5,
      });

      expect(result).not.toBeNull();
      expect(mockPrisma.authAttempt.create).toHaveBeenCalled();
      expect(mockAuditLogService.log).not.toHaveBeenCalled();
    });

    it('should apply progressive longer lockout for repeated offenses', async () => {
      await authAttemptService.applyLockout({
        email: 'test@example.com',
        failureCount: 8,
      });

      const createCall = mockPrisma.authAttempt.create.mock.calls[0][0];
      const metadata = createCall.data.metadata;
      expect(metadata.durationMs).toBeGreaterThan(900000);
    });
  });

  describe('getRecentFailures', () => {
    it('should count failures within window', async () => {
      mockPrisma.authAttempt.count.mockResolvedValue(5);

      const count = await authAttemptService.getRecentFailures({
        email: 'test@example.com',
        windowMs: 60000,
      });

      expect(count).toBe(5);
    });
  });
});

describe('RefreshTokenService', () => {
  let refreshTokenService: RefreshTokenService;

  const mockPrisma = {
    authAttempt: {
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  const mockAuditLogService = {
    log: vi.fn().mockResolvedValue({}),
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultValue?: any) => defaultValue),
  };

  const mockSessionService = {
    updateLastUsed: vi.fn().mockResolvedValue(undefined),
    hashToken: vi.fn().mockReturnValue('hashed'),
    cleanExpired: vi.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: SessionService, useValue: mockSessionService },
      ],
    }).compile();

    refreshTokenService = module.get<RefreshTokenService>(RefreshTokenService);
    vi.clearAllMocks();
  });

  describe('detectReplay', () => {
    it('should not detect replay on first use', async () => {
      const result = await refreshTokenService.detectReplay({
        jti: 'test-jti-1',
        userId: 'user-1',
        ipAddress: '192.168.1.1',
      });

      expect(result).toEqual({ replay: false });
    });

    it('should detect replay on second use with same jti', async () => {
      await refreshTokenService.markUsed({
        jti: 'test-jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
        ipAddress: '192.168.1.1',
      });

      const result = await refreshTokenService.detectReplay({
        jti: 'test-jti-1',
        userId: 'user-1',
        ipAddress: '192.168.1.2',
      });

      expect(result.replay).toBe(true);
      expect(result.firstIp).toBe('192.168.1.1');
      expect(mockAuditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'REFRESH_REPLAY',
          reason: expect.stringContaining('replay'),
        }),
      );
    });

    it('should not confuse different jtis', async () => {
      await refreshTokenService.markUsed({
        jti: 'test-jti-1',
        userId: 'user-1',
        sessionId: 'session-1',
      });

      const result = await refreshTokenService.detectReplay({
        jti: 'test-jti-2',
        userId: 'user-1',
      });

      expect(result).toEqual({ replay: false });
    });
  });
});
