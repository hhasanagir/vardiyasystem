import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleJobProcessor } from './schedule-job.processor';
import { ScheduleJobStatusService } from './schedule-job-status.service';
import { ScheduleJobQueueService } from './schedule-job-queue.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'schedule-jobs' })],
  providers: [
    ScheduleJobProcessor,
    ScheduleJobStatusService,
    ScheduleJobQueueService,
  ],
  exports: [ScheduleJobQueueService, ScheduleJobStatusService],
})
export class ScheduleJobQueueModule {}
