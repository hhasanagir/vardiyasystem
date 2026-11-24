import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const PERSONNEL_AVAILABILITY_TYPES = ['AVAILABLE', 'UNAVAILABLE', 'LEAVE', 'ABSENCE'] as const;
export type PersonnelAvailabilityKind = (typeof PERSONNEL_AVAILABILITY_TYPES)[number];

export class CreatePersonnelAvailabilityDto {
  @ApiProperty({ description: 'Personel ID' })
  @IsString()
  personnelId: string;

  @ApiProperty({ description: 'Tarih (YYYY-MM-DD)', example: '2026-10-05' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date (YYYY-MM-DD) formatında olmalıdır' })
  date: string;

  @ApiProperty({ enum: PERSONNEL_AVAILABILITY_TYPES, description: 'Uygunluk durumu' })
  @IsIn(PERSONNEL_AVAILABILITY_TYPES)
  type: PersonnelAvailabilityKind;

  @ApiPropertyOptional({ description: 'Açıklama / gerekçe' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}