import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateHospitalGroupDto {
  @ApiProperty({ example: 'Sağlık Bakanlığı' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'SB' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
