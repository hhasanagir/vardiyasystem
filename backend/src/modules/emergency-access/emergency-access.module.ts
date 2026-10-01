import { Module } from '@nestjs/common';
import { EmergencyAccessService } from './emergency-access.service';
import { EmergencyAccessController } from './emergency-access.controller';

@Module({
  controllers: [EmergencyAccessController],
  providers: [EmergencyAccessService],
  exports: [EmergencyAccessService],
})
export class EmergencyAccessModule {}
