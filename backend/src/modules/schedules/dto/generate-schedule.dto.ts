import {
  IsInt,
  IsString,
  IsOptional,
  IsBoolean,
  Min,
  Max,
  IsIn,
  IsArray,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GenerateScheduleDto {
  @ApiProperty({
    description: 'Unit type code (mr, bt, rontgen, nukleer, onkoloji)',
  })
  @IsString()
  unitType: string;

  @ApiProperty({ description: 'Target month (1-12)', minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ description: 'Target year', minimum: 2024, maximum: 2030 })
  @IsInt()
  @Min(2024)
  @Max(2030)
  year: number;

  @ApiPropertyOptional({
    description: 'Fairness mode: balanced | seniority | skill',
    default: 'balanced',
  })
  @IsOptional()
  @IsString()
  @IsIn(['balanced', 'seniority', 'skill'])
  fairnessMode?: string;

  @ApiPropertyOptional({
    description: 'Max overtime hours per person per month',
    default: 20,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  maxOvertime?: number;

  @ApiPropertyOptional({ description: 'Include weekend shifts', default: true })
  @IsOptional()
  @IsBoolean()
  includeWeekends?: boolean;

  @ApiPropertyOptional({ description: 'Include night shifts', default: true })
  @IsOptional()
  @IsBoolean()
  includeNightShifts?: boolean;

  @ApiPropertyOptional({
    description: 'Min rest hours between shifts',
    default: 11,
  })
  @IsOptional()
  @IsInt()
  @Min(8)
  @Max(24)
  minRestHours?: number;

  @ApiPropertyOptional({ description: 'Max consecutive work days', default: 6 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(14)
  maxConsecutiveDays?: number;

  @ApiPropertyOptional({
    description: 'Max consecutive night shifts',
    default: 3,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  maxConsecutiveNights?: number;
}

export class PreviewScheduleDto extends GenerateScheduleDto {}

export class ApplyGeneratedScheduleDto {
  @ApiProperty({ description: 'Schedule ID to apply to' })
  @IsString()
  scheduleId: string;

  @ApiProperty({ description: 'Array of generated assignments' })
  @IsArray()
  assignments: Array<{
    personnelId: string;
    deviceId: string;
    date: string;
    shiftType: 'day' | 'evening' | 'night';
    startTime: string;
    endTime: string;
    personnelType?: string;
    personnelName?: string;
    deviceName?: string;
  }>;
}
