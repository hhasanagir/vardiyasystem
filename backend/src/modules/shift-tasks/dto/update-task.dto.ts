import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum TaskStatusEnum {
  pending = 'pending',
  completed = 'completed',
  skipped = 'skipped',
}

export class UpdateTaskDto {
  @ApiProperty({ enum: TaskStatusEnum })
  @IsEnum(TaskStatusEnum)
  status: TaskStatusEnum;
}
