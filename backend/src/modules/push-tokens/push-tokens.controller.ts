import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PushTokensService } from './push-tokens.service';

@ApiTags('Push Tokens')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/push')
export class PushTokensController {
  constructor(private readonly pushTokensService: PushTokensService) {}

  @Post('register')
  @HttpCode(200)
  @ApiOperation({ summary: 'Register FCM push token for current device' })
  async register(
    @Body() body: { token: string; platform: string },
    @Req() req: any,
  ) {
    await this.pushTokensService.register(
      req.user.id,
      body.token,
      body.platform,
    );
    return { success: true };
  }

  @Delete('unregister')
  @HttpCode(200)
  @ApiOperation({ summary: 'Unregister FCM push token' })
  async unregister(@Body() body: { token: string }, @Req() req: any) {
    await this.pushTokensService.unregister(req.user.id, body.token);
    return { success: true };
  }
}
