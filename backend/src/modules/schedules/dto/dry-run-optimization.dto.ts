import {
  IsString,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsIn,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum OptimizationStrategyId {
  GREEDY = 'greedy',
}

export class DryRunOptimizationDto {
  @ApiProperty({ description: 'Schedule ID to base optimization on' })
  @IsString()
  scheduleId: string;

  @ApiProperty({ description: 'Unit type code' })
  @IsString()
  unitType: string;

  @ApiProperty({ description: 'Target year', minimum: 2024, maximum: 2030 })
  @IsInt()
  @Min(2024)
  @Max(2030)
  year: number;

  @ApiProperty({ description: 'Target month (1-12)', minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiPropertyOptional({
    enum: OptimizationStrategyId,
    default: OptimizationStrategyId.GREEDY,
  })
  @IsOptional()
  @IsEnum(OptimizationStrategyId)
  strategy?: OptimizationStrategyId;

  @ApiPropertyOptional({ default: 'balanced' })
  @IsOptional()
  @IsString()
  @IsIn(['balanced', 'seniority', 'skill'])
  fairnessMode?: string;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxOvertime?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeWeekends?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  includeNightShifts?: boolean;

  @ApiPropertyOptional({ default: 11 })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(24)
  minRestHours?: number;

  @ApiPropertyOptional({ default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional({ default: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  maxConsecutiveNights?: number;
}
