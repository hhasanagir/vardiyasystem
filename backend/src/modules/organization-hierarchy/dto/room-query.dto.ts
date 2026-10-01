import { IsOptional, IsString, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RoomQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  areaId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
