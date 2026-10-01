import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  Matches,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'abc123',
  'letmein',
  'admin',
  'welcome',
  'monkey',
  'master',
  'dragon',
  'login',
  'princess',
  'starwars',
  'trustno1',
  'iloveyou',
  'abcdef',
  'shadow',
  'michael',
  'password1234',
  'password12345',
  '1234567',
  '12345',
  '123123',
  '654321',
  'superman',
  'qazwsx',
]);

@ValidatorConstraint({ name: 'StrongPassword', async: false })
export class StrongPasswordValidator implements ValidatorConstraintInterface {
  validate(password: string): boolean {
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      return false;
    }
    return true;
  }

  defaultMessage(): string {
    return 'Password is too common. Please choose a more secure password';
  }
}

export class CreateUserDto {
  @ApiProperty({ example: 'user@hospital.com' })
  @IsEmail()
  @MaxLength(255)
  email: string;

  @ApiProperty({ example: 'P@ssw0rd!23' })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/,
    {
      message:
        'Password must contain uppercase, lowercase, number, and special character',
    },
  )
  @Validate(StrongPasswordValidator)
  password: string;

  @ApiProperty({ example: 'Ahmet Yılmaz' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({
    enum: [
      'system_admin',
      'hospital_admin',
      'imaging_director',
      'supervisor',
      'medical_engineer',
      'senior_technician',
      'technician',
      'assistant_technician',
      'secretary',
      'guest',
    ],
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  unitId?: string;

  @ApiProperty({ example: 'A1B2C3D4E5F6' })
  @IsString()
  inviteCode: string;
}
