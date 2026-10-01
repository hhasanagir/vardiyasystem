import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class HandoverNoteQueryDto {
  @ApiPropertyOptional({ description: 'Filter by unit ID' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Filter by device ID' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by shift type' })
  @IsOptional()
  @IsString()
  shiftType?: string;

  @ApiPropertyOptional({ description: 'Filter by date (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['active', 'resolved'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'resolved'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by priority',
    enum: ['info', 'warning', 'critical'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['info', 'warning', 'critical'])
  priority?: string;
}
