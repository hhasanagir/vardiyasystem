import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { RadiationSafetyController } from './radiation-safety.controller';
import { RadiationSafetyService } from './radiation-safety.service';

@Module({
  imports: [PrismaModule],
  controllers: [RadiationSafetyController],
  providers: [RadiationSafetyService],
  exports: [RadiationSafetyService],
})
export class RadiationSafetyModule {}
