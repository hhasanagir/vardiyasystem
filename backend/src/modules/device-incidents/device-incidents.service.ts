import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { NotificationEventService } from '../notifications/notification-event.service';
import { AlertingService } from '../../alerting/alerting.service';
import { EventBusService } from '../../events/event-bus.service';
import { createEvent, EVENT_NAMES, AGGREGATE_TYPES } from '../../events/domain-event.interface';
import { CreateDeviceIncidentDto } from './dto/create-device-incident.dto';
import { UpdateDeviceIncidentDto } from './dto/update-device-incident.dto';
import { IncidentQueryDto } from './dto/incident-query.dto';

const MANAGER_ROLES = ['system_admin', 'hospital_admin', 'imaging_director', 'supervisor', 'senior_technician'] as const;

export interface IncidentScope {
  organizationId?: string | null;
  unitId?: string | null;
  denyAll?: boolean;
}

@Injectable()
export class DeviceIncidentsService {
  constructor(
    private prisma: PrismaService,
    private gateway: ScheduleGateway,
    private notificationEvent: NotificationEventService,
    private alerting: AlertingService,
    private eventBus: EventBusService,
  ) {}

  private async assertCreateScope(unit: { id: string; organizationId: string | null }, scope?: IncidentScope) {
    if (scope?.denyAll) {
      throw new ForbiddenException('Bu işlem için birim erişim yetkiniz yok');
    }
    if (scope?.organizationId !== undefined && scope.organizationId !== null && unit.organizationId !== scope.organizationId) {
      throw new ForbiddenException('Başka kuruluşun birimine kayıt eklenemez');
    }
    if (scope?.unitId && unit.id !== scope.unitId) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
  }

  async create(userId: string, dto: CreateDeviceIncidentDto, scope?: IncidentScope) {
    const unit = await this.prisma.unit.findUnique({
      where: { id: dto.unitId },
      select: { id: true, name: true, organizationId: true },
    });
    if (!unit) throw new NotFoundException('Birim bulunamadı');
    await this.assertCreateScope(unit, scope);

    if (dto.deviceId) {
      const device = await this.prisma.device.findUnique({ where: { id: dto.deviceId } });
      if (!device) throw new NotFoundException('Cihaz bulunamadı');
    }

    const incident = await this.prisma.deviceIncident.create({
      data: {
        userId,
        unitId: dto.unitId,
        deviceId: dto.deviceId || null,
        issueType: dto.issueType,
        severity: dto.severity || 'medium',
        description: dto.description,
        imageUrl: dto.imageUrl || null,
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    this.gateway.broadcastDeviceIncident({
      unitId: dto.unitId,
      incident: {
        id: incident.id,
        issueType: incident.issueType,
        severity: incident.severity,
        deviceName: incident.device?.name || null,
      },
    });

    if (incident.severity === 'critical') {
      await this.notifyManagers(incident);
      this.alerting.sendAlert({
        title: 'Critical device incident',
        message: `${incident.issueType} at ${incident.unit?.name || 'unknown unit'}`,
        severity: 'critical',
        source: 'device-incidents',
        metadata: {
          incidentId: incident.id,
          unitName: incident.unit?.name,
          deviceName: incident.device?.name,
          reportedBy: incident.user?.name,
          issueType: incident.issueType,
        },
      });
    }

    this.eventBus.publish(createEvent(
      EVENT_NAMES.DEVICE_INCIDENT_CREATED,
      incident.id,
      AGGREGATE_TYPES.DEVICE_INCIDENT,
      {
        incidentId: incident.id,
        unitId: dto.unitId,
        deviceId: dto.deviceId,
        issueType: incident.issueType,
        severity: incident.severity,
        userId,
        unitName: incident.unit?.name,
        deviceName: incident.device?.name,
      },
      userId,
    ));

    return incident;
  }

  async findAll(userUnitId: string | undefined, query: IncidentQueryDto, scope?: IncidentScope) {
    const where: any = {};
    if (query.unitId) {
      where.unitId = query.unitId;
    } else if (userUnitId) {
      where.unitId = userUnitId;
    }
    if (query.deviceId) where.deviceId = query.deviceId;
    if (query.issueType) where.issueType = query.issueType;
    if (query.severity) where.severity = query.severity;
    if (query.status) where.status = query.status;

    if (scope?.denyAll) {
      where.unitId = '__deny_all__';
    } else if (scope?.unitId) {
      where.unitId = scope.unitId;
    }
    if (scope?.organizationId) where.organizationId = scope.organizationId;

    const [data, total] = await Promise.all([
      this.prisma.deviceIncident.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, role: true } },
          unit: { select: { id: true, name: true, organizationId: true } },
          device: { select: { id: true, name: true, code: true } },
        },
        orderBy: { reportedAt: 'desc' },
      }),
      this.prisma.deviceIncident.count({ where }),
    ]);

    return { data, total };
  }

  async findOne(id: string, organizationId?: string, unitId?: string) {
    const incident = await this.prisma.deviceIncident.findFirst({
      where: {
        id,
        ...(organizationId ? { organizationId } : {}),
        ...(unitId ? { unitId } : {}),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });
    if (!incident) throw new NotFoundException('Cihaz arıza kaydı bulunamadı');
    return incident;
  }

  async update(id: string, userId: string, dto: UpdateDeviceIncidentDto, organizationId?: string, unitId?: string) {
    const incident = await this.prisma.deviceIncident.findFirst({
      where: { id, ...(organizationId ? { organizationId } : {}), ...(unitId ? { unitId } : {}) },
    });
    if (!incident) throw new NotFoundException('Cihaz arıza kaydı bulunamadı');

    const updated = await this.prisma.deviceIncident.update({
      where: { id },
      data: {
        ...(dto.issueType !== undefined && { issueType: dto.issueType }),
        ...(dto.severity !== undefined && { severity: dto.severity }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    return updated;
  }

  async updateStatus(id: string, status: string, organizationId?: string, unitId?: string) {
    const incident = await this.prisma.deviceIncident.findUnique({ where: { id } });
    if (!incident) throw new NotFoundException('Cihaz arıza kaydı bulunamadı');

    if (unitId && incident.unitId !== unitId) {
      throw new ForbiddenException('Bu birime erişim yetkiniz yok');
    }
    if (organizationId) {
      const unit = await this.prisma.unit.findUnique({
        where: { id: incident.unitId },
        select: { organizationId: true },
      });
      if (unit && unit.organizationId !== organizationId) {
        throw new ForbiddenException('Başka kuruluşun kaydı güncellenemez');
      }
    }

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
    if (!validStatuses.includes(status)) {
      throw new NotFoundException('Geçersiz durum değeri');
    }

    const updated = await this.prisma.deviceIncident.update({
      where: { id },
      data: { status },
      include: {
        user: { select: { id: true, name: true, role: true } },
        unit: { select: { id: true, name: true, organizationId: true } },
        device: { select: { id: true, name: true, code: true } },
      },
    });

    return updated;
  }

  private async notifyManagers(incident: any) {
    const orgId = incident.unit?.organizationId;
    if (!orgId) return;

    const managers = await this.prisma.user.findMany({
      where: {
        organizationId: orgId,
        role: { in: [...MANAGER_ROLES] as any },
        isActive: true,
      },
      select: { id: true },
    });

    this.notificationEvent.incidentCritical(
      managers.map(m => m.id),
      orgId,
      { incidentId: incident.id, unitName: incident.unit?.name || '', deviceName: incident.device?.name, userName: incident.user?.name || 'Bilinmeyen', issueType: incident.issueType },
    );
  }
}
