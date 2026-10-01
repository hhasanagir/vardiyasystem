import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { ScheduleJobType, ScheduleJobStatus } from './schedule-job.types';
import { ScheduleJobStatusService } from './schedule-job-status.service';

@Injectable()
export class ScheduleJobQueueService {
  private readonly logger = new Logger(ScheduleJobQueueService.name);

  constructor(
    @InjectQueue('schedule-jobs') private readonly scheduleQueue: Queue,
    private readonly jobStatusService: ScheduleJobStatusService,
  ) {}

  async enqueueGenerate(
    scheduleId: string,
    unitId: string,
    month: number,
    year: number,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    if (
      this.jobStatusService.isDuplicate(scheduleId, ScheduleJobType.GENERATE)
    ) {
      throw new ConflictException(
        `A generation job for schedule ${scheduleId} is already queued or running`,
      );
    }

    const jobId = randomUUID();
    const data = {
      jobId,
      scheduleId,
      unitId,
      month,
      year,
      organizationId,
      userId,
      type: ScheduleJobType.GENERATE,
      requestTime: new Date().toISOString(),
    };

    this.jobStatusService.create(jobId, scheduleId, ScheduleJobType.GENERATE);

    await this.scheduleQueue.add(ScheduleJobType.GENERATE, data, {
      jobId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(
      `Enqueued generate job ${jobId} for schedule ${scheduleId}`,
    );
    return jobId;
  }

  async enqueueExport(
    scheduleId: string,
    format: 'pdf' | 'excel' | 'csv',
    includeStats: boolean,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const jobId = randomUUID();
    const data = {
      jobId,
      scheduleId,
      format,
      includeStats,
      organizationId,
      userId,
      type: ScheduleJobType.EXPORT,
      requestTime: new Date().toISOString(),
    };

    this.jobStatusService.create(jobId, scheduleId, ScheduleJobType.EXPORT);

    await this.scheduleQueue.add(ScheduleJobType.EXPORT, data, {
      jobId,
      attempts: 2,
      backoff: { type: 'fixed', delay: 3000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(`Enqueued export job ${jobId} for schedule ${scheduleId}`);
    return jobId;
  }

  async enqueueReport(
    scheduleId: string,
    organizationId: string,
    userId: string,
  ): Promise<string> {
    const jobId = randomUUID();
    const data = {
      jobId,
      scheduleId,
      organizationId,
      userId,
      type: ScheduleJobType.REPORT,
      requestTime: new Date().toISOString(),
    };

    this.jobStatusService.create(jobId, scheduleId, ScheduleJobType.REPORT);

    await this.scheduleQueue.add(ScheduleJobType.REPORT, data, {
      jobId,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: { age: 3600 },
      removeOnFail: { age: 86400 },
    });

    this.logger.log(`Enqueued report job ${jobId} for schedule ${scheduleId}`);
    return jobId;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    const record = this.jobStatusService.getByJobId(jobId);
    if (!record) throw new NotFoundException(`Job ${jobId} not found`);

    const cancelled = this.jobStatusService.cancel(jobId);
    if (cancelled) {
      const job = await this.scheduleQueue.getJob(jobId);
      if (job) await job.remove();
    }
    return cancelled;
  }

  getJobStatus(jobId: string) {
    return this.jobStatusService.getByJobId(jobId);
  }

  getJobsBySchedule(scheduleId: string) {
    return this.jobStatusService.getByScheduleId(scheduleId);
  }
}
