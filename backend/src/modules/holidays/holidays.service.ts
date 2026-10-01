import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class HolidaysService {
  constructor(private prisma: PrismaService) {}

  async findAll(year?: number) {
    return this.prisma.holiday.findMany({
      where: year ? { year } : undefined,
      orderBy: { date: 'asc' },
    });
  }

  async findByDateRange(startDate: string, endDate: string) {
    return this.prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async isHoliday(date: string): Promise<boolean> {
    const holiday = await this.prisma.holiday.findUnique({
      where: { date },
    });
    return !!holiday;
  }

  async create(data: {
    date: string;
    name: string;
    type: string;
    year: number;
  }) {
    return this.prisma.holiday.create({
      data,
    });
  }

  async createBulk(
    holidays: Array<{ date: string; name: string; type: string; year: number }>,
  ) {
    await this.prisma.holiday.createMany({
      data: holidays,
      skipDuplicates: true,
    });
    return { success: true, count: holidays.length };
  }

  async seed2026Holidays() {
    const holidays2026 = [
      { date: '2026-01-01', name: 'Yılbaşı', type: 'national', year: 2026 },
      {
        date: '2026-04-23',
        name: 'Ulusal Egemenlik ve Çocuk Bayramı',
        type: 'national',
        year: 2026,
      },
      {
        date: '2026-05-01',
        name: 'Emek ve Dayanışma Günü',
        type: 'national',
        year: 2026,
      },
      {
        date: '2026-05-19',
        name: "Atatürk'ü Anma ve Gençlik ve Spor Bayramı",
        type: 'national',
        year: 2026,
      },
      {
        date: '2026-06-15',
        name: 'Kurban Bayramı Arifesi',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-06-16',
        name: 'Kurban Bayramı 1. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-06-17',
        name: 'Kurban Bayramı 2. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-06-18',
        name: 'Kurban Bayramı 3. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-06-19',
        name: 'Kurban Bayramı 4. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-07-15',
        name: 'Demokrasi ve Milli Birlik Günü',
        type: 'national',
        year: 2026,
      },
      {
        date: '2026-08-30',
        name: 'Zafer Bayramı',
        type: 'national',
        year: 2026,
      },
      {
        date: '2026-09-06',
        name: 'Hicri Yılbaşı',
        type: 'religious',
        year: 2026,
      },
      { date: '2026-09-13', name: 'Arefe', type: 'religious', year: 2026 },
      {
        date: '2026-09-14',
        name: 'Ramazan Bayramı 1. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-09-15',
        name: 'Ramazan Bayramı 2. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-09-16',
        name: 'Ramazan Bayramı 3. Gün',
        type: 'religious',
        year: 2026,
      },
      {
        date: '2026-10-29',
        name: 'Cumhuriyet Bayramı',
        type: 'national',
        year: 2026,
      },
    ];

    return this.createBulk(holidays2026);
  }
}
