import { IsString, IsEnum, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  personnelId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({
    enum: ['device', 'person'],
    description:
      'device = cihaz bazlı vardiya, person = cihaz dışı personel nöbeti',
  })
  @IsOptional()
  @IsIn(['device', 'person'])
  kind?: 'device' | 'person';

  @ApiPropertyOptional({ description: 'Personel nöbeti için bağlı birim' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Personel nöbeti için personel grubu' })
  @IsOptional()
  @IsString()
  personnelGroupId?: string;

  @ApiPropertyOptional({ description: 'Personel nöbeti için vardiya şablonu' })
  @IsOptional()
  @IsString()
  shiftTemplateId?: string;

  @ApiPropertyOptional({ description: 'YYYY-MM-DD format' })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({ enum: ['day', 'evening', 'night', 'morning'] })
  @IsOptional()
  @IsEnum(['day', 'evening', 'night', 'morning'])
  shiftType?: 'day' | 'evening' | 'night' | 'morning';

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional({ description: 'Slot personnelType discriminator' })
  @IsOptional()
  @IsString()
  personnelType?: string;
}
