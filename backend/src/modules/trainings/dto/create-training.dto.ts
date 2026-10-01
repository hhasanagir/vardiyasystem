import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTrainingDto {
  @ApiProperty({ description: 'Training name', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ description: 'Training provider' })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  provider?: string;

  @ApiPropertyOptional({ description: 'Training category' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  category?: string;

  @ApiPropertyOptional({ description: 'Description', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
