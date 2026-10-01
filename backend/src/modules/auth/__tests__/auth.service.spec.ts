import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../auth.service';
import { PrismaService } from '../../../prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as bcrypt from 'bcrypt';
import { AuthAttemptService } from '../auth-attempt.service';
import { RefreshTokenService } from '../refresh-token.service';
import { SessionService } from '../session.service';
import { InviteCodeService } from '../invite-code.service';
import { TokenBlacklistService } from '../token-blacklist.service';
import { AuditLogService } from '../../audit-log/audit-log.service';
import { MetricsService } from '../../../metrics/metrics.service';
import { RbacService } from '../../rbac/rbac.service';

vi.mock('bcrypt');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockPrisma = {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn((cb: (tx: any) => any) => cb(mockPrisma)),
  };

  const mockJwtService = {
    sign: vi.fn().mockReturnValue('mock-jwt-token'),
    verify: vi.fn().mockReturnValue({ sub: 'user-1', jti: 'test-jti' }),
  };

  const mockConfigService = {
    get: vi.fn((key: string, defaultValue?: any) => {
      if (
        key === 'JWT_REFRESH_TOKEN_SECRET' ||
        key === 'JWT_REFRESH_SECRET' ||
        key === 'JWT_SECRET'
      )
        return 'test-refresh-secret';
      if (key === 'JWT_REFRESH_TOKEN_EXPIRES_IN') return '7d';
      if (key === 'AUTH_LOGIN_WINDOW_MS') return 60000;
      if (key === 'AUTH_LOCKOUT_THRESHOLD') return 5;
      if (key === 'AUTH_LOCKOUT_DURATION_MS') return 900000;
      if (key === 'AUTH_LOCKOUT_PROGRESSIVE_FACTOR') return 1.5;
      if (key === 'AUTH_LOCKOUT_MAX_DURATION_MS') return 86400000;
      return defaultValue;
    }),
  };

  const mockAuthAttemptService = {
    isLockedOut: vi.fn().mockResolvedValue({ locked: false, remainingMs: 0 }),
    getConsecutiveFailures: vi.fn().mockResolvedValue(0),
    recordAttempt: vi.fn().mockResolvedValue(undefined),
    getRecentFailures: vi.fn().mockResolvedValue(0),
    applyLockout: vi.fn().mockResolvedValue(null),
  };

  const mockRefreshTokenService = {
    markUsed: vi.fn().mockResolvedValue(undefined),
    detectReplay: vi.fn().mockResolvedValue({ replay: false }),
    checkPriorRefresh: vi.fn().mockResolvedValue(0),
  };

  const mockSessionService = {
    createSession: vi
      .fn()
      .mockResolvedValue({ id: 'session-1', userId: 'user-1' }),
    linkTokenToSession: vi.fn().mockResolvedValue(undefined),
    findByToken: vi.fn().mockResolvedValue(null),
    revoke: vi.fn().mockResolvedValue(undefined),
    revokeAllForUser: vi.fn().mockResolvedValue(1),
    findByUser: vi.fn().mockResolvedValue([]),
    updateLastUsed: vi.fn().mockResolvedValue(undefined),
    cleanExpired: vi.fn().mockResolvedValue(0),
  };

  const mockInviteCodeService = {
    validate: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
    consume: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(),
    deactivate: vi.fn(),
  };

  const mockTokenBlacklistService = {
    add: vi.fn().mockResolvedValue(undefined),
    isBlacklisted: vi.fn().mockResolvedValue(false),
    cleanupExpired: vi.fn().mockResolvedValue(0),
  };

  const mockAuditLog = {
    log: vi.fn().mockResolvedValue(undefined),
  };

  const mockMetrics = {
    authLoginTotal: { inc: vi.fn() },
    authLoginDuration: { observe: vi.fn() },
    httpRequestsTotal: { inc: vi.fn() },
    httpRequestDuration: { observe: vi.fn() },
    httpInFlightRequests: { inc: vi.fn(), dec: vi.fn() },
    wsConnectionsGauge: { inc: vi.fn(), dec: vi.fn() },
    wsEventsTotal: { inc: vi.fn() },
    wsErrorsTotal: { inc: vi.fn() },
    shiftCreatedTotal: { inc: vi.fn() },
    swapRequestTotal: { inc: vi.fn() },
    notificationDeliveredTotal: { inc: vi.fn() },
    notificationFailedTotal: { inc: vi.fn() },
    dbQueryDuration: { observe: vi.fn() },
    dbSlowQueriesTotal: { inc: vi.fn() },
    dbQueriesTotal: { inc: vi.fn() },
    incidentCreatedTotal: { inc: vi.fn() },
  };

  const mockRbacService = {
    ensureUserHasRbacRole: vi.fn().mockResolvedValue(undefined),
    getUserMaxRoleLevel: vi.fn().mockResolvedValue(4),
    enrichUserWithPermissions: vi.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AuthAttemptService, useValue: mockAuthAttemptService },
        { provide: RefreshTokenService, useValue: mockRefreshTokenService },
        { provide: SessionService, useValue: mockSessionService },
        { provide: InviteCodeService, useValue: mockInviteCodeService },
        { provide: TokenBlacklistService, useValue: mockTokenBlacklistService },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: MetricsService, useValue: mockMetrics },
        { provide: RbacService, useValue: mockRbacService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);

    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user with valid invite code', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User',
        inviteCode: 'VALIDCODE',
      };

      mockPrisma.user.findUnique.mockResolvedValue(null);
      vi.mocked(bcrypt.hash).mockResolvedValue('hashed-password' as never);
      mockPrisma.user.create.mockResolvedValue({
        id: 'user-1',
        email: dto.email,
        name: dto.name,
        role: 'guest',
      });

      const result = await service.register(dto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe(dto.email);
      expect(mockInviteCodeService.validate).toHaveBeenCalledWith('VALIDCODE');
      expect(mockInviteCodeService.consume).toHaveBeenCalledWith('VALIDCODE');
      expect(mockPrisma.user.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if email exists', async () => {
      const dto = {
        email: 'existing@example.com',
        password: 'Password1',
        name: 'Test',
        inviteCode: 'CODE',
      };
      mockPrisma.user.findUnique.mockResolvedValue({ id: 'existing' });

      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
    });

    it('should reject registration with invalid invite code', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'password',
        name: 'Test',
        inviteCode: 'INVALID',
      };
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockInviteCodeService.validate.mockRejectedValue(
        new BadRequestException('Geçersiz davet kodu'),
      );

      await expect(service.register(dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const user = {
        id: 'user-1',
        email: dto.email,
        password: 'hashed-password',
        name: 'Test User',
        role: 'hospital_admin',
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.login(dto);

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.user.email).toBe(dto.email);
    });

    it('should throw UnauthorizedException for invalid email', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'invalid', password: 'pass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid password', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: 'test@example.com',
        password: 'hashed',
      });
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login({ email: 'test@example.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user data', async () => {
      const user = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        role: 'hospital_admin',
        organizationId: 'org-1',
        unitId: null,
      };

      mockPrisma.user.findUnique.mockResolvedValue(user);

      const result = await service.validateUser('user-1');

      expect(result).toEqual(user);
    });
  });
});
