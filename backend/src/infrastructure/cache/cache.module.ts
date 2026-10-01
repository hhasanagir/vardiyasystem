import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => ({
        ttl: config.get<number>('CACHE_TTL', 300),
        max: config.get<number>('CACHE_MAX_ITEMS', 1000),
        isGlobal: true,
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class RedisCacheModule {}
