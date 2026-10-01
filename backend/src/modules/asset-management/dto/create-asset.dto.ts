import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssetDto {
  @ApiProperty({ example: 'AST-001' })
  @IsString()
  assetNumber: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  qrCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rfidTag?: string;

  @ApiProperty({ example: 'MRI Scanner' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'medical_imaging' })
  @IsString()
  category: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  manufacturer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  yearOfManufacture?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  installationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  acceptanceDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  commissioningDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warrantyStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  warrantyEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  expectedLifetimeYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  purchaseCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplierId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purchaseOrderNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  block?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  floor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  ownerDepartmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleEngineerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
