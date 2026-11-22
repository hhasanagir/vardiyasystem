import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { PERSONNEL_AVAILABILITY_TYPES, PersonnelAvailabilityKind } from './create-personnel-availability.dto';

export class UpdatePersonnelAvailabilityDto {
  @ApiPropertyOptional({ enum: PERSONNEL_AVAILABILITY_TYPES, description: 'Uygunluk durumu' })
  @IsOptional()
  @IsIn(PERSONNEL_AVAILABILITY_TYPES)
  type?: PersonnelAvailabilityKind;

  @ApiPropertyOptional({ description: 'Açıklama / gerekçe' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ description: 'Aktif mi (reactivation için true)' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}