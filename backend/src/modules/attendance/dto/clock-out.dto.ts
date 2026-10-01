import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ClockOutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
