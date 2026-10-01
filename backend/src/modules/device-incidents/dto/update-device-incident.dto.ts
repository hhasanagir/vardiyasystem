import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDeviceIncidentDto {
  @ApiPropertyOptional({ description: 'Issue type' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  issueType?: string;

  @ApiPropertyOptional({
    description: 'Severity level',
    enum: ['low', 'medium', 'high', 'critical'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: string;

  @ApiPropertyOptional({ description: 'Incident description' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ description: 'Image attachment URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Status',
    enum: ['open', 'in_progress', 'resolved', 'closed'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'in_progress', 'resolved', 'closed'])
  status?: string;
}
