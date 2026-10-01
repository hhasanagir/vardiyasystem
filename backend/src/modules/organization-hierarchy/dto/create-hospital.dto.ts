import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHospitalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiProperty({ example: 'Ankara Hastanesi' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'ANK' })
  @IsString()
  @MaxLength(50)
  code: string;
}
