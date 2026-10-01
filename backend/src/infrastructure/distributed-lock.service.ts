import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../events/event-store.service';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly LOCK_PREFIX = 'lock:';
  private readonly DEFAULT_TTL_MS = 30000;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async acquire(
    resource: string,
    ttlMs: number = this.DEFAULT_TTL_MS,
    ownerId: string = process.pid.toString(),
  ): Promise<{ acquired: boolean; lockId: string }> {
    const key = this.LOCK_PREFIX + resource;
    const lockId = `${ownerId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

    try {
      const result = await this.redis.set(key, lockId, 'PX', ttlMs, 'NX');
      if (result === 'OK') {
        return { acquired: true, lockId };
      }
      return { acquired: false, lockId: '' };
    } catch (err) {
      this.logger.error(
        `Lock acquire failed for ${resource}`,
        (err as Error).message,
      );
      return { acquired: false, lockId: '' };
    }
  }

  async release(resource: string, lockId: string): Promise<boolean> {
    const key = this.LOCK_PREFIX + resource;

    const luaScript = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    try {
      const result = (await this.redis.eval(
        luaScript,
        1,
        key,
        lockId,
      )) as number;
      return result === 1;
    } catch (err) {
      this.logger.error(
        `Lock release failed for ${resource}`,
        (err as Error).message,
      );
      return false;
    }
  }

  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttlMs: number = this.DEFAULT_TTL_MS,
  ): Promise<T> {
    const { acquired, lockId } = await this.acquire(resource, ttlMs);
    if (!acquired) {
      throw new Error(
        `Could not acquire lock for ${resource} — operation already in progress`,
      );
    }

    try {
      return await fn();
    } finally {
      await this.release(resource, lockId);
    }
  }
}
