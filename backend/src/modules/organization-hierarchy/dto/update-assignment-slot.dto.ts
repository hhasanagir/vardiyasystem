import { PartialType } from '@nestjs/swagger';
import { CreateAssignmentSlotDto } from './create-assignment-slot.dto';

export class UpdateAssignmentSlotDto extends PartialType(
  CreateAssignmentSlotDto,
) {}
