import { IsString, IsBoolean, IsOptional, Matches, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToggleDeviceOffDto {
  @ApiProperty({ description: 'Cihaz kimliği' })
  @IsString()
  deviceId: string;

  @ApiProperty({ description: 'Tarih (YYYY-MM-DD)', example: '2026-08-18' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Tarih YYYY-MM-DD formatında olmalıdır' })
  date: string;

  @ApiProperty({ description: 'Cihaz kapatılsın mı?', example: true })
  @IsBoolean()
  isOff: boolean;

  @ApiPropertyOptional({ description: 'Kapatma nedeni', example: 'Planlı bakım', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
