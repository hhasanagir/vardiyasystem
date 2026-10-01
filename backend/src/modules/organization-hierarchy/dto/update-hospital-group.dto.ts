import { PartialType } from '@nestjs/swagger';
import { CreateHospitalGroupDto } from './create-hospital-group.dto';

export class UpdateHospitalGroupDto extends PartialType(
  CreateHospitalGroupDto,
) {}
