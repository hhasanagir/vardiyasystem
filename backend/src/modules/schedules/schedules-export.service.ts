import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { UnitsService } from '../units/units.service';
import * as ExcelJS from 'exceljs';
import { UnitType } from '@prisma/client';
const PDFDocument = require('pdfkit');

@Injectable()
export class SchedulesExportService {
  constructor(
    private prisma: PrismaService,
    private unitsService: UnitsService,
  ) {}

  async exportExcel(unitType: string, month: number, year: number) {
    const data = await this.getExportData(unitType, month, year);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VardiyaOS';
    const ws = workbook.addWorksheet(
      toSheetName(`${data.unitName} ${month}/${year}`),
    );

    ws.columns = [
      { header: 'Tarih', key: 'date', width: 14 },
      { header: 'Gün', key: 'day', width: 10 },
      { header: 'Cihaz', key: 'device', width: 12 },
      { header: 'Vardiya', key: 'shift', width: 10 },
      { header: 'Personel', key: 'personnel', width: 22 },
      { header: 'Başlangıç', key: 'start', width: 10 },
      { header: 'Bitiş', key: 'end', width: 10 },
      { header: 'Durum', key: 'status', width: 10 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    const dayNames = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    let rowNum = 2;

    for (const assignment of data.assignments) {
      const d = new Date(assignment.date);
      const row = ws.getRow(rowNum++);
      row.getCell('date').value = assignment.date;
      row.getCell('day').value = dayNames[d.getDay()];
      row.getCell('device').value = assignment.deviceCode;
      row.getCell('shift').value = this.getShiftLabel(assignment.shiftType);
      row.getCell('personnel').value = assignment.personnelName;
      row.getCell('start').value = assignment.startTime;
      row.getCell('end').value = assignment.endTime;
      row.getCell('status').value = assignment.isConfirmed
        ? 'Onaylı'
        : 'Planlandı';
      row.alignment = { vertical: 'middle' };
    }

    ws.addRow([]);
    const summaryRow = ws.getRow(rowNum + 1);
    summaryRow.getCell(1).value = 'Toplam Atama:';
    summaryRow.getCell(1).font = { bold: true };
    summaryRow.getCell(2).value = data.assignments.length;
    summaryRow.getCell(4).value = 'Boş Slot:';
    summaryRow.getCell(4).font = { bold: true };
    summaryRow.getCell(5).value = data.emptySlots;

    const buf = await workbook.xlsx.writeBuffer();
    return buf;
  }

  async exportPdf(
    unitType: string,
    month: number,
    year: number,
  ): Promise<Buffer> {
    const data = await this.getExportData(unitType, month, year);
    const doc = new PDFDocument({
      layout: 'landscape',
      margin: 30,
      size: 'A4',
    });
    const buffers: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => buffers.push(chunk));

    const dayNames = [
      'Pazar',
      'Pazartesi',
      'Salı',
      'Çarşamba',
      'Perşembe',
      'Cuma',
      'Cumartesi',
    ];
    const monthNames = [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ];

    doc
      .fontSize(16)
      .font('Helvetica-Bold')
      .text(`${data.unitName} - ${monthNames[month - 1]} ${year}`, {
        align: 'center',
      });
    doc.moveDown(0.5);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `Oluşturulma: ${new Date().toLocaleDateString('tr-TR')} | Toplam Atama: ${data.assignments.length} | Boş Slot: ${data.emptySlots}`,
        { align: 'center' },
      );
    doc.moveDown(0.8);

    const tableTop = doc.y;
    const colWidths = [55, 50, 55, 50, 130, 55, 55, 55];
    const headers = [
      'Tarih',
      'Gün',
      'Cihaz',
      'Vardiya',
      'Personel',
      'Başlangıç',
      'Bitiş',
      'Durum',
    ];
    const pageWidth = colWidths.reduce((a, b) => a + b, 0);

    const drawHeader = (y: number) => {
      let x = 30;
      doc.fontSize(8).font('Helvetica-Bold');
      doc.rect(30, y, pageWidth, 16).fill('#3B82F6');
      doc.fill('#FFFFFF');
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], x + 3, y + 4, {
          width: colWidths[i] - 6,
          align: 'center',
        });
        x += colWidths[i];
      }
      return y + 16;
    };

    let currentY = drawHeader(tableTop);

    for (const a of data.assignments) {
      if (currentY > 520) {
        doc.addPage();
        currentY = drawHeader(30);
      }

      const d = new Date(a.date);
      let x = 30;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;

      doc.fontSize(7).font('Helvetica');
      if (isWeekend) {
        doc.rect(30, currentY, pageWidth, 14).fill('#FEF3C7');
      }
      doc.fill('#000000');

      const values = [
        a.date,
        dayNames[d.getDay()],
        a.deviceCode,
        this.getShiftLabel(a.shiftType),
        a.personnelName,
        a.startTime,
        a.endTime,
        a.isConfirmed ? 'Onaylı' : 'Planlandı',
      ];

      for (let i = 0; i < values.length; i++) {
        doc.text(String(values[i]), x + 2, currentY + 3, {
          width: colWidths[i] - 4,
          align: 'center',
        });
        x += colWidths[i];
      }
      currentY += 14;
    }

    doc.end();
    return new Promise((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(buffers)));
    });
  }

  private async getExportData(unitType: string, month: number, year: number) {
    const type = Object.values(UnitType).find((t) => t === unitType);
    const unit = type
      ? await this.prisma.unit.findFirst({ where: { type } })
      : null;
    if (!unit) throw new NotFoundException(`Birim bulunamadı: ${unitType}`);

    const schedule = await this.prisma.schedule.findFirst({
      where: { unitId: unit.id, month, year },
      include: {
        assignments: {
          include: { personnel: true, device: true },
          orderBy: [{ date: 'asc' }, { deviceId: 'asc' }],
        },
      },
    });

    if (!schedule)
      throw new NotFoundException(`${month}/${year} için plan bulunamadı`);

    const devices = await this.unitsService.getDevices(unit.id, true);
    const totalSlots = devices.length * 2 * this.getDaysInMonth(month, year);
    const assignments = schedule.assignments.map((a) => ({
      id: a.id,
      date: a.date,
      shiftType: a.shiftType,
      startTime: a.startTime,
      endTime: a.endTime,
      isConfirmed: a.isConfirmed,
      deviceId: a.deviceId,
      deviceCode: a.device?.code || a.deviceId,
      personnelName: a.personnel?.name || 'Atanmamış',
    }));

    return {
      unitName: unit.name || unitType.toUpperCase(),
      month,
      year,
      assignments,
      emptySlots: Math.max(0, totalSlots - assignments.length),
    };
  }

  private getShiftLabel(type: string): string {
    const map: Record<string, string> = {
      day: 'Gündüz',
      evening: 'Akşam',
      night: 'Gece',
      morning: 'Sabah',
      off: 'İzin (Off)',
      leave: 'Raporlu İzin',
      sick: 'Hasta',
      training: 'Eğitim',
      backup: 'Yedek Süpervizör',
    };
    return map[type] || type;
  }

  private getDaysInMonth(month: number, year: number): number {
    return new Date(year, month, 0).getDate();
  }
}

/**
 * Excel sheet names reject `* ? : \ / [ ]` and cap at 31 characters. The
 * default `${unitName} ${month}/${year}` breaks the former, which made every
 * xlsx export throw a 500.
 */
function toSheetName(raw: string): string {
  return raw.replace(/[*/?:[\]\\]/g, '-').slice(0, 31);
}
