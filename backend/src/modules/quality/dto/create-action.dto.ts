import { IsString, IsOptional, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateActionDto {
  @ApiProperty({ example: 'CA-2024-001' })
  @IsString()
  @IsNotEmpty()
  actionNumber: string;

  @ApiProperty({ example: 'corrective' })
  @IsString()
  actionType: string;

  @ApiProperty({
    example: 'Recalibrate equipment and update calibration schedule',
  })
  @IsString()
  description: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  responsibleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional({ example: 'open' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
