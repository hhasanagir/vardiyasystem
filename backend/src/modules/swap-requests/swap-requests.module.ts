import { Module } from '@nestjs/common';
import { SwapRequestsService } from './swap-requests.service';
import { SwapRequestsController } from './swap-requests.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { SchedulesModule } from '../schedules/schedules.module';

@Module({
  imports: [NotificationsModule, SchedulesModule],
  providers: [SwapRequestsService],
  controllers: [SwapRequestsController],
  exports: [SwapRequestsService],
})
export class SwapRequestsModule {}
