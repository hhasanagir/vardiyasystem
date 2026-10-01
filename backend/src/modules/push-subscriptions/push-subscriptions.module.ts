import { Module } from '@nestjs/common';
import { PushSubscriptionsController } from './push-subscriptions.controller';
import { PushSubscriptionsService } from './push-subscriptions.service';

@Module({
  controllers: [PushSubscriptionsController],
  providers: [PushSubscriptionsService],
  exports: [PushSubscriptionsService],
})
export class PushSubscriptionsModule {}
