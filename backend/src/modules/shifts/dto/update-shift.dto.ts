import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateShiftDto } from './create-shift.dto';

export class UpdateShiftDto extends PartialType(
  OmitType(CreateShiftDto, ['organizationId'] as const),
) {}
