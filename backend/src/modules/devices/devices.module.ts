import { Module } from '@nestjs/common';
import { DevicesController } from './devices.controller';
import { DevicesService } from './devices.service';
import { UnitsModule } from '../units/units.module';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [UnitsModule, RbacModule],
  controllers: [DevicesController],
  providers: [DevicesService],
})
export class DevicesModule {}
