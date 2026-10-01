import {
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DutyRosterRole } from '../domain/duty-roster.types';

export class CreateDutyRosterEntryDto {
  @ApiProperty() @IsString() organizationId: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiProperty() @IsString() personnelId: string;
  @ApiProperty() @IsDateString() date: string;
  @ApiProperty({ enum: ['day', 'evening', 'night'] })
  @IsString()
  shiftType: string;
  @ApiProperty({ enum: DutyRosterRole })
  @IsEnum(DutyRosterRole)
  role: DutyRosterRole;
  @ApiProperty() @IsString() startTime: string;
  @ApiProperty() @IsString() endTime: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateDutyRosterEntryDto {
  @ApiPropertyOptional({ enum: DutyRosterRole })
  @IsOptional()
  @IsEnum(DutyRosterRole)
  role?: DutyRosterRole;
  @ApiPropertyOptional() @IsOptional() @IsString() startTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() endTime?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class DutyRosterFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() organizationId?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() date?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() startDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() endDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unitId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() personnelId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() shiftType?: string;
  @ApiPropertyOptional({ enum: DutyRosterRole })
  @IsOptional()
  @IsEnum(DutyRosterRole)
  role?: DutyRosterRole;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}
