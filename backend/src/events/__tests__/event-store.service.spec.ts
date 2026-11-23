import { describe, it, expect, beforeEach } from 'vitest';
import type Redis from 'ioredis';
import { EventStoreService } from '../event-store.service';
import { AGGREGATE_TYPES, EVENT_NAMES, type DomainEvent } from '../domain-event.interface';

/**
 * Phase 5c49 — coverage wave 1. EventStore owns the Redis key layout and the
 * serialisation boundary; these tests pin both without opening a connection.
 */
type RedisCommand =
  | { kind: 'zadd'; key: string; score: number; member: string }
  | { kind: 'set'; key: string; value: string; args: unknown[] };

interface MultiChain {
  zadd(key: string, score: number, member: string): MultiChain;
  set(key: string, value: string, ...args: unknown[]): MultiChain;
  exec(): Promise<Array<[null, string]>>;
}

interface PipelineChain {
  get(key: string): PipelineChain;
  exec(): Promise<Array<[null, string | null]> | null>;
}

class FakeRedis {
  readonly strings = new Map<string, string>();
  readonly sorted = new Map<string, Map<string, number>>();
  readonly multiCalls: RedisCommand[][] = [];
  readonly ttls: Array<{ key: string; args: unknown[] }> = [];
  fail = false;
  pipelineReturnsNull = false;

  private guard(): void {
    if (this.fail) throw new Error('redis connection refused');
  }

  multi(): MultiChain {
    const commands: RedisCommand[] = [];
    const chain: MultiChain = {
      zadd: (key, score, member) => {
        commands.push({ kind: 'zadd', key, score, member });
        return chain;
      },
      set: (key, value, ...args) => {
        commands.push({ kind: 'set', key, value, args });
        return chain;
      },
      exec: () => {
        this.guard();
        this.multiCalls.push([...commands]);
        for (const command of commands) {
          if (command.kind === 'zadd') {
            const set = this.sorted.get(command.key) ?? new Map<string, number>();
            set.set(command.member, command.score);
            this.sorted.set(command.key, set);
          } else {
            this.strings.set(command.key, command.value);
            this.ttls.push({ key: command.key, args: command.args });
          }
        }
        return Promise.resolve(commands.map((): [null, string] => [null, 'OK']));
      },
    };
    return chain;
  }

  pipeline(): PipelineChain {
    const keys: string[] = [];
    const chain: PipelineChain = {
      get: (key) => {
        keys.push(key);
        return chain;
      },
      exec: () => {
        this.guard();
        if (this.pipelineReturnsNull) return Promise.resolve(null);
        return Promise.resolve(keys.map((key): [null, string | null] => [null, this.strings.get(key) ?? null]));
      },
    };
    return chain;
  }

  get(key: string): Promise<string | null> {
    this.guard();
    return Promise.resolve(this.strings.get(key) ?? null);
  }

  zrange(key: string, start: number, stop: number): Promise<string[]> {
    this.guard();
    const entries = [...(this.sorted.get(key) ?? new Map<string, number>()).entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([member]) => member);
    return Promise.resolve(entries.slice(start, stop === -1 ? undefined : stop + 1));
  }

  zrangebyscore(key: string, min: number, max: number): Promise<string[]> {
    this.guard();
    return Promise.resolve(
      [...(this.sorted.get(key) ?? new Map<string, number>()).entries()]
        .filter(([, score]) => score >= min && score <= max)
        .sort((a, b) => a[1] - b[1])
        .map(([member]) => member),
    );
  }

  zcard(key: string): Promise<number> {
    this.guard();
    return Promise.resolve((this.sorted.get(key) ?? new Map<string, number>()).size);
  }
}

function serializeEvent(
  eventId: string,
  iso: string,
  aggregateType: string = AGGREGATE_TYPES.SCHEDULE,
): string {
  const event = {
    eventId,
    eventName: EVENT_NAMES.SCHEDULE_CREATED,
    aggregateId: 'agg-1',
    aggregateType,
    correlationId: 'corr-1',
    timestamp: iso,
    payload: { month: 11 },
  } as unknown as DomainEvent;
  return JSON.stringify(event);
}

