import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ example: 'SC-2024-001' })
  @IsString()
  @IsNotEmpty()
  contractNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiProperty({ example: 'service' })
  @IsString()
  type: string;

  @ApiPropertyOptional({ example: 'draft' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiProperty({ example: 'Annual Service Contract' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: '2024-01-01' })
  @IsString()
  startDate: string;

  @ApiProperty({ example: '2025-01-01' })
  @IsString()
  endDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  renewalDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ example: 'TRY' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '4 hours' })
  @IsOptional()
  @IsString()
  slaResponseTime?: string;

  @ApiPropertyOptional({ example: '24 hours' })
  @IsOptional()
  @IsString()
  slaResolutionTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slaPenalty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  paymentTerms?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  exclusions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
