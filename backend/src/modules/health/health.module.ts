import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthMonitorService } from './health-monitor.service';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [BullModule.registerQueue({ name: 'schedule-jobs' })],
  controllers: [HealthController],
  providers: [HealthMonitorService],
  exports: [HealthMonitorService],
})
export class HealthModule {}
