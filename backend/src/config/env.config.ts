import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import * as Joi from 'joi';

const logger = new Logger('EnvValidation');

export const validationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().default(3000),
  DATABASE_URL: Joi.string().required(),
  DATABASE_DIRECT_URL: Joi.string().optional(),
  JWT_ACCESS_TOKEN_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .required()
      .min(32)
      .description('JWT access token secret (min 32 chars)'),
    otherwise: Joi.string().default('dev-jwt-access-secret'),
  }),
  JWT_REFRESH_TOKEN_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .required()
      .min(32)
      .description('JWT refresh token secret (min 32 chars)'),
    otherwise: Joi.string().default('dev-jwt-refresh-secret'),
  }),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('7d'),
  FRONTEND_URL: Joi.string().default('http://localhost:4200'),
  WS_CORS_ORIGIN: Joi.string().default('http://localhost:4200'),
  GLOBAL_THROTTLE_TTL: Joi.number().default(60000),
  GLOBAL_THROTTLE_LIMIT: Joi.number().default(200),
  AUTH_LOGIN_LIMIT: Joi.number().default(10),
  AUTH_LOGIN_WINDOW_MS: Joi.number().default(60000),
  AUTH_REGISTER_LIMIT: Joi.number().default(3),
  AUTH_REGISTER_WINDOW_MS: Joi.number().default(60000),
  AUTH_REFRESH_LIMIT: Joi.number().default(10),
  AUTH_REFRESH_WINDOW_MS: Joi.number().default(60000),
  AUTH_LOCKOUT_THRESHOLD: Joi.number().default(5),
  AUTH_LOCKOUT_DURATION_MS: Joi.number().default(900000),
  AUTH_LOCKOUT_PROGRESSIVE_FACTOR: Joi.number().default(1.5),
  AUTH_LOCKOUT_MAX_DURATION_MS: Joi.number().default(86400000),
  WS_CONNECTION_LIMIT: Joi.number().default(10),
  WS_CONNECTION_WINDOW_MS: Joi.number().default(60000),
  WS_RECONNECT_COOLDOWN_MS: Joi.number().default(2000),
  TRUST_PROXY_LEVEL: Joi.number().default(1),
  REDIS_URL: Joi.string().optional(),
  COOKIE_SECRET: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .required()
      .min(32)
      .description('Cookie signing secret (min 32 chars)'),
    otherwise: Joi.string().default('dev-cookie-secret-change-in-production'),
  }),
  VAPID_PUBLIC_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default(
      'BJmBEUlEpzbxsHEWjAAFuI-iKEJ171-JUZYmtVYBc-V84pBMyvqLDGtCeW__3I3OjaKYQ7TLpqOTQKuzCHLKNOc',
    ),
  }),
  VAPID_PRIVATE_KEY: Joi.string().when('NODE_ENV', {
    is: 'production',
    then: Joi.string().required(),
    otherwise: Joi.string().default(
      'LCOGiaom9OORU7nWAZoBeNgtFVGdf-bCjRuKBkUE-Iw',
    ),
  }),
  VAPID_SUBJECT: Joi.string().default('mailto:vardiyaos@hospital.com'),
  LOG_LEVEL: Joi.string()
    .valid('error', 'warn', 'info', 'debug', 'verbose')
    .default('info'),
  LOG_DIR: Joi.string().default('logs'),
  ENABLE_REALTIME_COLLABORATION: Joi.boolean().default(false),
  ENABLE_ADVANCED_AUDIT: Joi.boolean().default(false),
  ENABLE_FOUR_EYES_APPROVAL: Joi.boolean().default(true),
  ENABLE_SCHEDULE_GENERATION_ASYNC: Joi.boolean().default(false),
  ENABLE_OFFLINE_MODE: Joi.boolean().default(false),
  ENABLE_EXPORT_ASYNC: Joi.boolean().default(false),
  ENABLE_BIOMETRIC_AUTH: Joi.boolean().default(false),
});

export function validateStartupConfig(configService: ConfigService): void {
  const errors: string[] = [];
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  if (nodeEnv === 'production') {
    const jwtAccess = configService.get<string>('JWT_ACCESS_TOKEN_SECRET', '');
    if (jwtAccess === 'dev-jwt-access-secret' || jwtAccess.length < 32) {
      errors.push(
        'JWT_ACCESS_TOKEN_SECRET must be a strong secret (min 32 chars) in production',
      );
    }
    const jwtRefresh = configService.get<string>(
      'JWT_REFRESH_TOKEN_SECRET',
      '',
    );
    if (jwtRefresh === 'dev-jwt-refresh-secret' || jwtRefresh.length < 32) {
      errors.push(
        'JWT_REFRESH_TOKEN_SECRET must be a strong secret (min 32 chars) in production',
      );
    }
    const cookieSecret = configService.get<string>('COOKIE_SECRET', '');
    if (cookieSecret.includes('dev-') || cookieSecret.length < 32) {
      errors.push(
        'COOKIE_SECRET must be a strong secret (min 32 chars) in production',
      );
    }
    const frontendUrl = configService.get<string>('FRONTEND_URL', '');
    if (frontendUrl.includes('localhost')) {
      errors.push('FRONTEND_URL must not point to localhost in production');
    }
  }

  if (errors.length > 0) {
    const msg = `Configuration validation failed:\n  ${errors.join('\n  ')}`;
    if (nodeEnv === 'production') {
      logger.error(msg);
      throw new Error(msg);
    } else {
      logger.warn(msg);
    }
  }
}

export class AppConfig {
  constructor(private config: ConfigService) {}

  get port(): number {
    return this.config.get<number>('PORT', 3000);
  }

  get jwtAccessTokenSecret(): string {
    return this.config.get<string>('JWT_ACCESS_TOKEN_SECRET')!;
  }

  get jwtRefreshTokenSecret(): string {
    return this.config.get<string>('JWT_REFRESH_TOKEN_SECRET')!;
  }

  get jwtAccessTokenExpiresIn(): string {
    return this.config.get<string>('JWT_ACCESS_TOKEN_EXPIRES_IN', '15m');
  }

  get jwtRefreshTokenExpiresIn(): string {
    return this.config.get<string>('JWT_REFRESH_TOKEN_EXPIRES_IN', '7d');
  }

  get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL', 'http://localhost:4200');
  }

  get wsCorsOrigin(): string {
    return this.config.get<string>('WS_CORS_ORIGIN', 'http://localhost:4200');
  }

  get nodeEnv(): string {
    return this.config.get<string>('NODE_ENV', 'development');
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get vapidPublicKey(): string {
    return this.config.get<string>('VAPID_PUBLIC_KEY')!;
  }

  get vapidPrivateKey(): string {
    return this.config.get<string>('VAPID_PRIVATE_KEY')!;
  }

  get vapidSubject(): string {
    return this.config.get<string>(
      'VAPID_SUBJECT',
      'mailto:vardiyaos@hospital.com',
    );
  }
}
