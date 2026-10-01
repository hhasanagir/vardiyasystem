import { IsString, IsEnum, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateShiftTemplateDto {
  @ApiProperty({ description: 'Şablon adı (örn. Gece Nöbeti)' })
  @IsString()
  name: string;

  @ApiProperty({ enum: ['day', 'evening', 'night', 'morning'] })
  @IsEnum(['day', 'evening', 'night', 'morning'])
  shiftType: 'day' | 'evening' | 'night' | 'morning';

  @ApiProperty({ example: '08:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '16:00' })
  @IsString()
  endTime: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
