import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AreaType } from '@prisma/client';

export class CreateAreaDto {
  @ApiProperty()
  @IsUUID()
  unitId: string;

  @ApiProperty({ example: 'MR Odası 1' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MR1' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ enum: AreaType })
  @IsOptional()
  @IsEnum(AreaType)
  type?: AreaType;
}
