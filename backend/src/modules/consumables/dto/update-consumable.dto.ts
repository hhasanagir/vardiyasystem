import { PartialType } from '@nestjs/swagger';
import { CreateConsumableDto } from './create-consumable.dto';

export class UpdateConsumableDto extends PartialType(CreateConsumableDto) {}
