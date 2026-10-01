import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  Max,
  IsInt,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonnelDto {
  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'technician' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: 'EMP-001' })
  @IsOptional()
  @IsString()
  employeeNo?: string;

  @ApiPropertyOptional({ example: 'ahmet@hospital.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+90-555-123-4567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty()
  @IsString()
  unitId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ example: ['MR', 'BT'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  skills?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  seniority?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(0)
  experienceYears?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deviceSkills?: string[];

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  nightShiftEligible?: boolean;

  @ApiPropertyOptional({ default: 'active' })
  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: [0, 6] })
  @IsOptional()
  @IsArray()
  @IsNumber({}, { each: true })
  offDays?: number[];

  @ApiPropertyOptional({ default: 40 })
  @IsOptional()
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(168)
  maxWeeklyHours?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