describe('EventStoreService — Redis key layout and replay', () => {
  let redis: FakeRedis;
  let service: EventStoreService;

  beforeEach(() => {
    redis = new FakeRedis();
    service = new EventStoreService(redis as unknown as Redis);
  });

  it('stores an event under aggregate, event and global keys with a 7-day TTL', async () => {
    const timestamp = new Date('2026-11-23T10:00:00.000Z');
    const event = {
      eventId: 'evt-1',
      eventName: EVENT_NAMES.SCHEDULE_CREATED,
      aggregateId: 'sched-1',
      aggregateType: AGGREGATE_TYPES.SCHEDULE,
      correlationId: 'corr-1',
      timestamp,
      payload: { month: 11 },
    } as DomainEvent;

    await service.store(event);

    expect(redis.multiCalls).toHaveLength(1);
    expect(redis.multiCalls[0]).toEqual([
      { kind: 'zadd', key: 'events:Schedule:sched-1', score: timestamp.getTime(), member: 'evt-1' },
      { kind: 'set', key: 'event:evt-1', value: JSON.stringify(event), args: ['EX', 604800] },
      { kind: 'zadd', key: 'events:all', score: timestamp.getTime(), member: 'evt-1' },
    ]);
    expect(redis.ttls[0]).toEqual({ key: 'event:evt-1', args: ['EX', 604800] });
    expect(redis.strings.get('event:evt-1')).toBe(JSON.stringify(event));
    expect(redis.sorted.get('events:all')?.get('evt-1')).toBe(timestamp.getTime());
  });

  it('swallows Redis failures while storing so publishing is not blocked', async () => {
    redis.fail = true;

    await expect(service.store({} as DomainEvent)).resolves.toBeUndefined();
  });

  it('reads a single event by its event key', async () => {
    redis.strings.set('event:evt-9', serializeEvent('evt-9', '2026-11-23T10:00:00.000Z'));

    const event = await service.getEvent('evt-9');

    expect(event?.eventId).toBe('evt-9');
    expect(await service.getEvent('missing')).toBeNull();
  });

  it('replays an aggregate chronologically and rehydrates ISO timestamps', async () => {
    const older = serializeEvent('evt-2', '2026-11-23T09:00:00.000Z');
    const newer = serializeEvent('evt-1', '2026-11-23T11:00:00.000Z');
    redis.strings.set('event:evt-1', newer);
    redis.strings.set('event:evt-2', older);
    redis.sorted.set('events:Schedule:agg-1', new Map([
      ['evt-1', Date.parse('2026-11-23T11:00:00.000Z')],
      ['evt-2', Date.parse('2026-11-23T09:00:00.000Z')],
    ]));

    const events = await service.replayByAggregate(AGGREGATE_TYPES.SCHEDULE, 'agg-1');

    expect(events.map((item) => item.eventId)).toEqual(['evt-2', 'evt-1']);
    expect(events[0].timestamp).toBeInstanceOf(Date);
    expect(events[0].timestamp.toISOString()).toBe('2026-11-23T09:00:00.000Z');
    expect(await service.replayByAggregate(AGGREGATE_TYPES.SCHEDULE, 'unknown')).toEqual([]);
  });

  it('filters replayByType by aggregate type and honours the timestamp window', async () => {
    const from = Date.parse('2026-11-23T00:00:00.000Z');
    const to = Date.parse('2026-11-24T00:00:00.000Z');
    redis.strings.set('event:evt-1', serializeEvent('evt-1', '2026-11-23T10:00:00.000Z'));
    redis.strings.set('event:evt-2', serializeEvent('evt-2', '2026-11-23T11:00:00.000Z', AGGREGATE_TYPES.PERSONNEL));
    redis.strings.set('event:evt-3', serializeEvent('evt-3', '2026-11-25T11:00:00.000Z'));
    redis.sorted.set('events:all', new Map([
      ['evt-1', Date.parse('2026-11-23T10:00:00.000Z')],
      ['evt-2', Date.parse('2026-11-23T11:00:00.000Z')],
      ['evt-3', Date.parse('2026-11-25T11:00:00.000Z')],
    ]));

    const events = await service.replayByType(AGGREGATE_TYPES.SCHEDULE, from, to);
    const all = await service.replayAll(from, to);

    expect(events.map((item) => item.eventId)).toEqual(['evt-1']);
    expect(all.map((item) => item.eventId)).toEqual(['evt-1', 'evt-2']);
    expect(await service.countByAggregate(AGGREGATE_TYPES.SCHEDULE, 'agg-1')).toBe(0);
  });

  it('returns an empty replay when the Redis pipeline yields nothing', async () => {
    redis.pipelineReturnsNull = true;

    await expect(service.replayAll()).resolves.toEqual([]);
  });
});
