import { IsString, IsEnum, IsOptional, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAssignmentDto {
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

  @ApiPropertyOptional({
    enum: ['device', 'person'],
    default: 'device',
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

  @ApiPropertyOptional({
    description:
      'Slot personnelType discriminator (e.g. medical_physicist_2, planning)',
  })
  @IsOptional()
  @IsString()
  personnelType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}
