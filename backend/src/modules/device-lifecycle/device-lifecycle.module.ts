import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { DeviceLifecycleController } from './device-lifecycle.controller';
import { DeviceLifecycleService } from './device-lifecycle.service';

@Module({
  imports: [PrismaModule],
  controllers: [DeviceLifecycleController],
  providers: [DeviceLifecycleService],
  exports: [DeviceLifecycleService],
})
export class DeviceLifecycleModule {}
