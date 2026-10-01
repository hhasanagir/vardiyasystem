import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCalibrationDto {
  @ApiProperty()
  @IsString()
  assetId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  calibrationNumber?: string;

  @ApiProperty({ example: 'internal' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'scheduled' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty()
  @IsDateString()
  scheduledDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  completedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  standard?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  results?: string;

  @ApiPropertyOptional()
  @IsOptional()
  measurementValues?: Record<string, any>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  certificateRef?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
