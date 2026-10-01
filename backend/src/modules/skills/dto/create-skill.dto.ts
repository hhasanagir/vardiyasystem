import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateSkillDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  name: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;
}
