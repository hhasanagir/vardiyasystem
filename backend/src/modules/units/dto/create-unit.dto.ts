import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUnitDto {
  @ApiProperty({ example: 'MR Servisi' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'MR' })
  @IsString()
  code: string;

  @ApiProperty({ enum: ['mr', 'bt', 'rontgen', 'nukleer', 'onkoloji'] })
  @IsString()
  type: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;
}
