import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { PrismaModule } from '../../prisma.module';
import { DutyRosterController } from './presentation/duty-roster.controller';
import { DutyRosterService } from './duty-roster.service';

@Module({
  imports: [PrismaModule, CqrsModule],
  controllers: [DutyRosterController],
  providers: [DutyRosterService],
  exports: [DutyRosterService],
})
export class DutyRosterModule {}
