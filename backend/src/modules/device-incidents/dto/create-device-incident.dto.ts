import {
  IsString,
  IsOptional,
  IsIn,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeviceIncidentDto {
  @ApiProperty({ description: 'Unit ID' })
  @IsString()
  unitId: string;

  @ApiPropertyOptional({ description: 'Device ID' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({
    description: 'Issue type',
    enum: [
      'arıza',
      'bakım ihtiyacı',
      'kalibrasyon problemi',
      'görüntü kalitesi sorunu',
      'cihaz offline',
      'servis çağrıldı',
    ],
  })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  issueType: string;

  @ApiPropertyOptional({
    description: 'Severity level',
    enum: ['low', 'medium', 'high', 'critical'],
    default: 'medium',
  })
  @IsOptional()
  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  severity?: string;

  @ApiProperty({
    description: 'Incident description',
    minLength: 3,
    maxLength: 5000,
  })
  @IsString()
  @MinLength(3)
  @MaxLength(5000)
  description: string;

  @ApiPropertyOptional({ description: 'Image attachment URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;
}
