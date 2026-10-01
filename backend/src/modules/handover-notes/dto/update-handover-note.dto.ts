import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateHandoverNoteDto {
  @ApiPropertyOptional({ description: 'Note title' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ description: 'Note content' })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({
    description: 'Priority level',
    enum: ['info', 'warning', 'critical'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['info', 'warning', 'critical'])
  priority?: string;

  @ApiPropertyOptional({ description: 'Status', enum: ['active', 'resolved'] })
  @IsOptional()
  @IsString()
  @IsIn(['active', 'resolved'])
  status?: string;
}
