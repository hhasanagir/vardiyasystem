import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  UseGuards,
  Request,
  Res,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuditLogService, AuditLogEntry } from './audit-log.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuditAccessGuard } from './audit.guard';
import { AuditQueryDto, AuditExportQueryDto } from './audit.dto';

interface RequestWithUser {
  user: {
    id: string;
    role: string;
    name: string;
    email?: string;
    organizationId?: string;
    hospitalId?: string;
    unitId?: string;
  };
}

@ApiTags('audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, AuditAccessGuard)
@Controller('audit')
export class AuditLogController {
  constructor(private auditLogService: AuditLogService) {}

  @Get()
  @ApiOperation({ summary: 'List audit logs with filtering and pagination' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'actionType', required: false })
  @ApiQuery({ name: 'entityType', required: false })
  @ApiQuery({ name: 'entityId', required: false })
  @ApiQuery({ name: 'organizationId', required: false })
  @ApiQuery({ name: 'hospitalId', required: false })
  @ApiQuery({ name: 'unitId', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  findAll(@Query() query: AuditQueryDto) {
    return this.auditLogService.findAll({
      userId: query.userId,
      actionType: query.actionType,
      entityType: query.entityType,
      entityId: query.entityId,
      organizationId: query.organizationId,
      hospitalId: query.hospitalId,
      unitId: query.unitId,
      startDate: query.startDate,
      endDate: query.endDate,
      search: query.search,
      status: query.status,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single audit log entry by ID' })
  async findById(@Param('id') id: string) {
    const log = await this.auditLogService.findById(id);
    if (!log) {
      throw new BadRequestException('Audit log not found');
    }
    return log;
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Get audit logs for a specific user' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  @ApiQuery({ name: 'startDate', required: false })
  @ApiQuery({ name: 'endDate', required: false })
  findByUser(@Param('userId') userId: string, @Query() query: AuditQueryDto) {
    return this.auditLogService.findByUser(userId, {
      limit: query.limit,
      offset: query.offset,
      startDate: query.startDate,
      endDate: query.endDate,
    });
  }

  @Get('entity/:entityType/:entityId')
  @ApiOperation({ summary: 'Get audit logs for a specific entity' })
  findByEntity(
    @Param('entityType') entityType: string,
    @Param('entityId') entityId: string,
  ) {
    return this.auditLogService.findByEntity(entityType, entityId);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'Get audit statistics for date range' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  getStatistics(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    return this.auditLogService.getStatistics(startDate, endDate);
  }

  @Get('flagged')
  @ApiOperation({ summary: 'Get all flagged audit log entries' })
  getFlagged() {
    return this.auditLogService.getFlaggedLogs();
  }

  @Get('suspicious')
  @ApiOperation({ summary: 'Detect suspicious activity' })
  @ApiQuery({ name: 'userId', required: false })
  detectSuspicious(@Query('userId') userId?: string) {
    return this.auditLogService.detectSuspiciousActivity(userId);
  }

  @Post(':id/flag')
  @ApiOperation({ summary: 'Flag an audit log entry for investigation' })
  flagEntry(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req: RequestWithUser,
  ) {
    if (!reason) {
      throw new BadRequestException('Flag reason is required');
    }
    return this.auditLogService.flagLog(id, reason, req.user.id);
  }

  @Post(':id/unflag')
  @ApiOperation({ summary: 'Unflag an audit log entry' })
  unflagEntry(@Param('id') id: string) {
    return this.auditLogService.unflagLog(id);
  }

  @Get('export/csv')
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  async exportCsv(@Res() res: Response, @Query() query: AuditExportQueryDto) {
    const logs = await this.auditLogService.findAll({
      userId: query.userId,
      actionType: query.actionType,
      entityType: query.entityType,
      entityId: query.entityId,
      organizationId: query.organizationId,
      hospitalId: query.hospitalId,
      unitId: query.unitId,
      startDate: query.startDate,
      endDate: query.endDate,
      status: query.status,
      limit: 1000,
    });

    const csv = this.generateCsv(logs.data);
    const bom = '\uFEFF';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit-log-export-${Date.now()}.csv`,
    );
    res.send(bom + csv);
  }

  @Get('export/report')
  @ApiOperation({ summary: 'Export audit report as HTML (printable)' })
  @ApiQuery({ name: 'startDate', required: true })
  @ApiQuery({ name: 'endDate', required: true })
  async exportReport(
    @Res() res: Response,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query() query: AuditExportQueryDto,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }
    const logs = await this.auditLogService.findAll({
      ...query,
      startDate,
      endDate,
      limit: 500,
    });

    const html = this.generateAuditReportHtml(logs.data, {
      startDate,
      endDate,
    });
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=audit-report-${startDate}-${endDate}.html`,
    );
    res.send(Buffer.from(html));
  }

  private generateCsv(entries: AuditLogEntry[]): string {
    const headers = [
      'Tarih/Saat',
      'Kullanıcı',
      'Rol',
      'İşlem',
      'Varlık Türü',
      'Varlık ID',
      'IP Adresi',
      'Durum',
      'Açıklama',
      'Bayrak',
    ];

    const rows = entries.map((e) => [
      e.timestamp instanceof Date
        ? e.timestamp.toLocaleString('tr-TR')
        : e.timestamp,
      e.userName,
      e.userRole,
      e.actionLabel,
      e.entityTypeLabel,
      e.entityId,
      e.ipAddress,
      e.status,
      e.description,
      e.isFlagged ? 'Evet' : 'Hayır',
    ]);

    return [
      headers.join(','),
      ...rows.map((r) =>
        r.map((v) => `"${(v || '').toString().replace(/"/g, '""')}"`).join(','),
      ),
    ].join('\n');
  }

  private generateAuditReportHtml(
    entries: AuditLogEntry[],
    options: { startDate: string; endDate: string },
  ): string {
    const totalLogs = entries.length;
    const flaggedLogs = entries.filter((e) => e.isFlagged).length;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Denetim Raporu - ${options.startDate} / ${options.endDate}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
    .header { border-bottom: 3px solid #1e3a5f; padding-bottom: 20px; margin-bottom: 30px; }
    .title { font-size: 24px; color: #1e3a5f; margin: 0; }
    .subtitle { color: #666; margin-top: 5px; }
    .stats { display: flex; gap: 40px; margin-bottom: 30px; }
    .stat-box { background: #f5f7fa; padding: 15px 25px; border-radius: 8px; }
    .stat-value { font-size: 28px; font-weight: bold; color: #1e3a5f; }
    .stat-label { color: #666; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { background: #1e3a5f; color: white; padding: 12px; text-align: left; }
    td { padding: 10px; border-bottom: 1px solid #e0e0e0; }
    tr:hover { background: #f9f9f9; }
    .flag { color: #dc3545; font-weight: bold; }
    .action-badge { padding: 4px 8px; border-radius: 4px; font-size: 11px; }
    .action-CREATE { background: #d4edda; color: #155724; }
    .action-UPDATE { background: #fff3cd; color: #856404; }
    .action-DELETE { background: #f8d7da; color: #721c24; }
    .action-APPROVE { background: #d1ecf1; color: #0c5460; }
    .action-PUBLISH { background: #d1ecf1; color: #0c5460; }
    .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc; font-size: 11px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">VARDIYA SİSTEMİ - DENETİM RAPORU</h1>
    <p class="subtitle">Rapor Tarihi: ${new Date().toLocaleDateString('tr-TR')} | Dönem: ${options.startDate} - ${options.endDate}</p>
  </div>
  <div class="stats">
    <div class="stat-box"><div class="stat-value">${totalLogs}</div><div class="stat-label">TOPLAM İŞLEM</div></div>
    <div class="stat-box"><div class="stat-value">${flaggedLogs}</div><div class="stat-label">İŞARETLENEN</div></div>
    <div class="stat-box"><div class="stat-value">${new Set(entries.map((e) => e.userId)).size}</div><div class="stat-label">AKTİF KULLANICI</div></div>
  </div>
  <table>
    <thead>
      <tr><th>Tarih/Saat</th><th>Kullanıcı</th><th>Rol</th><th>İşlem</th><th>Varlık</th><th>IP</th><th>Durum</th></tr>
    </thead>
    <tbody>
      ${entries
        .map(
          (e) => `
        <tr>
          <td>${e.timestamp instanceof Date ? e.timestamp.toLocaleString('tr-TR') : e.timestamp}</td>
          <td>${e.userName}</td>
          <td>${e.userRole}</td>
          <td><span class="action-badge action-${e.action}">${e.actionLabel}</span></td>
          <td>${e.entityTypeLabel}: ${e.entityId || '-'}</td>
          <td>${e.ipAddress || '-'}</td>
          <td>${e.isFlagged ? '<span class="flag">İşaretli</span>' : e.status}</td>
        </tr>
      `,
        )
        .join('')}
    </tbody>
  </table>
  <div class="footer">
    <p>Bu rapor VardiyaOS sistemi tarafından otomatik oluşturulmuştur.</p>
    <p>Rapor ID: ${Date.now()} | Sayfa 1/${Math.ceil(totalLogs / 50)}</p>
  </div>
</body>
</html>`;
  }
}
