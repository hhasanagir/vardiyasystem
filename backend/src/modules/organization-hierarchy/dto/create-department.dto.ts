import { IsString, IsOptional, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDepartmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  hospitalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  directorateId?: string;

  @ApiProperty({ example: 'MR Bölümü' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'MR' })
  @IsString()
  @MaxLength(50)
  code: string;
}
