import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
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
    const { jobId, scheduleId, type } = job.data ?? {};
    const effectiveJobId = jobId || job.id?.toString() || 'unknown';

    this.logger.warn(
      `Refusing ${String(type)} job ${effectiveJobId} for schedule ${String(scheduleId)}: no production worker is connected`,
    );
    await this.jobStatusService.start(effectiveJobId);

    try {
      // Fail closed. This worker was previously returning canned
      // generated/validated/exported/reportGenerated successes after a timer,
      // which made unperformed work look completed. No job type is wired to a
      // production implementation, so none may report success.
      switch (type) {
        case ScheduleJobType.GENERATE:
        case ScheduleJobType.VALIDATE:
        case ScheduleJobType.EXPORT:
        case ScheduleJobType.REPORT:
          throw new ServiceUnavailableException(
            `Schedule job type ${String(type)} is not connected to a production worker. No work was performed; use the synchronous endpoint.`,
          );
        default:
          throw new Error(`Unknown job type: ${String(type)}`);
      }
    } catch (error) {
      await this.jobStatusService.fail(effectiveJobId, (error as Error).message);
      throw error instanceof Error ? error : new Error(String(error));
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
}
