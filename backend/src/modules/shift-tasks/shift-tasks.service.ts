import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

const DEFAULT_TASKS: { taskType: string; label: string }[] = [
  { taskType: 'device_startup', label: 'Cihaz Açılış Kontrolü' },
  { taskType: 'calibration', label: 'Kalibrasyon Kontrolü' },
  { taskType: 'room_prep', label: 'Oda Hazırlığı' },
  { taskType: 'portable_imaging', label: 'Portable Görüntüleme' },
  { taskType: 'shutdown', label: 'Kapatma Kontrolü' },
  { taskType: 'handover', label: 'Devir Teslim Notu' },
];

@Injectable()
export class ShiftTasksService {
  constructor(private prisma: PrismaService) {}

  async getDefaultTasks(userId: string, date: string) {
    for (const task of DEFAULT_TASKS) {
      await this.prisma.shiftTask.upsert({
        where: {
          userId_date_taskType: { userId, date, taskType: task.taskType },
        },
        update: { label: task.label },
        create: {
          userId,
          date,
          taskType: task.taskType,
          label: task.label,
          status: 'pending',
        },
      });
    }

    return this.prisma.shiftTask.findMany({
      where: { userId, date },
      orderBy: { taskType: 'asc' },
    });
  }

  async updateTaskStatus(
    userId: string,
    taskId: string,
    status: 'pending' | 'completed' | 'skipped',
  ) {
    const existing = await this.prisma.shiftTask.findUnique({
      where: { id: taskId },
    });
    if (!existing) throw new NotFoundException('Görev bulunamadı');
    return this.prisma.shiftTask.update({
      where: { id: taskId, userId },
      data: {
        status,
        completedAt: status === 'completed' ? new Date() : null,
      },
    });
  }

  async getProgress(userId: string, date: string) {
    const all = await this.prisma.shiftTask.findMany({
      where: { userId, date },
    });

    const total = all.length;
    const completed = all.filter((t) => t.status === 'completed').length;

    return {
      completed,
      total,
      percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  }

  getTodayTasks(userId: string) {
    const today = new Date().toISOString().split('T')[0];
    return this.getDefaultTasks(userId, today);
  }

  async getTaskSummary(userId: string, date: string) {
    const tasks = await this.prisma.shiftTask.findMany({
      where: { userId, date },
      orderBy: { taskType: 'asc' },
    });

    const progress =
      tasks.length > 0
        ? {
            completed: tasks.filter((t) => t.status === 'completed').length,
            total: tasks.length,
            percentage: Math.round(
              (tasks.filter((t) => t.status === 'completed').length /
                tasks.length) *
                100,
            ),
          }
        : { completed: 0, total: 0, percentage: 0 };

    return { tasks, progress };
  }
}
