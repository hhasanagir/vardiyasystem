import { Global, Module } from '@nestjs/common';
import { DistributedLockService } from './distributed-lock.service';
import { EventBusModule } from '../events/event-bus.module';

@Global()
@Module({
  imports: [EventBusModule],
  providers: [DistributedLockService],
  exports: [DistributedLockService],
})
export class DistributedLockModule {}
