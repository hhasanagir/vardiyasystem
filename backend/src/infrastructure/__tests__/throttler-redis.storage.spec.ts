import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import type Redis from 'ioredis';
import { ThrottlerStorageRedisService } from '../throttler-redis.storage';

function serviceReturning(result: unknown): {
  service: ThrottlerStorageRedisService;
  call: ReturnType<typeof vi.fn>;
} {
  const call = vi.fn().mockResolvedValue(result);
  const redis = { call } as unknown as Redis;
  return { service: new ThrottlerStorageRedisService(redis), call };
}

describe('ThrottlerStorageRedisService', () => {
  it('calls the atomic Redis script with hash-tagged hit and block keys', async () => {
    const { service, call } = serviceReturning([1, 60000, 0, 0]);

    await expect(service.increment('ip:1', 60000, 5, 0, 'default')).resolves.toEqual({
      totalHits: 1,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });

    const args = call.mock.calls[0];
    expect(args[0]).toBe('eval');
    expect(args[2]).toBe(2);
    expect(args[3]).toBe('{ip:1:default}:hits');
    expect(args[4]).toBe('{ip:1:default}:blocked');
    expect(args.slice(5)).toEqual(['default', 60000, 5, 0]);
  });

  it('maps a blocked record and rounds millisecond TTLs up to seconds', async () => {
    const { service } = serviceReturning([6, 1500, 1, 2500]);

    await expect(service.increment('ip:2', 60000, 5, 30000, 'default')).resolves.toEqual({
      totalHits: 6,
      timeToExpire: 2,
      isBlocked: true,
      timeToBlockExpire: 3,
    });
  });

  it('rejects a non-array Redis result instead of returning a broken record', async () => {
    const { service } = serviceReturning('unexpected');

    await expect(service.increment('ip:3', 60000, 5, 0, 'default')).rejects.toThrow(TypeError);
  });
});
