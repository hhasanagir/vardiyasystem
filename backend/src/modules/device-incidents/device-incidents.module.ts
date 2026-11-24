import { Module } from '@nestjs/common';
import { DeviceIncidentsController } from './device-incidents.controller';
import { DeviceIncidentsService } from './device-incidents.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [WebsocketModule, NotificationsModule, RbacModule],
  controllers: [DeviceIncidentsController],
  providers: [DeviceIncidentsService],
  exports: [DeviceIncidentsService],
})
export class DeviceIncidentsModule {}
