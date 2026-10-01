import { IsString, IsEnum, IsNumber, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DirectAssignDto {
  @ApiProperty({ description: 'Unit type code (e.g. mr, bt, rontgen)' })
  @IsString()
  unitType: string;

  @ApiProperty({ example: 7 })
  @IsNumber()
  month: number;

  @ApiProperty({ example: 2026 })
  @IsNumber()
  year: number;

  @ApiProperty()
  @IsString()
  personnelId: string;

  @ApiPropertyOptional({
    description:
      'Cihaz kimliği. Personel bazlı nöbet (kind=person) için boş bırakılır.',
  })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiPropertyOptional({ enum: ['device', 'person'], default: 'device' })
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

  @ApiProperty({ description: 'YYYY-MM-DD format' })
  @IsString()
  date: string;

  @ApiProperty({ enum: ['day', 'evening', 'night', 'morning'] })
  @IsEnum(['day', 'evening', 'night', 'morning'])
  shiftType: 'day' | 'evening' | 'night' | 'morning';

  @ApiProperty({ example: '08:00' })
  @IsString()
  startTime: string;

  @ApiProperty({ example: '20:00' })
  @IsString()
  endTime: string;

  @ApiPropertyOptional({ description: 'Slot personnelType discriminator' })
  @IsOptional()
  @IsString()
  personnelType?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
