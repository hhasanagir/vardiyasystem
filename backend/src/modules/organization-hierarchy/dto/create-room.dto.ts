import {
  IsString,
  IsOptional,
  IsUUID,
  IsEnum,
  IsInt,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RoomType } from '@prisma/client';

export class CreateRoomDto {
  @ApiProperty()
  @IsUUID()
  areaId: string;

  @ApiProperty({ example: 'Taram Odası 1' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'TO1' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ enum: RoomType })
  @IsOptional()
  @IsEnum(RoomType)
  type?: RoomType;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  capacity?: number;
}
