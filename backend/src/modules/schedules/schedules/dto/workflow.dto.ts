import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WorkflowTransitionDto {
  @ApiPropertyOptional({
    maxLength: 500,
    description: 'Comment for the transition',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class RejectScheduleDto {
  @ApiProperty({ maxLength: 1000, description: 'Rejection reason' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class RollbackDto {
  @ApiProperty({ maxLength: 500, description: 'Rollback reason' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}
