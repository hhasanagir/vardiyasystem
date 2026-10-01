import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ScheduleGateway } from '../websocket/schedule.gateway';
import { NotificationEventService } from '../notifications/notification-event.service';
import { ClockInDto } from './dto/clock-in.dto';
import { ClockOutDto } from './dto/clock-out.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private prisma: PrismaService,
    private gateway: ScheduleGateway,
    private notificationEvent: NotificationEventService,
  ) {}

  async getTodayStatus(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    const record = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: today } },
      include: { assignment: { include: { device: true } } },
    });
    return {
      date: today,
      status: record?.status || 'none',
      clockIn: record?.clockIn || null,
      clockOut: record?.clockOut || null,
      assignment: record?.assignment || null,
    };
  }

  async getHistory(userId: string, limit = 30) {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: limit,
      include: { assignment: { include: { device: true } } },
    });
    return records.map((r) => ({
      id: r.id,
      date: r.date,
      status: r.status,
      clockIn: r.clockIn,
      clockOut: r.clockOut,
      duration:
        r.clockIn && r.clockOut
          ? Math.round((r.clockOut.getTime() - r.clockIn.getTime()) / 60000)
          : null,
      deviceName: r.assignment?.device?.name || null,
    }));
  }

  async clockIn(userId: string, dto: ClockInDto, ipAddress?: string) {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (existing && existing.status !== 'none') {
      throw new ConflictException('Bugün için zaten giriş yapılmış');
    }
    const record = await this.prisma.attendanceRecord.upsert({
      where: { userId_date: { userId, date: today } },
      update: {
        clockIn: new Date(),
        status: 'active',
        assignmentId: dto.assignmentId || null,
        notes: dto.notes || null,
        ipAddress: ipAddress || null,
      },
      create: {
        userId,
        date: today,
        clockIn: new Date(),
        status: 'active',
        assignmentId: dto.assignmentId || null,
        notes: dto.notes || null,
        ipAddress: ipAddress || null,
      },
    });
    this.gateway.broadcastDeviceIncident({
      unitId: 'system',
      incident: {
        id: record.id,
        issueType: 'attendance',
        severity: 'info',
        deviceName: null,
      },
    });

    this.notificationEvent.clockedIn(userId, '', {
      date: today,
      time: new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });

    return record;
  }

  async clockOut(userId: string, dto: ClockOutDto) {
    const today = new Date().toISOString().split('T')[0];
    const existing = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId, date: today } },
    });
    if (!existing) {
      throw new NotFoundException('Bugün için giriş kaydı bulunamadı');
    }
    if (existing.clockOut) {
      throw new ConflictException('Bugün için zaten çıkış yapılmış');
    }
    const now = new Date();
    const record = await this.prisma.attendanceRecord.update({
      where: { userId_date: { userId, date: today } },
      data: {
        clockOut: now,
        status: 'completed',
        notes: dto.notes
          ? existing.notes
            ? `${existing.notes}\n${dto.notes}`
            : dto.notes
          : existing.notes,
      },
    });

    this.notificationEvent.clockedOut(userId, '', {
      date: today,
      time: now.toLocaleTimeString('tr-TR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
    });

    return record;
  }

  async getMonthlyStats(userId: string, month: number, year: number) {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: { startsWith: monthStr },
        status: 'completed',
      },
      include: { assignment: { include: { device: true } } },
    });
    const totalDays = records.length;
    const totalMinutes = records.reduce((sum, r) => {
      if (r.clockIn && r.clockOut) {
        return sum + (r.clockOut.getTime() - r.clockIn.getTime()) / 60000;
      }
      return sum;
    }, 0);
    const earlyCount = records.filter((r) => {
      if (!r.clockIn) return false;
      const h = r.clockIn.getHours();
      const m = r.clockIn.getMinutes();
      return h < 7 || (h === 7 && m === 0);
    }).length;

    const allYearRecords = await this.prisma.attendanceRecord.findMany({
      where: {
        userId,
        date: { startsWith: `${year}-` },
        status: 'completed',
      },
      include: { assignment: { include: { device: true } } },
    });

    const totalMinutesYtd = allYearRecords.reduce((sum, r) => {
      if (r.clockIn && r.clockOut) {
        return sum + (r.clockOut.getTime() - r.clockIn.getTime()) / 60000;
      }
      return sum;
    }, 0);
    const overtimeMinutes = Math.max(
      0,
      totalMinutesYtd - allYearRecords.length * 480,
    );

    const nightShiftCount = allYearRecords.filter((r) => {
      if (!r.clockIn) return false;
      const h = r.clockIn.getHours();
      return h >= 22 || h < 6;
    }).length;

    const weekendCount = allYearRecords.filter((r) => {
      const d = new Date(r.date + 'T00:00:00');
      const day = d.getDay();
      return day === 0 || day === 6;
    }).length;

    const deviceCounts: Record<string, { name: string; count: number }> = {};
    allYearRecords.forEach((r) => {
      if (r.assignment?.device) {
        const id = r.assignment.device.id;
        if (!deviceCounts[id])
          deviceCounts[id] = { name: r.assignment.device.name, count: 0 };
        deviceCounts[id].count++;
      }
    });
    const mostUsedDevice =
      Object.values(deviceCounts).sort((a, b) => b.count - a.count)[0]?.name ||
      null;

    const completedShifts = allYearRecords.length;

    return {
      totalDays,
      totalHours: Math.round((totalMinutes / 60) * 10) / 10,
      avgHoursPerDay:
        totalDays > 0
          ? Math.round((totalMinutes / totalDays / 60) * 10) / 10
          : 0,
      onTimeRate:
        totalDays > 0 ? Math.round((earlyCount / totalDays) * 100) : 0,
      overtimeHours: Math.round((overtimeMinutes / 60) * 10) / 10,
      nightShifts: nightShiftCount,
      weekendShifts: weekendCount,
      completedShifts,
      mostUsedDevice,
    };
  }

  async broadcastStatusChange(userId: string, status: string) {
    this.gateway.server?.to(`user:${userId}`).emit('attendance:status', {
      userId,
      status,
      timestamp: new Date(),
    });
  }
}
