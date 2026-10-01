import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDosimeterDto {
  @ApiProperty({ example: 'DOS-001' })
  @IsString()
  @IsNotEmpty()
  dosimeterNumber: string;

  @ApiProperty({ example: 'tld' })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issueDate?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  initialReading?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  currentReading?: number;

  @ApiPropertyOptional({ example: 20 })
  @IsOptional()
  @IsNumber()
  annualLimit?: number;

  @ApiPropertyOptional({ example: 16 })
  @IsOptional()
  @IsNumber()
  monthlyAlertThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
