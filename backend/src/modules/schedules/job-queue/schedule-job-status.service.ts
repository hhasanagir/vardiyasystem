import { Injectable, Logger } from '@nestjs/common';
import { ScheduleJobStatus } from './schedule-job.types';

export interface ScheduleJobRecord {
  jobId: string;
  scheduleId: string;
  type: string;
  status: ScheduleJobStatus;
  progress: number;
  result?: unknown;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  cancelledAt?: Date;
}

@Injectable()
export class ScheduleJobStatusService {
  private readonly logger = new Logger(ScheduleJobStatusService.name);
  private readonly jobs = new Map<string, ScheduleJobRecord>();

  create(jobId: string, scheduleId: string, type: string): ScheduleJobRecord {
    const record: ScheduleJobRecord = {
      jobId,
      scheduleId,
      type,
      status: ScheduleJobStatus.QUEUED,
      progress: 0,
      createdAt: new Date(),
    };
    this.jobs.set(jobId, record);
    return record;
  }

  start(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = ScheduleJobStatus.RUNNING;
      job.startedAt = new Date();
    }
  }

  progress(jobId: string, percent: number): void {
    const job = this.jobs.get(jobId);
    if (job && job.status === ScheduleJobStatus.RUNNING) {
      job.progress = Math.min(100, Math.max(0, percent));
    }
  }

  complete(jobId: string, result?: unknown): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = ScheduleJobStatus.COMPLETED;
      job.progress = 100;
      job.result = result;
      job.completedAt = new Date();
    }
  }

  fail(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (job) {
      job.status = ScheduleJobStatus.FAILED;
      job.error = error;
      job.completedAt = new Date();
    }
  }

  cancel(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (
      job &&
      (job.status === ScheduleJobStatus.QUEUED ||
        job.status === ScheduleJobStatus.RUNNING)
    ) {
      job.status = ScheduleJobStatus.CANCELLED;
      job.cancelledAt = new Date();
      return true;
    }
    return false;
  }

  getByJobId(jobId: string): ScheduleJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  getByScheduleId(scheduleId: string): ScheduleJobRecord[] {
    return Array.from(this.jobs.values()).filter(
      (j) => j.scheduleId === scheduleId,
    );
  }

  isDuplicate(scheduleId: string, type: string): boolean {
    return Array.from(this.jobs.values()).some(
      (j) =>
        j.scheduleId === scheduleId &&
        j.type === type &&
        (j.status === ScheduleJobStatus.QUEUED ||
          j.status === ScheduleJobStatus.RUNNING),
    );
  }
}
