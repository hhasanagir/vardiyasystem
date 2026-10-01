import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class IncidentQueryDto {
  @ApiPropertyOptional({ description: 'Filter by unit ID' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Filter by device ID' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ description: 'Filter by issue type' })
  @IsOptional()
  @IsString()
  issueType?: string;

  @ApiPropertyOptional({
    description: 'Filter by severity',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: string;

  @ApiPropertyOptional({
    description: 'Filter by status',
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;
}
