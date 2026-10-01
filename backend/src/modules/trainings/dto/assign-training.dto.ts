import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignTrainingDto {
  @ApiProperty({ description: 'Training ID' })
  @IsString()
  trainingId: string;

  @ApiPropertyOptional({ description: 'Issue date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  issueDate?: string;

  @ApiPropertyOptional({ description: 'Expiry date (ISO 8601)' })
  @IsDateString()
  @IsOptional()
  expiryDate?: string;

  @ApiPropertyOptional({ description: 'Certificate document URL' })
  @IsString()
  @IsOptional()
  documentUrl?: string;

  @ApiPropertyOptional({
    description: 'Status',
    enum: ['valid', 'expiring', 'expired'],
  })
  @IsString()
  @IsOptional()
  @IsIn(['valid', 'expiring', 'expired'])
  status?: string;
}
