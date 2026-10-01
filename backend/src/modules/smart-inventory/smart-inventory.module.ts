import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { SmartInventoryController } from './smart-inventory.controller';
import { SmartInventoryService } from './smart-inventory.service';

@Module({
  imports: [PrismaModule],
  controllers: [SmartInventoryController],
  providers: [SmartInventoryService],
  exports: [SmartInventoryService],
})
export class SmartInventoryModule {}
