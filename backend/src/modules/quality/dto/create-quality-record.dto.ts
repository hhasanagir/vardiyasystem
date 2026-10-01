import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateQualityRecordDto {
  @ApiProperty({ example: 'QR-2024-001' })
  @IsString()
  @IsNotEmpty()
  recordNumber: string;

  @ApiProperty({ example: 'nonconformity' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'open' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 'Equipment calibration drift' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'major' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({ example: 'inspection' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

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
  targetDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
