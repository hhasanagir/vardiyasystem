import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClockInDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
