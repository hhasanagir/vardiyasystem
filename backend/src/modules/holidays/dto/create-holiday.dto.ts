import { IsString, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-01-01' })
  @IsString()
  date: string;

  @ApiProperty({ example: 'Yılbaşı' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'national' })
  @IsString()
  type: string;

  @ApiProperty({ minimum: 2020, maximum: 2100 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;
}
