import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { DeviceStatusController } from './device-status.controller';
import { DeviceStatusService } from './device-status.service';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceStatusController],
  providers: [DeviceStatusService],
  exports: [DeviceStatusService],
})
export class DeviceStatusModule {}
