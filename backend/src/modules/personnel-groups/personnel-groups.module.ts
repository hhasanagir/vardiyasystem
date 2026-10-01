import { Module } from '@nestjs/common';
import { PersonnelGroupsService } from './personnel-groups.service';
import { PersonnelGroupsController } from './personnel-groups.controller';

@Module({
  controllers: [PersonnelGroupsController],
  providers: [PersonnelGroupsService],
  exports: [PersonnelGroupsService],
})
export class PersonnelGroupsModule {}
