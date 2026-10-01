import { Global, Module } from '@nestjs/common';
import { UnitOfWorkService } from './database/unit-of-work';
import { PrismaModule } from '../prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [UnitOfWorkService],
  exports: [UnitOfWorkService],
})
export class InfrastructureModule {}
