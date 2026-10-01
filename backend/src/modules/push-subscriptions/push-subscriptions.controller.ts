import {
  Controller,
  Post,
  Delete,
  Body,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import {
  PushSubscriptionsService,
  PushSubscriptionData,
} from './push-subscriptions.service';
import { SendPushDto } from './dto/send-push.dto';

@ApiTags('Push Subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('push-subscriptions')
export class PushSubscriptionsController {
  constructor(private readonly pushService: PushSubscriptionsService) {}

  @Post()
  @Roles(MinRole.VIEWER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register push notification subscription' })
  subscribe(
    @Body() body: PushSubscriptionData,
    @Req() req: any,
  ): { success: boolean } {
    this.pushService.subscribe(req.user.userId, body);
    return { success: true };
  }

  @Delete()
  @Roles(MinRole.VIEWER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unregister push notification subscription' })
  unsubscribe(@Req() req: any): { success: boolean } {
    this.pushService.unsubscribe(req.user.userId);
    return { success: true };
  }

  @Post('send')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send push notification to a user (admin only)' })
  async send(@Body() dto: SendPushDto): Promise<{ success: boolean }> {
    const sent = await this.pushService.sendPush(dto.userId, {
      title: dto.title,
      body: dto.body,
      icon: dto.icon || '/icons/icon-192.svg',
      badge: dto.badge || '/icons/icon-72.svg',
      data: dto.data,
      actions: dto.actions || [{ action: 'view', title: 'Görüntüle' }],
    });
    return { success: sent };
  }

  @Post('broadcast')
  @Roles(MinRole.HEAD_TECHNICIAN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Broadcast push notification to all subscribers (admin only)',
  })
  async broadcast(
    @Body()
    body: {
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ): Promise<{ sent: number }> {
    const sent = await this.pushService.broadcastPush({
      title: body.title,
      body: body.body,
      icon: '/icons/icon-192.svg',
      badge: '/icons/icon-72.svg',
      data: body.data,
      actions: [{ action: 'view', title: 'Görüntüle' }],
    });
    return { sent };
  }
}
