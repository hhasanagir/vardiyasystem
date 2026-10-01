import { IsString, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDirectorateDto {
  @ApiProperty()
  @IsUUID()
  hospitalId: string;

  @ApiProperty({ example: 'Radyoloji Direktörlüğü' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'RAD' })
  @IsString()
  @MaxLength(50)
  code: string;
}
