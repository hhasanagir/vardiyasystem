import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHandoverNoteDto {
  @ApiProperty({ description: 'Unit ID' })
  @IsString()
  unitId: string;

  @ApiPropertyOptional({ description: 'Device ID' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Shift type (day/evening/night)' })
  @IsOptional()
  @IsString()
  shiftType?: string;

  @ApiProperty({ description: 'Note title', minLength: 3, maxLength: 200 })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiProperty({ description: 'Note content', minLength: 3, maxLength: 5000 })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  content: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: ['info', 'warning', 'critical'],
    default: 'info',
  })
  @IsOptional()
  @IsString()
  @IsIn(['info', 'warning', 'critical'])
  priority?: string;
}
