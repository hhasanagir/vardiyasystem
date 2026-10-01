import { Module } from '@nestjs/common';
import { BreachNotificationService } from './breach-notification.service';
import { BreachNotificationController } from './breach-notification.controller';

@Module({
  controllers: [BreachNotificationController],
  providers: [BreachNotificationService],
  exports: [BreachNotificationService],
})
export class BreachNotificationModule {}
