import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma.module';
import { BiomedicalController } from './biomedical.controller';
import { BiomedicalService } from './biomedical.service';
import { CalibrationController } from './calibration.controller';
import { CalibrationService } from './calibration.service';
import { FaultsController } from './faults.controller';
import { FaultsService } from './faults.service';
import { BiomedicalKpiController } from './biomedical-kpi.controller';
import { BiomedicalKpiService } from './biomedical-kpi.service';
import { ServiceHistoryController } from './service-history.controller';
import { ServiceHistoryService } from './service-history.service';

@Module({
  imports: [PrismaModule],
  controllers: [
    BiomedicalController,
    CalibrationController,
    FaultsController,
    BiomedicalKpiController,
    ServiceHistoryController,
  ],
  providers: [
    BiomedicalService,
    CalibrationService,
    FaultsService,
    BiomedicalKpiService,
    ServiceHistoryService,
  ],
  exports: [
    BiomedicalService,
    CalibrationService,
    FaultsService,
    BiomedicalKpiService,
    ServiceHistoryService,
  ],
})
export class BiomedicalModule {}
