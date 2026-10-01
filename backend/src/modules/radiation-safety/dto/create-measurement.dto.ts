import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMeasurementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dosimeterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiProperty({ example: 'personal_dose' })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  measurementDate?: string;

  @ApiProperty({ example: 0.5 })
  @IsNumber()
  value: number;

  @ApiPropertyOptional({ example: 'mSv' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  laboratoryRef?: string;

  @ApiPropertyOptional({ example: 'normal' })
  @IsOptional()
  @IsString()
  result?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
