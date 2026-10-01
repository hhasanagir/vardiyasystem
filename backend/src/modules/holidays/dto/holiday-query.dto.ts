import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HolidayQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(2020)
  @Max(2100)
  year?: number;
}
