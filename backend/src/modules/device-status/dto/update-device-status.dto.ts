import { IsString, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateDeviceStatusDto {
  @ApiProperty({ description: 'Device ID' })
  @IsString()
  deviceId: string;

  @ApiProperty({ enum: ['active', 'maintenance', 'fault', 'out_of_service'] })
  @IsString()
  @IsIn(['active', 'maintenance', 'fault', 'out_of_service'])
  status: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
