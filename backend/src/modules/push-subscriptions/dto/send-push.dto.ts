import { IsString, IsOptional, IsObject, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendPushDto {
  @ApiProperty({ description: 'Target user ID' })
  @IsString()
  userId: string;

  @ApiProperty({ description: 'Notification title' })
  @IsString()
  title: string;

  @ApiProperty({ description: 'Notification body' })
  @IsString()
  body: string;

  @ApiPropertyOptional({ description: 'Icon URL' })
  @IsOptional()
  @IsString()
  icon?: string;

  @ApiPropertyOptional({ description: 'Badge URL' })
  @IsOptional()
  @IsString()
  badge?: string;

  @ApiPropertyOptional({ description: 'Custom data payload' })
  @IsOptional()
  @IsObject()
  data?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Notification actions' })
  @IsOptional()
  @IsArray()
  actions?: { action: string; title: string }[];
}
