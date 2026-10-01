import { Module } from '@nestjs/common';
import { ScheduleGateway } from './schedule.gateway';
import { PresenceService } from './presence.service';
import { EditLockService } from './edit-lock.service';
import { ConcurrencyService } from './concurrency.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [
    ScheduleGateway,
    PresenceService,
    EditLockService,
    ConcurrencyService,
  ],
  exports: [
    ScheduleGateway,
    PresenceService,
    EditLockService,
    ConcurrencyService,
  ],
})
export class WebsocketModule {}
