import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class MeExportService {
  constructor(private prisma: PrismaService) {}

  async exportIcs(email: string): Promise<string> {
    const personnel = await this.prisma.personnel.findUnique({
      where: { email },
    });
    if (!personnel) throw new NotFoundException('Personel bulunamadı');

    const now = new Date();
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
          where: { personnelId: personnel.id },
          include: { device: true },
          orderBy: { date: 'asc' },
        },
      },
    });

    if (!schedule || schedule.assignments.length === 0) {
      throw new NotFoundException('Bu ay için vardiya bulunamadı');
    }

    const lines: string[] = [];
    lines.push('BEGIN:VCALENDAR');
    lines.push('VERSION:2.0');
    lines.push('PRODID:-//VardiyaOS//NONSGML v1.0//TR');
    lines.push('CALSCALE:GREGORIAN');
    lines.push('METHOD:PUBLISH');
    lines.push('X-WR-CALNAME:Vardiya Planı');
    lines.push('X-WR-TIMEZONE:Europe/Istanbul');

    lines.push('BEGIN:VTIMEZONE');
    lines.push('TZID:Europe/Istanbul');
    lines.push('BEGIN:STANDARD');
    lines.push('DTSTART:19701025T040000');
    lines.push('TZOFFSETFROM:+0300');
    lines.push('TZOFFSETTO:+0300');
    lines.push('TZNAME:TRT');
    lines.push('END:STANDARD');
    lines.push('BEGIN:DAYLIGHT');
    lines.push('DTSTART:19700329T030000');
    lines.push('TZOFFSETFROM:+0300');
    lines.push('TZOFFSETTO:+0300');
    lines.push('TZNAME:TRT');
    lines.push('END:DAYLIGHT');
    lines.push('END:VTIMEZONE');

    for (const a of schedule.assignments) {
      const [sh, sm] = a.startTime.split(':').map(Number);
      const [eh, em] = a.endTime.split(':').map(Number);
      const startDate = a.date.replace(/-/g, '');
      const endDate = a.date.replace(/-/g, '');
      const uid = `shift-${a.id}@vardiyaos`;
      const shiftLabel = this.getShiftLabel(a.shiftType);
      const deviceName = a.device?.name || a.device?.code || '';

      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${uid}`);
      lines.push(
        `DTSTART;TZID=Europe/Istanbul:${startDate}T${String(sh).padStart(2, '0')}${String(sm).padStart(2, '0')}00`,
      );
      lines.push(
        `DTEND;TZID=Europe/Istanbul:${endDate}T${String(eh).padStart(2, '0')}${String(em).padStart(2, '0')}00`,
      );
      lines.push(`SUMMARY:${shiftLabel} - ${deviceName}`);
      lines.push(
        `DESCRIPTION:Vardiya: ${shiftLabel}\\nCihaz: ${deviceName}\\nSaat: ${a.startTime} - ${a.endTime}`,
      );
      lines.push(`LOCATION:${schedule.unit?.name || ''}`);
      lines.push('STATUS:CONFIRMED');
      lines.push(`TRANSP:OPAQUE`);
      lines.push(`BEGIN:VALARM`);
      lines.push(`TRIGGER:-PT12H`);
      lines.push(`ACTION:DISPLAY`);
      lines.push(`DESCRIPTION:Hatırlatma: ${shiftLabel} vardiyanız ${a.date}`);
      lines.push(`END:VALARM`);
      lines.push('END:VEVENT');
    }

    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
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
}
