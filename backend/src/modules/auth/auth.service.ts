import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { AuthAttemptService } from './auth-attempt.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionService, SessionInfo } from './session.service';
import { InviteCodeService } from './invite-code.service';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { MetricsService } from '../../metrics/metrics.service';
import { RbacService } from '../rbac/rbac.service';
import { ROLE_LEVELS } from '../rbac/interfaces/rbac.types';

interface TokenUser {
  id: string;
  email: string;
  name: string;
  role: string;
  organizationId: string | null;
  unitId: string | null;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private authAttemptService: AuthAttemptService,
    private refreshTokenService: RefreshTokenService,
    private sessionService: SessionService,
    private inviteCodeService: InviteCodeService,
    private tokenBlacklistService: TokenBlacklistService,
    private auditLog: AuditLogService,
    private metrics: MetricsService,
    private rbacService: RbacService,
  ) {
    setInterval(() => this.tokenBlacklistService.cleanupExpired(), 300000);
  }

  async register(dto: CreateUserDto) {
    const { organizationId } = await this.inviteCodeService.validate(
      dto.inviteCode,
    );

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new BadRequestException('Registration failed');
    }

    const SELF_REGISTERABLE_ROLES = new Set([
      'guest',
      'secretary',
      'assistant_technician',
      'technician',
    ]);
    const assignedRole =
      dto.role && SELF_REGISTERABLE_ROLES.has(dto.role) ? dto.role : 'guest';

    const hashedPassword = await bcrypt.hash(dto.password, 13);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: dto.email,
          password: hashedPassword,
          name: dto.name,
          role: assignedRole as UserRole,
          organizationId,
          unitId: dto.unitId,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          unitId: true,
        },
      });
      await this.inviteCodeService.consume(dto.inviteCode);
      return created;
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'REGISTER',
        entityType: 'user',
        entityId: user.id,
        after: {
          email: user.email,
          name: user.name,
          role: user.role,
          organizationId,
        },
      })
      .catch(() => {});

    this.rbacService
      .ensureUserHasRbacRole(user.id, user.role, { organizationId })
      .catch((err) =>
        this.logger.warn(
          'Failed to auto-assign RBAC role on register',
          (err as Error).message,
        ),
      );

    return this.generateToken(user);
  }

  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const emailLower = dto.email.toLowerCase();
    const loginStart = Date.now();
    const trackResult = (status: string) => {
      this.metrics.authLoginTotal.inc({ status });
      this.metrics.authLoginDuration.observe(
        {},
        (Date.now() - loginStart) / 1000,
      );
    };

    const lockoutCheck = await this.authAttemptService.isLockedOut({
      email: emailLower,
      ipAddress,
    });
    if (lockoutCheck.locked) {
      this.logger.warn(
        `Login blocked by lockout: ${emailLower} from ${ipAddress}`,
      );
      await this.authAttemptService.recordAttempt({
        email: emailLower,
        ipAddress,
        userAgent,
        attemptType: 'LOGIN_BLOCKED',
        success: false,
        metadata: { reason: 'lockout', remainingMs: lockoutCheck.remainingMs },
      });
      trackResult('blocked');
      throw new UnauthorizedException('Invalid credentials');
    }

    const recentFailures = await this.authAttemptService.getConsecutiveFailures(
      {
        email: emailLower,
        ipAddress,
      },
    );
    if (recentFailures >= 3) {
      const delay = Math.min(500 * Math.pow(2, recentFailures - 3), 5000);
      this.logger.debug(`Progressive delay: ${delay}ms for ${emailLower}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    let user: any;
    try {
      user = await this.prisma.user.findUnique({
        where: { email: emailLower },
      });
    } catch {
      user = null;
    }

    let passwordValid = false;
    if (user) {
      try {
        passwordValid = await bcrypt.compare(dto.password, user.password);
      } catch {
        passwordValid = false;
      }
    }

    if (!user || !passwordValid) {
      await this.authAttemptService.recordAttempt({
        email: emailLower,
        ipAddress,
        userAgent,
        attemptType: 'LOGIN',
        success: false,
      });

      if (emailLower) {
        const totalFailures = await this.authAttemptService.getRecentFailures({
          email: emailLower,
          ipAddress,
          windowMs: this.configService.get<number>(
            'AUTH_LOGIN_WINDOW_MS',
            60000,
          ),
        });
        await this.authAttemptService.applyLockout({
          email: emailLower,
          ipAddress,
          failureCount: totalFailures,
          userAgent,
        });
      }

      trackResult('failure');
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.authAttemptService.recordAttempt({
      email: emailLower,
      ipAddress,
      userAgent,
      attemptType: 'LOGIN',
      success: true,
    });

    this.auditLog
      .log({
        userId: user.id,
        action: 'LOGIN',
        entityType: 'AUTH',
        entityId: user.id,
        ipAddress,
        userAgent,
        metadata: { email: emailLower },
      })
      .catch((err) =>
        this.logger.warn('Failed to log LOGIN audit', (err as Error).message),
      );

    this.logger.log(`Successful login: ${emailLower} from ${ipAddress}`);
    trackResult('success');

    this.rbacService
      .ensureUserHasRbacRole(user.id, user.role, {
        organizationId: user.organizationId,
        unitId: user.unitId,
      })
      .catch((err) =>
        this.logger.warn(
          'Failed to auto-assign RBAC role on login',
          (err as Error).message,
        ),
      );

    return this.generateToken(user, ipAddress, userAgent);
  }

  async refreshToken(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    try {
      const refreshSecret = this.getRefreshSecret();
      const accessSecret =
        this.configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ||
        this.configService.get<string>('JWT_SECRET');

      const payload: any = this.jwtService.verify(refreshToken, {
        secret: refreshSecret,
        algorithms: ['HS256'],
      });

      if (!payload || !payload.sub || !payload.jti) {
        await this.auditRefreshAttempt(
          null,
          'INVALID_PAYLOAD',
          ipAddress,
          userAgent,
          refreshToken,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (await this.tokenBlacklistService.isBlacklisted(payload.jti)) {
        await this.auditRefreshAttempt(
          payload.sub,
          'BLACKLISTED',
          ipAddress,
          userAgent,
          payload.jti,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      const session = await this.sessionService.findByToken(refreshToken);

      if (!session) {
        await this.auditRefreshAttempt(
          payload.sub,
          'SESSION_NOT_FOUND',
          ipAddress,
          userAgent,
          payload.jti,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (!session.isActive) {
        await this.auditRefreshAttempt(
          payload.sub,
          'SESSION_INACTIVE',
          ipAddress,
          userAgent,
          payload.jti,
        );
        await this.tokenBlacklistService.add(
          payload.jti,
          payload.sub,
          'Session inactive',
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      const replayResult = await this.refreshTokenService.detectReplay({
        jti: payload.jti,
        userId: payload.sub,
        sessionId: session.id,
        ipAddress,
        userAgent,
      });
      if (replayResult.replay) {
        const sameIp =
          replayResult.firstIp &&
          ipAddress &&
          replayResult.firstIp === ipAddress;
        if (sameIp) {
          this.logger.warn(
            `Refresh token replay from same IP (multi-tab): jti=${payload.jti}, userId=${payload.sub}`,
          );
        } else {
          await this.tokenBlacklistService.add(
            payload.jti,
            payload.sub,
            'Token replay detected',
          );
          await this.sessionService.revoke(
            session.id,
            payload.sub,
            'Token replay detected',
          );
        }
        await this.auditRefreshAttempt(
          payload.sub,
          'REPLAY',
          ipAddress,
          userAgent,
          payload.jti,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          organizationId: true,
          unitId: true,
        },
      });

      if (!user) {
        await this.auditRefreshAttempt(
          payload.sub,
          'USER_NOT_FOUND',
          ipAddress,
          userAgent,
          payload.jti,
        );
        throw new UnauthorizedException('Invalid refresh token');
      }

      await this.refreshTokenService.markUsed({
        jti: payload.jti,
        userId: payload.sub,
        sessionId: session.id,
        ipAddress,
        userAgent,
      });

      await this.tokenBlacklistService.add(
        payload.jti,
        payload.sub,
        'Token rotated on refresh',
      );

      this.logger.log(
        `Token refreshed for user ${user.email} (jti ${payload.jti} rotated)`,
      );
      return this.generateToken(user, ipAddress, userAgent);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      await this.auditRefreshAttempt(
        null,
        'VERIFY_FAILED',
        ipAddress,
        userAgent,
        refreshToken?.slice(0, 20),
      );
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async auditRefreshAttempt(
    userId: string | null,
    reason: string,
    ipAddress?: string,
    userAgent?: string,
    tokenRef?: string,
  ) {
    this.logger.warn(
      `Refresh token rejected: ${reason} user=${userId} ip=${ipAddress}`,
    );
    try {
      await this.authAttemptService.recordAttempt({
        userId: userId || undefined,
        ipAddress,
        userAgent,
        attemptType: `REFRESH_${reason}`,
        success: false,
        jti:
          typeof tokenRef === 'string' && tokenRef.length === 36
            ? tokenRef
            : undefined,
        metadata: { userId, reason },
      });
      const criticalReasons = ['REPLAY', 'BLACKLISTED', 'SESSION_INACTIVE'];
      if (criticalReasons.includes(reason) && userId) {
        await this.auditLog.log({
          userId,
          action: 'REFRESH_REJECTED',
          entityType: 'AUTH',
          entityId: userId,
          ipAddress,
          userAgent,
          reason: `Refresh token rejected: ${reason}`,
          metadata: { reason, jti: tokenRef },
        });
      }
    } catch (err) {
      this.logger.warn('auditRefreshAttempt failed', (err as Error).message);
    }
  }

  async logout(userId: string, token?: string, sessionId?: string) {
    if (token) {
      await this.tokenBlacklistService.add(token, userId, 'User logout');
    }

    if (sessionId) {
      try {
        await this.sessionService.revoke(sessionId, userId, 'User logout');
      } catch (err) {
        this.logger.warn(
          'Failed to revoke session on logout',
          (err as Error).message,
        );
      }
    }

    try {
      await this.authAttemptService.recordAttempt({
        userId,
        attemptType: 'LOGOUT',
        success: true,
        metadata: { sessionId },
      });
    } catch (err) {
      this.logger.warn(
        'Failed to record LOGOUT attempt',
        (err as Error).message,
      );
    }

    this.auditLog
      .log({
        userId,
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityId: sessionId || userId,
        reason: 'User logout',
        metadata: { sessionId },
      })
      .catch((err) =>
        this.logger.warn('Failed to log LOGOUT audit', (err as Error).message),
      );

    this.logger.log(`User ${userId} logged out`);
    return { success: true, message: 'Logged out successfully' };
  }

  async logoutAll(userId: string, token?: string, currentSessionId?: string) {
    if (token) {
      await this.tokenBlacklistService.add(token, userId, 'User logout all');
    }

    const count = await this.sessionService.revokeAllForUser(
      userId,
      currentSessionId,
    );

    try {
      await this.authAttemptService.recordAttempt({
        userId,
        attemptType: 'LOGOUT_ALL',
        success: true,
        metadata: { revokedCount: count, excludeSessionId: currentSessionId },
      });
    } catch (err) {
      this.logger.warn(
        'Failed to record LOGOUT_ALL attempt',
        (err as Error).message,
      );
    }

    this.auditLog
      .log({
        userId,
        action: 'LOGOUT_ALL',
        entityType: 'AUTH',
        entityId: userId,
        reason: 'User logged out from all devices',
        metadata: { revokedCount: count, excludeSessionId: currentSessionId },
      })
      .catch((err) =>
        this.logger.warn(
          'Failed to log LOGOUT_ALL audit',
          (err as Error).message,
        ),
      );

    this.logger.log(
      `User ${userId} logged out from all devices (${count} sessions)`,
    );
    return {
      success: true,
      message: 'Logged out from all devices',
      revokedSessions: count,
    };
  }

  async getSessions(userId: string): Promise<SessionInfo[]> {
    return this.sessionService.findByUser(userId);
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.sessionService.revoke(
      sessionId,
      userId,
      'User initiated revocation',
    );
  }

  async unlockAccount(
    targetEmail: string,
    adminUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const unlocked = await this.authAttemptService.unlockAccount({
      email: targetEmail,
    });
    if (!unlocked) {
      return {
        success: false,
        message: 'No active lockout found for this account',
      };
    }

    this.auditLog
      .log({
        userId: adminUserId,
        action: 'ACCOUNT_UNLOCKED',
        entityType: 'AUTH',
        entityId: targetEmail,
        reason: 'Admin-initiated account unlock',
      })
      .catch(() => {});

    return { success: true, message: 'Account unlocked successfully' };
  }

  async validateUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        organizationId: true,
        unitId: true,
      },
    });
  }

  private async generateToken(
    user: TokenUser,
    ipAddress?: string,
    userAgent?: string,
  ) {
    const jti = randomUUID();

    let rbacLevel = 0;
    try {
      rbacLevel = await this.rbacService.getUserMaxRoleLevel(user.id);
    } catch {
      // non-blocking — fall back to legacy role level
    }

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      jti,
      rbacLevel,
    };

    const refreshSecret = this.getRefreshSecret();

    const expiresIn = this.configService.get<string>(
      'JWT_REFRESH_TOKEN_EXPIRES_IN',
      '7d',
    );
    const refreshToken = this.jwtService.sign(payload, {
      secret: refreshSecret,
      expiresIn,
    });

    const expiresAt = new Date(Date.now() + this.parseExpiresIn(expiresIn));

    const session = await this.sessionService.createSession({
      userId: user.id,
      jti,
      ipAddress,
      userAgent,
      expiresAt,
    });

    await this.sessionService.linkTokenToSession(session.id, refreshToken);

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      sessionId: session.id,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId,
        unitId: user.unitId,
      },
    };
  }

  private parseExpiresIn(expiresIn: string): number {
    if (!expiresIn) return 7 * 86400000;
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 7 * 86400000;
    const value = parseInt(match[1], 10);
    switch (match[2]) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60000;
      case 'h':
        return value * 3600000;
      case 'd':
        return value * 86400000;
      default:
        return 7 * 86400000;
    }
  }

  private getRefreshSecret(): string {
    const secret =
      this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET') ||
      this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new InternalServerErrorException(
        'JWT_REFRESH_TOKEN_SECRET is not configured',
      );
    }
    return secret;
  }
}
