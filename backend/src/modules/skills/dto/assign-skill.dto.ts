import { IsString, IsOptional, IsDateString, IsIn } from 'class-validator';

export class AssignSkillDto {
  @IsString()
  skillId: string;

  @IsString()
  @IsOptional()
  @IsIn(['trainee', 'certified', 'expert', 'trainer'])
  certificationLevel?: string;

  @IsDateString()
  @IsOptional()
  certifiedAt?: string;

  @IsDateString()
  @IsOptional()
  expiresAt?: string;
}
