import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { AuthAttemptService } from './auth-attempt.service';
import { RefreshTokenService } from './refresh-token.service';
import { SessionService } from './session.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { DistributedLockModule } from '../../infrastructure/distributed-lock.module';
import { CsrfService, CsrfGuard } from './csrf';
import { InviteCodeService } from './invite-code.service';
import { TokenBlacklistService } from './token-blacklist.service';

@Module({
  imports: [
    DistributedLockModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_ACCESS_TOKEN_SECRET')
          || configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT access token secret is not configured');
        }
        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>(
              'JWT_ACCESS_TOKEN_EXPIRES_IN',
              '15m',
            ) as JwtSignOptions['expiresIn'],
            algorithm: 'HS256',
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AuthAttemptService, RefreshTokenService, SessionService, CsrfService, CsrfGuard, InviteCodeService, TokenBlacklistService],
  exports: [AuthService, JwtModule, AuthAttemptService, SessionService, CsrfService, CsrfGuard, InviteCodeService, TokenBlacklistService],
})
export class AuthModule {}
