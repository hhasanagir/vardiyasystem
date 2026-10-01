import {
  IsString,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { CreateAssignmentDto } from './create-assignment.dto';

export class OverrideAssignmentDto extends CreateAssignmentDto {
  @ApiProperty({ description: 'İstisna gerekçesi (zorunlu)' })
  @IsString()
  @IsNotEmpty({ message: 'İstisna gerekçesi zorunludur' })
  overrideReason: string;

  @ApiProperty({ description: 'Override edilen kural kodları', type: [String] })
  @IsArray()
  @IsString({ each: true })
  violatedRules: string[];

  @ApiProperty({
    description: 'Kullanıcının ihlalleri kabul ettiğini onaylaması',
    example: true,
  })
  @IsBoolean()
  confirmedByUser: boolean;
}
