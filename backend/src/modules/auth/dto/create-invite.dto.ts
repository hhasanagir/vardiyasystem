import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInviteDto {
  @ApiProperty()
  @IsString()
  organizationId: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUses?: number;

  @ApiPropertyOptional({ description: 'Hours until expiration' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8760)
  expiresInHours?: number;
}
