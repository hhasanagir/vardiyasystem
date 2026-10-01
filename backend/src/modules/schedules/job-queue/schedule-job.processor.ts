import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { ScheduleJobStatusService } from './schedule-job-status.service';
import { ScheduleJobType } from './schedule-job.types';

@Processor('schedule-jobs')
export class ScheduleJobProcessor extends WorkerHost {
  private readonly logger = new Logger(ScheduleJobProcessor.name);

  constructor(private readonly jobStatusService: ScheduleJobStatusService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    const { jobId, scheduleId, type } = job.data;
    const effectiveJobId = jobId || job.id?.toString() || 'unknown';

    this.logger.log(`Processing ${type} for schedule ${scheduleId}`);
    this.jobStatusService.start(effectiveJobId);

    try {
      const progressHandler = (percent: number) => {
        this.jobStatusService.progress(effectiveJobId, percent);
        job.updateProgress(percent);
      };

      let result: unknown;
      switch (type) {
        case ScheduleJobType.GENERATE:
          result = await this.processGenerate(job.data, progressHandler);
          break;
        case ScheduleJobType.VALIDATE:
          result = await this.processValidate(job.data, progressHandler);
          break;
        case ScheduleJobType.EXPORT:
          result = await this.processExport(job.data, progressHandler);
          break;
        case ScheduleJobType.REPORT:
          result = await this.processReport(job.data, progressHandler);
          break;
        default:
          throw new Error(`Unknown job type: ${type}`);
      }

      this.jobStatusService.complete(effectiveJobId, result);
      return result;
    } catch (error) {
      this.jobStatusService.fail(effectiveJobId, (error as Error).message);
      throw error;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Schedule job ${job.id} failed: ${error.message}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.debug(`Schedule job ${job.id} completed`);
  }

  private async processGenerate(
    data: Record<string, unknown>,
    onProgress: (p: number) => void,
  ): Promise<unknown> {
    this.logger.log(`Generating schedule for unit ${data.unitId}`);
    onProgress(10);
    await this.simulateWork(100);
    onProgress(30);
    await this.simulateWork(200);
    onProgress(60);
    await this.simulateWork(200);
    onProgress(80);
    await this.simulateWork(100);
    onProgress(100);
    return { scheduleId: data.scheduleId, generated: true };
  }

  private async processValidate(
    data: Record<string, unknown>,
    onProgress: (p: number) => void,
  ): Promise<unknown> {
    onProgress(50);
    await this.simulateWork(100);
    onProgress(100);
    return { scheduleId: data.scheduleId, validated: true };
  }

  private async processExport(
    data: Record<string, unknown>,
    onProgress: (p: number) => void,
  ): Promise<unknown> {
    onProgress(25);
    await this.simulateWork(100);
    onProgress(50);
    await this.simulateWork(100);
    onProgress(75);
    await this.simulateWork(100);
    onProgress(100);
    return { scheduleId: data.scheduleId, exported: true, format: data.format };
  }

  private async processReport(
    data: Record<string, unknown>,
    onProgress: (p: number) => void,
  ): Promise<unknown> {
    onProgress(30);
    await this.simulateWork(200);
    onProgress(70);
    await this.simulateWork(200);
    onProgress(100);
    return { scheduleId: data.scheduleId, reportGenerated: true };
  }

  private simulateWork(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
