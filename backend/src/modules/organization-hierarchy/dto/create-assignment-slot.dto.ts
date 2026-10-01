import { IsString, IsOptional, IsUUID, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ShiftType, AssignmentSlotStatus } from '@prisma/client';

export class CreateAssignmentSlotDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  deviceId?: string;

  @ApiProperty({ example: '2024-03-15' })
  @IsString()
  date: string;

  @ApiProperty({ example: '09:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '17:00' })
  @IsString()
  endTime: string;

  @ApiProperty({ enum: ShiftType })
  @IsEnum(ShiftType)
  shiftType: ShiftType;

  @ApiPropertyOptional({ enum: AssignmentSlotStatus })
  @IsOptional()
  @IsEnum(AssignmentSlotStatus)
  status?: AssignmentSlotStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleId?: string;
}
