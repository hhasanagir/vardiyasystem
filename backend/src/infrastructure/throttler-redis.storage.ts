import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import Redis from 'ioredis';

interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Redis-backed throttler storage.
 *
 * Kept in-repo because the community package that provided this class only
 * declares NestJS peers up to v11. The Lua script and return semantics are
 * unchanged from that implementation so rate-limit behaviour is preserved.
 */
@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  private readonly scriptSrc: string;

  constructor(private readonly redis: Redis) {
    this.scriptSrc = this.getScriptSrc();
  }

  private getScriptSrc(): string {
    return `
      local hitKey = KEYS[1]
      local blockKey = KEYS[2]
      local throttlerName = ARGV[1]
      local ttl = tonumber(ARGV[2])
      local limit = tonumber(ARGV[3])
      local blockDuration = tonumber(ARGV[4])

      local totalHits = redis.call('INCR', hitKey)
      local timeToExpire = redis.call('PTTL', hitKey)

      if timeToExpire <= 0 then
        redis.call('PEXPIRE', hitKey, ttl)
        timeToExpire = ttl
      end

      local isBlocked = redis.call('GET', blockKey)
      local timeToBlockExpire = 0

      if isBlocked then
        timeToBlockExpire = redis.call('PTTL', blockKey)
      elseif totalHits > limit then
        redis.call('SET', blockKey, 1, 'PX', blockDuration)
        isBlocked = '1'
        timeToBlockExpire = blockDuration
      end

      if isBlocked and timeToBlockExpire <= 0 then
        redis.call('DEL', blockKey)
        redis.call('SET', hitKey, 1, 'PX', ttl)
        totalHits = 1
        timeToExpire = ttl
        isBlocked = false
      end

      return { totalHits, timeToExpire, isBlocked and 1 or 0, timeToBlockExpire }
    `
      .replace(/^\s+/gm, '')
      .trim();
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const hitKey = `{${key}:${throttlerName}}:hits`;
    const blockKey = `{${key}:${throttlerName}}:blocked`;
    const results = (await this.redis.call(
      'eval',
      this.scriptSrc,
      2,
      hitKey,
      blockKey,
      throttlerName,
      ttl,
      limit,
      blockDuration,
    )) as number[];

    if (!Array.isArray(results)) {
      throw new TypeError(`Expected result to be array of values, got ${results}`);
    }

    const [totalHits, timeToExpire, isBlocked, timeToBlockExpire] = results;
    for (const [name, value] of Object.entries({
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    })) {
      if (typeof value !== 'number') {
        throw new TypeError(`Expected ${name} to be a number`);
      }
    }

    return {
      totalHits,
      timeToExpire: Math.ceil(timeToExpire / 1000),
      isBlocked: isBlocked === 1,
      timeToBlockExpire: Math.ceil(timeToBlockExpire / 1000),
    };
  }
}
