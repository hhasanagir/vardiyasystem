import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { AssetManagementController } from './asset-management.controller';
import { AssetManagementService } from './asset-management.service';

@Module({
  imports: [PrismaModule],
  controllers: [AssetManagementController],
  providers: [AssetManagementService],
  exports: [AssetManagementService],
})
export class AssetManagementModule {}
