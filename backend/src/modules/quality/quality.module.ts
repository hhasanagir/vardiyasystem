import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';
import { RbacModule } from '../rbac/rbac.module';

@Module({
  imports: [PrismaModule, RbacModule],
  controllers: [QualityController],
  providers: [QualityService],
  exports: [QualityService],
})
export class QualityModule {}
