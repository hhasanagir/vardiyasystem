import { Module } from '@nestjs/common';
import { DeviceIncidentsController } from './device-incidents.controller';
import { DeviceIncidentsService } from './device-incidents.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [WebsocketModule, NotificationsModule],
  controllers: [DeviceIncidentsController],
  providers: [DeviceIncidentsService],
  exports: [DeviceIncidentsService],
})
export class DeviceIncidentsModule {}
