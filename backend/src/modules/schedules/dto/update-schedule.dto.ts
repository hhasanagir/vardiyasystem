import {
  IsOptional,
  IsString,
  IsEnum,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CreateAssignmentDto } from './create-assignment.dto';

export class UpdateScheduleDto {
  @ApiPropertyOptional({ enum: ['draft', 'published', 'archived'] })
  @IsOptional()
  @IsString()
  status?: 'draft' | 'published' | 'archived';

  @ApiPropertyOptional({ type: [CreateAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateAssignmentDto)
  assignments?: CreateAssignmentDto[];
}
