import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ConsentService } from './consent.service';

@Controller('consent')
@UseGuards(JwtAuthGuard)
export class ConsentController {
  constructor(private consentService: ConsentService) {}

  @Get('templates')
  async getTemplates() {
    return this.consentService.getTemplates();
  }

  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    return this.consentService.getTemplate(id);
  }

  @Get('me')
  async getMyConsents(@Req() req: any) {
    return this.consentService.getConsentStatus(req.user.id);
  }

  @Post('me/give/:templateId')
  async giveConsent(@Req() req: any, @Param('templateId') templateId: string) {
    return this.consentService.giveConsent(
      req.user.id,
      templateId,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @Post('me/withdraw/:templateId')
  async withdrawConsent(
    @Req() req: any,
    @Param('templateId') templateId: string,
  ) {
    return this.consentService.withdrawConsent(req.user.id, templateId);
  }

  @Get('check/:purpose')
  async checkConsent(@Req() req: any, @Param('purpose') purpose: string) {
    const hasConsent = await this.consentService.checkConsent(
      req.user.id,
      purpose,
    );
    return { hasConsent, purpose };
  }

  @Get('statistics')
  async getStatistics(@Req() req: any) {
    return this.consentService.getConsentStatistics(req.user?.organizationId);
  }

  @Get('admin/:userId')
  async getUserConsents(@Param('userId') userId: string) {
    return this.consentService.getUserConsents(userId);
  }
}
