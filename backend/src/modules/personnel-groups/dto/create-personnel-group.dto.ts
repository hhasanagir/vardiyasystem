import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePersonnelGroupDto {
  @ApiProperty({
    description:
      'Benzersiz grup kodu (örn. tekniker, yardimci_tekniker, saglik_fizikcisi)',
  })
  @IsString()
  code: string;

  @ApiProperty({ description: 'Grup adı (örn. Tekniker, Sağlık Fizikçisi)' })
  @IsString()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Bağlı olduğu birim' })
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiPropertyOptional({ description: 'Bağlı olduğu organizasyon' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
