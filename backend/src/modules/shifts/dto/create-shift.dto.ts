import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  Min,
  Max,
  IsUUID,
} from 'class-validator';
import { ShiftType } from '@prisma/client';

export class CreateShiftDto {
  @ApiProperty({ example: 'Yardımcı Tekniker' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ShiftType, example: ShiftType.day })
  @IsEnum(ShiftType)
  type: ShiftType;

  @ApiProperty({ example: '08:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '20:00' })
  @IsString()
  endTime: string;

  @ApiProperty({ example: 12 })
  @IsNumber()
  @Min(1)
  @Max(24)
  durationHours: number;

  @ApiProperty()
  @IsUUID()
  organizationId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  unitId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ required: false, example: 'assistant_technician' })
  @IsOptional()
  @IsString()
  personnelType?: string;
}
