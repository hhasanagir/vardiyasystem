import { PartialType } from '@nestjs/swagger';
import { CreateCalibrationDto } from './create-calibration.dto';

export class UpdateCalibrationDto extends PartialType(CreateCalibrationDto) {}
