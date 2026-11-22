import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { DeviceLifecycleController } from './device-lifecycle.controller';
import { DeviceLifecycleService } from './device-lifecycle.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [DeviceLifecycleController],
  providers: [DeviceLifecycleService],
  exports: [DeviceLifecycleService],
})
export class DeviceLifecycleModule {}
