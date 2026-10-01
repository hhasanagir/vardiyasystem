import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { HospitalGroupsService } from './services/hospital-groups.service';
import { HospitalsService } from './services/hospitals.service';
import { DirectoratesService } from './services/directorates.service';
import { DepartmentsService } from './services/departments.service';
import { AreasService } from './services/areas.service';
import { RoomsService } from './services/rooms.service';
import { AssignmentSlotsService } from './services/assignment-slots.service';
import { HospitalGroupsController } from './controllers/hospital-groups.controller';
import { HospitalsController } from './controllers/hospitals.controller';
import { DirectoratesController } from './controllers/directorates.controller';
import { DepartmentsController } from './controllers/departments.controller';
import { AreasController } from './controllers/areas.controller';
import { RoomsController } from './controllers/rooms.controller';
import { AssignmentSlotsController } from './controllers/assignment-slots.controller';

@Module({
  imports: [PrismaModule],
  controllers: [
    HospitalGroupsController,
    HospitalsController,
    DirectoratesController,
    DepartmentsController,
    AreasController,
    RoomsController,
    AssignmentSlotsController,
  ],
  providers: [
    HospitalGroupsService,
    HospitalsService,
    DirectoratesService,
    DepartmentsService,
    AreasService,
    RoomsService,
    AssignmentSlotsService,
  ],
  exports: [
    HospitalGroupsService,
    HospitalsService,
    DirectoratesService,
    DepartmentsService,
    AreasService,
    RoomsService,
    AssignmentSlotsService,
  ],
})
export class OrganizationHierarchyModule {}
