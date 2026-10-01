import {
  IsInt,
  Min,
  Max,
  IsArray,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class AssignmentItem {
  @ApiProperty()
  personnelId: string;

  @ApiProperty()
  deviceId: string;

  @ApiProperty({ description: 'YYYY-MM-DD format' })
  date: string;

  @ApiProperty({ enum: ['day', 'evening', 'night', 'morning'] })
  shiftType: 'day' | 'evening' | 'night' | 'morning';

  @ApiProperty({ example: '08:00' })
  startTime: string;

  @ApiProperty({ example: '16:00' })
  endTime: string;

  @ApiProperty({ required: false })
  personnelType?: string;
}

export class PublishUnitScheduleDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @ApiProperty({ minimum: 2020, maximum: 2100 })
  @IsInt()
  @Min(2020)
  @Max(2100)
  year: number;

  @ApiProperty({ type: [AssignmentItem], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AssignmentItem)
  assignments?: AssignmentItem[];
}
