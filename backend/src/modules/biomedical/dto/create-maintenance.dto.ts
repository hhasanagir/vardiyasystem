import { IsString, IsOptional, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaintenanceDto {
  @ApiProperty()
  @IsString()
  assetId: string;

  @ApiProperty({ example: 'preventive' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'medium' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ example: 'open' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 'Annual calibration' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reportedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  vendorId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  downtimeHours?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  cost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  mtbf?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  mttr?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rootCause?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  resolution?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  closingNotes?: string;
}
