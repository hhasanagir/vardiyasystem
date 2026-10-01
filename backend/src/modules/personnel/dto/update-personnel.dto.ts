import { PartialType, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsBoolean, IsInt, Min } from 'class-validator';
import { CreatePersonnelDto } from './create-personnel.dto';

export class UpdatePersonnelDto extends PartialType(CreatePersonnelDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Version for optimistic locking',
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;
}
