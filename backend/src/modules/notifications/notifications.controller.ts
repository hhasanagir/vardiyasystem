import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { MinRole } from '../../guards/min-role';
import { NotificationsService } from './notifications.service';
import { NotificationOrchestratorService } from './notification-orchestrator.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { DeliveryTrackerService } from './delivery-tracker.service';
import { NotificationAnalyticsService } from './notification-analytics.service';
import { NotificationEventService } from './notification-event.service';
import { WebPushSenderService } from './web-push-sender.service';
import { NotificationAccessGuard } from './guards/notification-access.guard';
import {
  SendNotificationDto,
  SendAnnouncementDto,
  SendEmergencyDto,
  NotificationFilterDto,
  NotificationPreferenceDto,
  RegisterWebPushDto,
  NotificationStatsQueryDto,
} from './dto/notification.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(
    private notificationsService: NotificationsService,
    private orchestrator: NotificationOrchestratorService,
    private preferenceService: NotificationPreferenceService,
    private deliveryTracker: DeliveryTrackerService,
    private analytics: NotificationAnalyticsService,
    private eventService: NotificationEventService,
    private webPushSender: WebPushSenderService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List notifications for current user' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async findAll(@Request() req: any, @Query() filter?: NotificationFilterDto) {
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;
    return this.notificationsService.getUserNotifications(
      req.user.id,
      {
        types: filter?.types as any,
        priorities: filter?.priorities as any,
        isRead: filter?.isRead,
        search: filter?.search,
        startDate: filter?.startDate ? new Date(filter.startDate) : undefined,
        endDate: filter?.endDate ? new Date(filter.endDate) : undefined,
      },
      limit,
      offset,
    );
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get unread notification count' })
  getUnreadCount(@Request() req: any) {
    return this.notificationsService.getUnreadCount(req.user.id);
  }

  @Get('unread-by-type')
  @ApiOperation({ summary: 'Get unread count grouped by type' })
  getUnreadByType(@Request() req: any) {
    return this.notificationsService.getUnreadCountByType(req.user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get notification by ID' })
  async getById(@Param('id') id: string, @Request() req: any) {
    const notification =
      await this.notificationsService.getNotificationById(id);
    if (!notification) return { data: null };
    const isRecipient = notification.recipients.some(
      (r) => r.userId === req.user.id,
    );
    if (!isRecipient && req.user.role !== 'system_admin') {
      return { data: null };
    }
    return { data: notification };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as read' })
  markAsRead(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  markAllAsRead(@Request() req: any) {
    return this.notificationsService.markAllAsRead(req.user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete notification' })
  delete(@Param('id') id: string, @Request() req: any) {
    return this.notificationsService.deleteNotification(id, req.user.id);
  }

  @Post(':id/clicked')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Mark notification as clicked' })
  markClicked(
    @Param('id') id: string,
    @Request() req: any,
    @Body('channel') channel?: string,
  ) {
    return this.notificationsService.markClicked(
      id,
      req.user.id,
      channel as any,
    );
  }

  @Post('send')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send notification to specific users' })
  async send(@Body() dto: SendNotificationDto, @Request() req: any) {
    return this.orchestrator.send({
      organizationId: dto.organizationId,
      type: dto.type as any,
      priority: dto.priority as any,
      title: dto.title,
      message: dto.message,
      data: dto.data,
      senderId: req.user.id,
      recipientIds: dto.recipientIds,
      channels: dto.channels as any,
    });
  }

  @Post('announce')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send announcement to all users in organization' })
  async announce(@Body() dto: SendAnnouncementDto, @Request() req: any) {
    if (dto.recipientIds?.length) {
      return this.orchestrator.send({
        organizationId: req.user.organizationId,
        type: 'SYSTEM_ANNOUNCEMENT' as any,
        title: dto.title,
        message: dto.message,
        data: dto.data,
        senderId: req.user.id,
        recipientIds: dto.recipientIds,
      });
    }
    return this.orchestrator.sendToAllUsers({
      organizationId: req.user.organizationId,
      type: 'SYSTEM_ANNOUNCEMENT' as any,
      title: dto.title,
      message: dto.message,
      data: dto.data,
      senderId: req.user.id,
    });
  }

  @Post('emergency')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Send emergency notification' })
  async sendEmergency(@Body() dto: SendEmergencyDto, @Request() req: any) {
    return this.orchestrator.send({
      organizationId: req.user.organizationId,
      type: 'EMERGENCY_ALERT' as any,
      priority: 'CRITICAL' as any,
      title: dto.title,
      message: dto.message,
      data: dto.data,
      senderId: req.user.id,
      recipientIds: dto.recipientIds,
      channels: ['IN_APP', 'FCM', 'EMAIL', 'WEB_PUSH'] as any,
    });
  }

  @Get('preferences')
  @ApiOperation({ summary: 'Get notification preferences' })
  getPreferences(@Request() req: any) {
    return this.preferenceService.getPreferences(req.user.id);
  }

  @Post('preferences')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update notification preferences' })
  updatePreferences(
    @Request() req: any,
    @Body() dto: NotificationPreferenceDto,
  ) {
    return this.preferenceService.updatePreferences(req.user.id, dto);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get notification delivery statistics' })
  async getStats(@Query() query: NotificationStatsQueryDto) {
    return this.deliveryTracker.getDeliveryStats(
      query.organizationId,
      query.startDate ? new Date(query.startDate) : undefined,
      query.endDate ? new Date(query.endDate) : undefined,
    );
  }

  @Get('stats/trend')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get notification delivery trend' })
  async getTrend(
    @Query('days') days?: string,
    @Query('organizationId') orgId?: string,
  ) {
    return this.deliveryTracker.getDeliveryTrend(Number(days) || 30, orgId);
  }

  @Get('stats/channels')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get channel breakdown' })
  async getChannelBreakdown(@Query('organizationId') orgId?: string) {
    return this.deliveryTracker.getChannelBreakdown(orgId);
  }

  @Get('stats/overview')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get notification overview analytics' })
  async getOverview(@Query('organizationId') orgId?: string) {
    return this.analytics.getOverview(orgId);
  }

  @Get('stats/failed')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @ApiOperation({ summary: 'Get failed deliveries' })
  async getFailed(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.deliveryTracker.getFailedDeliveries(
      Number(limit) || 50,
      Number(offset) || 0,
    );
  }

  @Post('stats/failed/retry-all')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry all failed deliveries' })
  async retryAllFailed() {
    return this.deliveryTracker.retryAllFailed();
  }

  @Post('stats/failed/:id/retry')
  @UseGuards(RolesGuard)
  @Roles(MinRole.SUPERVISOR)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a single failed delivery' })
  async retryFailed(@Param('id') id: string) {
    return this.deliveryTracker.retryFailedDelivery(id);
  }

  @Get('engagement')
  @ApiOperation({ summary: 'Get user notification engagement' })
  async getEngagement(@Request() req: any) {
    return this.analytics.getUserEngagement(req.user.id);
  }

  @Post('web-push/subscribe')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register web push subscription' })
  async subscribeWebPush(@Body() dto: RegisterWebPushDto, @Request() req: any) {
    await this.webPushSender.subscribe(
      req.user.id,
      dto.endpoint,
      dto.auth,
      dto.p256dh,
      dto.userAgent,
    );
    return { success: true };
  }

  @Post('web-push/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Unregister web push subscription' })
  async unsubscribeWebPush(
    @Body('endpoint') endpoint: string,
    @Request() req: any,
  ) {
    await this.webPushSender.unsubscribe(req.user.id, endpoint);
    return { success: true };
  }

  @Get('web-push/vapid-public-key')
  @ApiOperation({ summary: 'Get VAPID public key for web push' })
  getVapidPublicKey() {
    const key = process.env['VAPID_PUBLIC_KEY'] || '';
    return { publicKey: key };
  }
}
