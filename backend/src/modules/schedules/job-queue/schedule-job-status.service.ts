import { ConflictException, Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../../../events/event-store.service';
import { RedisKeyNamespace, redisKey } from '../../../config/redis-key-namespace';
import { ScheduleJobStatus } from './schedule-job.types';

const RECORD_TTL_SECONDS = 24 * 60 * 60;
const DEDUPE_TTL_SECONDS = 60 * 60;
const GLOBAL_SCOPE = 'global';
const ALL_SCOPE = 'all';

/** JSON shape persisted in Redis — all timestamps are serialized strings. */
interface SerializedScheduleJobRecord {
  jobId: string;
  scheduleId: string;
  type: string;
  status: ScheduleJobStatus;
  progress: number;
  organizationId?: string;
  userId?: string;
  result?: unknown;
  error?: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
}

export interface ScheduleJobRecord {
  jobId: string;
  scheduleId: string;
  type: string;
  status: ScheduleJobStatus;
  progress: number;
  /** P2-09 — every status record carries its owning tenant. */
  organizationId?: string;
  userId?: string;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

/**
 * P2-09 — Redis-backed job status and atomic dedupe.
 *
 * There is deliberately no in-memory Map fallback: if Redis is unavailable the
 * operation fails closed with 503 instead of fabricating a job state that would
 * be lost on restart or invisible to other instances. All keys that carry job
 * data include the owning organization; cross-organization lookups are only
 * possible for the global index used by system admins.
 */
@Injectable()
export class ScheduleJobStatusService {
  private readonly logger = new Logger(ScheduleJobStatusService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async create(
    jobId: string,
    scheduleId: string,
    type: string,
    organizationId?: string,
    userId?: string,
  ): Promise<ScheduleJobRecord> {
    const scope = organizationId || GLOBAL_SCOPE;
    const dedupeKey = this.dedupeKey(scope, scheduleId, type);

    // Atomic claim: SET NX is the single source of truth for "one active job
    // per org + schedule + type", so concurrent enqueues cannot both win.
    const claimed = await this.exec(() => this.redis.set(dedupeKey, jobId, 'EX', DEDUPE_TTL_SECONDS, 'NX'));
    if (claimed !== 'OK') {
      throw new ConflictException(`A ${type} job for schedule ${scheduleId} is already queued or running`);
    }

    const record: ScheduleJobRecord = {
      jobId,
      scheduleId,
      type,
      status: ScheduleJobStatus.QUEUED,
      progress: 0,
      organizationId,
      userId,
      createdAt: new Date(),
    };

    try {
      await this.exec(() => this.redis.set(this.recordKey(scope, jobId), this.serialize(record), 'EX', RECORD_TTL_SECONDS));
      await this.exec(() => this.redis.set(this.orgKey(jobId), scope, 'EX', RECORD_TTL_SECONDS));
      await this.exec(() => this.redis.sadd(this.scheduleKey(scope, scheduleId), jobId));
      await this.exec(() => this.redis.sadd(this.scheduleKey(ALL_SCOPE, scheduleId), jobId));
      await this.exec(() => this.redis.expire(this.scheduleKey(scope, scheduleId), RECORD_TTL_SECONDS));
      await this.exec(() => this.redis.expire(this.scheduleKey(ALL_SCOPE, scheduleId), RECORD_TTL_SECONDS));
    } catch (error) {
      // Never leave a dedupe claim behind if persistence partially failed.
      await this.redis.del(dedupeKey).catch(() => undefined);
      throw error;
    }

    return record;
  }

  async start(jobId: string): Promise<void> {
    await this.update(jobId, record => {
      record.status = ScheduleJobStatus.RUNNING;
      record.startedAt = new Date();
    });
  }

  async progress(jobId: string, percent: number): Promise<void> {
    await this.update(jobId, record => {
      if (record.status === ScheduleJobStatus.RUNNING) {
        record.progress = Math.min(100, Math.max(0, percent));
      }
    });
  }

  async complete(jobId: string, result?: unknown): Promise<void> {
    const updated = await this.update(jobId, record => {
      record.status = ScheduleJobStatus.COMPLETED;
      record.progress = 100;
      record.result = result;
      record.completedAt = new Date();
    });
    if (updated) await this.releaseDedupe(updated);
  }

  async fail(jobId: string, error: string): Promise<void> {
    const updated = await this.update(jobId, record => {
      record.status = ScheduleJobStatus.FAILED;
      record.error = error;
      record.completedAt = new Date();
    });
    if (updated) await this.releaseDedupe(updated);
  }

  async cancel(jobId: string): Promise<boolean> {
    const record = await this.getByJobId(jobId);
    if (!record || (record.status !== ScheduleJobStatus.QUEUED && record.status !== ScheduleJobStatus.RUNNING)) {
      return false;
    }

    await this.update(jobId, current => {
      current.status = ScheduleJobStatus.CANCELLED;
      current.cancelledAt = new Date();
    });
    await this.releaseDedupe(record);
    await this.exec(() => this.redis.srem(this.scheduleKey(record.organizationId || GLOBAL_SCOPE, record.scheduleId), jobId));
    await this.exec(() => this.redis.srem(this.scheduleKey(ALL_SCOPE, record.scheduleId), jobId));
    return true;
  }

  async getByJobId(jobId: string): Promise<ScheduleJobRecord | undefined> {
    const scope = await this.exec(() => this.redis.get(this.orgKey(jobId)));
    if (!scope) return undefined;
    return this.readRecord(scope, jobId);
  }

  async getByScheduleId(scheduleId: string, organizationId?: string): Promise<ScheduleJobRecord[]> {
    const scope = organizationId || ALL_SCOPE;
    const jobIds = await this.exec(() => this.redis.smembers(this.scheduleKey(scope, scheduleId)));
    const records = await Promise.all(jobIds.map(jobId => this.getByJobId(jobId)));
    return records.filter((record): record is ScheduleJobRecord => record !== undefined);
  }

  async isDuplicate(scheduleId: string, type: string, organizationId?: string): Promise<boolean> {
    const value = await this.exec(() => this.redis.get(this.dedupeKey(organizationId || GLOBAL_SCOPE, scheduleId, type)));
    return value !== null;
  }

  private async update(jobId: string, mutate: (record: ScheduleJobRecord) => void): Promise<ScheduleJobRecord | undefined> {
    const scope = await this.exec(() => this.redis.get(this.orgKey(jobId)));
    if (!scope) {
      this.logger.warn(`Job ${jobId} has no Redis status record; refusing to fabricate one`);
      return undefined;
    }

    const record = await this.readRecord(scope, jobId);
    if (!record) return undefined;

    mutate(record);
    await this.exec(() => this.redis.set(this.recordKey(scope, jobId), this.serialize(record), 'EX', RECORD_TTL_SECONDS));
    return record;
  }

  private async readRecord(scope: string, jobId: string): Promise<ScheduleJobRecord | undefined> {
    const raw = await this.exec(() => this.redis.get(this.recordKey(scope, jobId)));
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw) as SerializedScheduleJobRecord;
      return {
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        startedAt: parsed.startedAt ? new Date(parsed.startedAt) : undefined,
        completedAt: parsed.completedAt ? new Date(parsed.completedAt) : undefined,
        cancelledAt: parsed.cancelledAt ? new Date(parsed.cancelledAt) : undefined,
      };
    } catch {
      throw new ServiceUnavailableException(`Corrupt Redis status record for job ${jobId}`);
    }
  }

  private async releaseDedupe(record: ScheduleJobRecord): Promise<void> {
    await this.exec(() => this.redis.del(
      this.dedupeKey(record.organizationId || GLOBAL_SCOPE, record.scheduleId, record.type),
    ));
  }

  private serialize(record: ScheduleJobRecord): string {
    return JSON.stringify(record);
  }

  private recordKey(scope: string, jobId: string): string {
    return redisKey(RedisKeyNamespace.QUEUE, 'schedule-job', scope, jobId);
  }

  private orgKey(jobId: string): string {
    return redisKey(RedisKeyNamespace.QUEUE, 'schedule-job-org', jobId);
  }

  private scheduleKey(scope: string, scheduleId: string): string {
    return redisKey(RedisKeyNamespace.QUEUE, 'schedule-job-schedule', scope, scheduleId);
  }

  private dedupeKey(scope: string, scheduleId: string, type: string): string {
    return redisKey(RedisKeyNamespace.QUEUE, 'schedule-job-dedupe', scope, scheduleId, type);
  }

  private async exec<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`Redis job status store unavailable: ${(error as Error).message}`);
      throw new ServiceUnavailableException('Redis job status store is unavailable; job state cannot be trusted');
    }
  }
}
