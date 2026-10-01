import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenBlacklistService } from './token-blacklist.service';
import { AuthService } from './auth.service';
import { RbacService } from '../rbac/rbac.service';
import { registerJwtCacheInvalidator } from './jwt-cache-invalidation';

const userCache = new Map<string, { user: any; expiresAt: number }>();
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_SIZE = 1000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private tokenBlacklistService: TokenBlacklistService,
    private rbacService: RbacService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_TOKEN_SECRET') ||
        configService.get<string>('JWT_SECRET'),
      algorithms: ['HS256'],
    });

    registerJwtCacheInvalidator((userId: string) => {
      userCache.delete(userId);
    });
  }

  async validate(payload: {
    sub: string;
    jti?: string;
    email?: string;
    role?: string;
  }) {
    if (
      payload.jti &&
      (await this.tokenBlacklistService.isBlacklisted(payload.jti))
    ) {
      throw new UnauthorizedException('Token revoked');
    }

    const cached = userCache.get(payload.sub);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        ...cached.user,
        jti: payload.jti,
        permissions: cached.user.permissions,
      };
    }

    const user = await this.authService.validateUser(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }

    const enrichedUser = await this.rbacService.enrichUserWithPermissions(user);

    if (userCache.size >= CACHE_MAX_SIZE) {
      const oldestKey = userCache.keys().next().value;
      if (oldestKey) userCache.delete(oldestKey);
    }
    userCache.set(payload.sub, {
      user: enrichedUser,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });
    return { ...enrichedUser, jti: payload.jti };
  }
}
