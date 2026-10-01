import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token JWT' })
  @IsString()
  refreshToken: string;
}

export class SessionResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  ipAddress: string | null;

  @ApiProperty()
  userAgent: string | null;

  @ApiProperty()
  deviceInfo: string | null;

  @ApiProperty()
  lastUsedAt: Date;

  @ApiProperty()
  expiresAt: Date;

  @ApiProperty()
  revokedAt: Date | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  isActive: boolean;
}

export class SessionListResponseDto {
  @ApiProperty({ type: [SessionResponseDto] })
  sessions: SessionResponseDto[];

  @ApiProperty()
  total: number;
}

export class LogoutAllResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;

  @ApiProperty()
  revokedSessions: number;
}

export class RevokeSessionResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  message: string;
}
