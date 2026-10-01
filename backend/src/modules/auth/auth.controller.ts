import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  HttpCode,
  Req,
  Delete,
  Param,
  ParseUUIDPipe,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiTooManyRequestsResponse,
  ApiBody,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request as ExpressRequest, Response } from 'express';
import { AuthService } from './auth.service';
import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login.dto';
import { CreateInviteDto } from './dto/create-invite.dto';
import {
  RefreshTokenDto,
  LogoutAllResponseDto,
  RevokeSessionResponseDto,
  SessionListResponseDto,
} from './dto/refresh.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { SkipCsrf, CsrfService } from './csrf';
import { Log } from '../audit-log/log.decorator';
import { InviteCodeService } from './invite-code.service';

interface RequestWithUser extends ExpressRequest {
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    organizationId?: string;
    unitId?: string;
    jti?: string;
  };
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private csrfService: CsrfService,
    private inviteCodeService: InviteCodeService,
  ) {}

  @Get('csrf-token')
  @ApiOperation({ summary: 'Get CSRF token via cookie' })
  getCsrfToken(@Res({ passthrough: true }) res: Response) {
    const token = this.csrfService.generateToken();
    res.cookie('csrf-token', token, {
      httpOnly: false,
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
    });
    return { message: 'CSRF token set' };
  }

  @Post('register')
  @SkipCsrf()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Log({
    action: 'REGISTER',
    entityType: 'user',
    description: 'Yeni kullanıcı kaydı',
  })
  @ApiOperation({ summary: 'Register new user with invite code' })
  @ApiTooManyRequestsResponse({ description: 'Too many registration attempts' })
  register(@Body() dto: CreateUserDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @SkipCsrf()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Log({ action: 'LOGIN', entityType: 'user', description: 'Kullanıcı girişi' })
  @ApiOperation({ summary: 'Login user' })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Try again later.',
  })
  @ApiBody({ type: LoginDto })
  login(@Body() dto: LoginDto, @Req() req: ExpressRequest) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] || undefined;
    return this.authService.login(dto, ip, userAgent);
  }

  @Post('refresh')
  @SkipCsrf()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiTooManyRequestsResponse({ description: 'Too many refresh attempts' })
  refreshToken(@Body() body: RefreshTokenDto, @Req() req: ExpressRequest) {
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';
    const userAgent = req.headers['user-agent'] || undefined;
    return this.authService.refreshToken(body.refreshToken, ip, userAgent);
  }

  @Post('invite-codes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MinRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create invite codes (admin)' })
  async createInviteCode(
    @Body() dto: CreateInviteDto,
    @Request() req: RequestWithUser,
  ) {
    return this.inviteCodeService.create(dto.organizationId, req.user.id, {
      maxUses: dto.maxUses,
      expiresInHours: dto.expiresInHours,
    });
  }

  @Post('logout')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Log({
    action: 'LOGOUT',
    entityType: 'user',
    description: 'Kullanıcı çıkışı',
  })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user (revoke current session)' })
  logout(
    @Request() req: RequestWithUser,
    @Body() body?: { sessionId?: string },
  ) {
    const sessionId = body?.sessionId || req.user.jti;
    return this.authService.logout(req.user.id, req.user.jti, sessionId);
  }

  @Post('logout-all')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices (revoke all sessions)' })
  logoutAll(@Request() req: RequestWithUser) {
    return this.authService.logoutAll(req.user.id, req.user.jti);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user' })
  getProfile(@Request() req: RequestWithUser) {
    return req.user;
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all active sessions for current user' })
  async listSessions(
    @Request() req: RequestWithUser,
  ): Promise<SessionListResponseDto> {
    const sessions = await this.authService.getSessions(req.user.id);
    return { sessions, total: sessions.length };
  }

  @Delete('sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a specific session' })
  async revokeSession(
    @Param('id', ParseUUIDPipe) sessionId: string,
    @Request() req: RequestWithUser,
  ): Promise<RevokeSessionResponseDto> {
    await this.authService.revokeSession(sessionId, req.user.id);
    return { success: true, message: 'Session revoked successfully' };
  }

  @Post('unlock')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(MinRole.ADMIN)
  @SkipCsrf()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Unlock a locked account (admin only)' })
  async unlockAccount(
    @Body() body: { email: string },
    @Request() req: RequestWithUser,
  ) {
    return this.authService.unlockAccount(body.email, req.user.id);
  }
}
