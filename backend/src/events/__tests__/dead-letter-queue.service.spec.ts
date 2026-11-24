import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeadLetterQueueService } from '../dead-letter-queue.service';
import { AGGREGATE_TYPES, EVENT_NAMES, type DomainEvent } from '../domain-event.interface';

/** Phase 5c49 — coverage wave 1: DLQ routing, retry and drain behaviour. */
describe('DeadLetterQueueService', () => {
  const dlqQueue = {
    add: vi.fn(),
    getJobs: vi.fn(),
    getJob: vi.fn(),
    getJobCounts: vi.fn(),
  };
  const monitoring = { recordDlq: vi.fn() };
  let service: DeadLetterQueueService;

  const event: DomainEvent = {
    eventId: 'evt-1',
    eventName: EVENT_NAMES.SCHEDULE_CREATED,
    aggregateId: 'sched-1',
    aggregateType: AGGREGATE_TYPES.SCHEDULE,
    correlationId: 'corr-1',
    timestamp: new Date('2026-11-23T10:00:00.000Z'),
    payload: { month: 11 },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    dlqQueue.add.mockResolvedValue(undefined);
    dlqQueue.getJobs.mockResolvedValue([]);
    dlqQueue.getJob.mockResolvedValue(null);
    dlqQueue.getJobCounts.mockResolvedValue({ failed: 0, completed: 0 });
    service = new DeadLetterQueueService(dlqQueue as any, monitoring as any);
  });

  it('sends a failed event to the DLQ with error details and records the metric', async () => {
    const error = new Error('handler exploded');

    await service.sendToDlq(event, error, 3);

    expect(monitoring.recordDlq).toHaveBeenCalledWith(event.eventName);
    const [name, payload, options] = dlqQueue.add.mock.calls[0] as unknown as [
      string,
      { event: DomainEvent; error: { message: string; stack?: string }; failedAt: string; attemptsMade: number },
      { removeOnComplete: boolean; removeOnFail?: boolean },
    ];
    expect(name).toBe(`dlq:${event.eventName}`);
    expect(payload.event).toBe(event);
    expect(payload.error).toEqual({ message: 'handler exploded', stack: error.stack });
    expect(Number.isNaN(Date.parse(payload.failedAt))).toBe(false);
    expect(payload.attemptsMade).toBe(3);
    expect(options).toEqual({ removeOnComplete: false, removeOnFail: false });
  });

  it('lists failed jobs with the requested limit', async () => {
    const jobs = [{ id: 'job-1' }];
    dlqQueue.getJobs.mockResolvedValue(jobs);

    await expect(service.listDlqEvents(7)).resolves.toBe(jobs);
    expect(dlqQueue.getJobs).toHaveBeenCalledWith(['failed'], 0, 7);
  });

  it('ignores a retry for a missing DLQ job', async () => {
    const target = { add: vi.fn() };

    await service.retryDlqEvent('missing', target as any);

    expect(dlqQueue.getJob).toHaveBeenCalledWith('missing');
    expect(target.add).not.toHaveBeenCalled();
  });

  it('removes a retried job and requeues the original event with retry options', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    dlqQueue.getJob.mockResolvedValue({ data: { event }, remove });
    const target = { add: vi.fn().mockResolvedValue(undefined) };

    await service.retryDlqEvent('job-1', target as any);

    expect(remove).toHaveBeenCalledTimes(1);
    expect(target.add).toHaveBeenCalledWith(event.eventName, event, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  });

  it('flushes all failed jobs and reports how many were removed', async () => {
    const jobs = [{ remove: vi.fn().mockResolvedValue(undefined) }, { remove: vi.fn().mockResolvedValue(undefined) }];
    dlqQueue.getJobs.mockResolvedValue(jobs);

    await expect(service.flushDlq()).resolves.toBe(2);

    expect(dlqQueue.getJobs).toHaveBeenCalledWith(['failed']);
    expect(jobs.every((job) => job.remove.mock.calls.length === 1)).toBe(true);
  });

  it('counts both failed and completed DLQ jobs', async () => {
    dlqQueue.getJobCounts.mockResolvedValue({ failed: 4, completed: 2 });

    await expect(service.getDlqCount()).resolves.toBe(6);
  });
});
