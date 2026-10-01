import { IsString, IsOptional, IsNumber, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class StockAdjustDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  catalogId: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  warehouseId: string;

  @ApiProperty({ example: 'adjustment' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  quantity: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  unitCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  performedById?: string;
}
