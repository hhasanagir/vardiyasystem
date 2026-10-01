import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { WebsocketModule } from '../websocket/websocket.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [PrismaModule, WebsocketModule, NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
