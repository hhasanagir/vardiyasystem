import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteCalibrationDto {
  @ApiProperty({ example: 'pass' })
  @IsString()
  results: string;

  @ApiProperty()
  @IsDateString()
  completedDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  measurementValues?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificateRef?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  nextCalibrationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  intervalDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost?: number;
}
