import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

const DAY_NAMES = [
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi',
  'Pazar',
];

@Injectable()
export class MeDayService {
  constructor(private prisma: PrismaService) {}

  async getMyDay(email: string) {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const personnel = await this.prisma.personnel.findUnique({
      where: { email },
    });
    if (!personnel) {
      return {
        hasShift: false,
        shift: null,
        attendance: null,
        tasks: [],
        taskProgress: { completed: 0, total: 0, percentage: 0 },
        activeIncidents: [],
        pendingSwapRequests: [],
        nextShift: null,
        remainingHours: 0,
        unitName: '',
        unitType: '',
      };
    }

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        unitId: personnel.unitId,
        month: currentMonth,
        year: currentYear,
      },
      include: {
        unit: true,
        assignments: {
          where: { personnelId: personnel.id },
          include: { device: true },
          orderBy: { date: 'asc' },
        },
      },
    });

    const todayAssignment =
      schedule?.assignments?.find((a) => a.date === todayStr) || null;

    const attendance = await this.prisma.attendanceRecord.findUnique({
      where: { userId_date: { userId: personnel.id, date: todayStr } },
    });

    let remainingHours = 0;
    if (attendance?.status === 'active' && todayAssignment) {
      const [eh, em] = todayAssignment.endTime.split(':').map(Number);
      const end = new Date();
      end.setHours(eh, em, 0, 0);
      remainingHours = Math.max(0, (end.getTime() - now.getTime()) / 3600000);
    }

    const nextAssignment =
      schedule?.assignments?.find((a) => a.date > todayStr) || null;

    let tasks: any[] = [];
    try {
      tasks = await this.ensureTodayTasks(personnel.id, todayStr);
    } catch {}

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const total = tasks.length;

    const activeIncidents = await this.prisma.deviceIncident.findMany({
      where: { userId: personnel.id, status: { in: ['open', 'in_progress'] } },
      orderBy: { reportedAt: 'desc' },
      take: 5,
      include: {
        device: { select: { name: true, code: true } },
        unit: { select: { name: true } },
      },
    });

    const pendingSwapRequests = await this.prisma.swapRequest.findMany({
      where: { targetPersonnelId: personnel.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return {
      hasShift: !!todayAssignment,
      shift: todayAssignment
        ? {
            id: todayAssignment.id,
            date: todayAssignment.date,
            shiftType: todayAssignment.shiftType,
            startTime: todayAssignment.startTime,
            endTime: todayAssignment.endTime,
            shiftLabel: this.getShiftLabel(todayAssignment.shiftType),
            deviceName: todayAssignment.device?.name || '',
            deviceCode: todayAssignment.device?.code || '',
            isConfirmed: todayAssignment.isConfirmed,
          }
        : null,
      attendance: attendance
        ? {
            status: attendance.status,
            clockIn: attendance.clockIn,
            clockOut: attendance.clockOut,
          }
        : { status: 'none', clockIn: null, clockOut: null },
      tasks,
      taskProgress: {
        completed,
        total,
        percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
      activeIncidents: activeIncidents.map((inc) => ({
        id: inc.id,
        issueType: inc.issueType,
        severity: inc.severity,
        status: inc.status,
        deviceName: inc.device?.name || null,
        deviceCode: inc.device?.code || null,
        unitName: inc.unit?.name || '',
        reportedAt: inc.reportedAt,
      })),
      pendingSwapRequests: pendingSwapRequests.map((req) => ({
        id: req.id,
        reason: req.reason,
        createdAt: req.createdAt,
      })),
      nextShift: nextAssignment
        ? {
            id: nextAssignment.id,
            date: nextAssignment.date,
            shiftType: nextAssignment.shiftType,
            startTime: nextAssignment.startTime,
            endTime: nextAssignment.endTime,
            shiftLabel: this.getShiftLabel(nextAssignment.shiftType),
            deviceName: nextAssignment.device?.name || '',
            deviceCode: nextAssignment.device?.code || '',
            isConfirmed: nextAssignment.isConfirmed,
          }
        : null,
      remainingHours: Math.round(remainingHours * 10) / 10,
      unitName: schedule?.unit?.name || '',
      unitType: schedule?.unit?.type?.toLowerCase() || '',
      personnel: {
        id: personnel.id,
        name: personnel.name,
        role: personnel.role,
      },
    };
  }

  private async ensureTodayTasks(personnelId: string, todayStr: string) {
    const defaultTasks = [
      { taskType: 'device_startup', label: 'Cihaz Açılış Kontrolü' },
      { taskType: 'calibration', label: 'Kalibrasyon Kontrolü' },
      { taskType: 'room_prep', label: 'Oda Hazırlığı' },
      { taskType: 'portable_imaging', label: 'Portable Görüntüleme' },
      { taskType: 'shutdown', label: 'Kapatma Kontrolü' },
      { taskType: 'handover', label: 'Devir Teslim Notu' },
    ];
    for (const task of defaultTasks) {
      await this.prisma.shiftTask.upsert({
        where: {
          userId_date_taskType: {
            userId: personnelId,
            date: todayStr,
            taskType: task.taskType,
          },
        },
        update: { label: task.label },
        create: {
          userId: personnelId,
          date: todayStr,
          taskType: task.taskType,
          label: task.label,
          status: 'pending',
        },
      });
    }
    return this.prisma.shiftTask.findMany({
      where: { userId: personnelId, date: todayStr },
      orderBy: { taskType: 'asc' },
      select: {
        id: true,
        taskType: true,
        label: true,
        status: true,
        completedAt: true,
      },
    });
  }

  async getToday(email: string) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { email },
    });
    if (!personnel) {
      return {
        hasShift: false,
        shift: null,
        personnel: null,
        unitName: '',
        unitType: '',
      };
    }

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        unitId: personnel.unitId,
        month: currentMonth,
        year: currentYear,
      },
      include: {
        unit: true,
        assignments: {
          where: { personnelId: personnel.id, date: todayStr },
          include: { device: true },
        },
      },
    });

    const assignment = schedule?.assignments?.[0] || null;
    const base = {
      personnel: {
        id: personnel.id,
        name: personnel.name,
        role: personnel.role,
      },
      unitName: schedule?.unit?.name || '',
      unitType: schedule?.unit?.type?.toLowerCase() || '',
    };

    if (!assignment) {
      return { ...base, hasShift: false, shift: null };
    }

    return {
      ...base,
      hasShift: true,
      shift: {
        id: assignment.id,
        date: assignment.date,
        shiftType: assignment.shiftType,
        startTime: assignment.startTime,
        endTime: assignment.endTime,
        shiftLabel: this.getShiftLabel(assignment.shiftType),
        deviceName: assignment.device?.name || '',
        deviceCode: assignment.device?.code || '',
        isConfirmed: assignment.isConfirmed,
      },
    };
  }

  async getWeek(email: string) {
    const personnel = await this.prisma.personnel.findUnique({
      where: { email },
    });
    if (!personnel) {
      return { weekStart: '', weekEnd: '', days: [] };
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();
    const todayStr = now.toISOString().split('T')[0];

    const dayOfWeek = now.getDay();
    const diffToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - diffToMonday);
    monday.setHours(0, 0, 0, 0);
    monday.setMinutes(0, 0, 0);

    const days: Array<{
      date: string;
      dayOfWeek: number;
      dayName: string;
      isToday: boolean;
      isPast: boolean;
      hasShift: boolean;
      shift?: {
        id: string;
        shiftType: string;
        startTime: string;
        endTime: string;
        shiftLabel: string;
        deviceName: string;
        deviceCode: string;
        isConfirmed: boolean;
      };
    }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      const isToday = dateStr === todayStr;
      days.push({
        date: dateStr,
        dayOfWeek: i,
        dayName: this.getTurkishDayName(dateStr),
        isToday,
        isPast: dateStr < todayStr && !isToday,
        hasShift: false,
      });
    }

    const weekStart = days[0].date;
    const weekEnd = days[6].date;

    const schedule = await this.prisma.schedule.findFirst({
      where: {
        unitId: personnel.unitId,
        month: currentMonth,
        year: currentYear,
      },
      include: {
        assignments: {
          where: {
            personnelId: personnel.id,
            date: { gte: weekStart, lte: weekEnd },
          },
          include: { device: true },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (schedule) {
      for (const a of schedule.assignments) {
        const dayIndex = days.findIndex((d) => d.date === a.date);
        if (dayIndex !== -1) {
          days[dayIndex].hasShift = true;
          days[dayIndex].shift = {
            id: a.id,
            shiftType: a.shiftType,
            startTime: a.startTime,
            endTime: a.endTime,
            shiftLabel: this.getShiftLabel(a.shiftType),
            deviceName: a.device?.name || '',
            deviceCode: a.device?.code || '',
            isConfirmed: a.isConfirmed,
          };
        }
      }
    }

    return { weekStart, weekEnd, days };
  }

  private getShiftLabel(type: string): string {
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
      afternoon: 'İkindi',
    };
    return map[type] || type;
  }

  private getTurkishDayName(dateStr: string): string {
    const d = new Date(dateStr);
    return DAY_NAMES[d.getDay() === 0 ? 6 : d.getDay() - 1];
  }
}
