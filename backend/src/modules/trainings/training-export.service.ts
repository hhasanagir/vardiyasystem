import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
const PDFDocument = require('pdfkit');

@Injectable()
export class TrainingExportService {
  async exportExcel(data: any[]): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'VardiyaOS';
    const ws = workbook.addWorksheet('Sertifikalar');

    ws.columns = [
      { header: 'Eğitim Adı', key: 'name', width: 30 },
      { header: 'Sağlayıcı', key: 'provider', width: 25 },
      { header: 'Kategori', key: 'category', width: 15 },
      { header: 'Personel', key: 'personnel', width: 25 },
      { header: 'Düzenleme Tarihi', key: 'issueDate', width: 16 },
      { header: 'Sona Erme Tarihi', key: 'expiryDate', width: 16 },
      { header: 'Durum', key: 'status', width: 12 },
    ];

    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF3B82F6' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.height = 24;

    let rowNum = 2;
    for (const training of data) {
      const assignments = training.personnelTrainings || [];
      if (assignments.length === 0) {
        const row = ws.getRow(rowNum++);
        row.getCell('name').value = training.name;
        row.getCell('provider').value = training.provider || '';
        row.getCell('category').value = training.category;
        row.getCell('personnel').value = '-';
        row.getCell('issueDate').value = '';
        row.getCell('expiryDate').value = '';
        row.getCell('status').value = '-';
      } else {
        for (const pt of assignments) {
          const row = ws.getRow(rowNum++);
          row.getCell('name').value = training.name;
          row.getCell('provider').value = training.provider || '';
          row.getCell('category').value = training.category;
          row.getCell('personnel').value = pt.personnel?.name || '-';
          row.getCell('issueDate').value = pt.issueDate
            ? new Date(pt.issueDate).toLocaleDateString('tr-TR')
            : '';
          row.getCell('expiryDate').value = pt.expiryDate
            ? new Date(pt.expiryDate).toLocaleDateString('tr-TR')
            : '';
          row.getCell('status').value = this.getStatusLabel(pt.status);
          const statusCell = row.getCell('status');
          if (pt.status === 'expired') {
            statusCell.font = { color: { argb: 'FFEF4444' } };
          } else if (pt.status === 'expiring') {
            statusCell.font = { color: { argb: 'FFF59E0B' } };
          } else {
            statusCell.font = { color: { argb: 'FF22C55E' } };
          }
        }
      }
    }

    const buf = await workbook.xlsx.writeBuffer();
    return buf;
  }

  async exportPdf(data: any[]): Promise<Buffer> {
    return new Promise((resolve) => {
      const doc = new PDFDocument({
        layout: 'landscape',
        margin: 20,
        size: 'A4',
      });
      const buffers: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      doc
        .fontSize(16)
        .font('Helvetica-Bold')
        .text('Sertifika Raporu', { align: 'center' });
      doc.moveDown(0.5);
      doc
        .fontSize(8)
        .font('Helvetica')
        .text(`Oluşturulma: ${new Date().toLocaleDateString('tr-TR')}`, {
          align: 'right',
        });
      doc.moveDown(1);

      const tableTop = doc.y;
      const colWidths = [120, 100, 60, 100, 70, 70, 60];
      const headers = [
        'Eğitim Adı',
        'Sağlayıcı',
        'Kategori',
        'Personel',
        'Düzenleme',
        'Sona Erme',
        'Durum',
      ];
      let y = tableTop;

      const drawHeader = () => {
        let x = 20;
        doc.fontSize(8).font('Helvetica-Bold');
        doc
          .rect(
            20,
            y,
            colWidths.reduce((a, b) => a + b, 0),
            18,
          )
          .fill('#3b82f6');
        doc.fill('#ffffff');
        for (let i = 0; i < headers.length; i++) {
          doc.text(headers[i], x + 3, y + 5, {
            width: colWidths[i],
            align: 'left',
          });
          x += colWidths[i];
        }
        y += 18;
      };

      drawHeader();

      doc.fontSize(7).font('Helvetica');
      for (const training of data) {
        const assignments = training.personnelTrainings || [];
        if (assignments.length === 0) {
          if (y > 560) {
            doc.addPage();
            y = 40;
            drawHeader();
          }
          let x = 20;
          doc.fill('#ffffff');
          doc
            .rect(
              20,
              y,
              colWidths.reduce((a, b) => a + b, 0),
              16,
            )
            .fill('#f8fafc');
          doc.fill('#1e293b');
          doc.text(training.name, x + 3, y + 4, { width: colWidths[0] });
          x += colWidths[0];
          doc.text(training.provider || '', x + 3, y + 4, {
            width: colWidths[1],
          });
          x += colWidths[1];
          doc.text(training.category, x + 3, y + 4, { width: colWidths[2] });
          x += colWidths[2];
          doc.text('-', x + 3, y + 4, { width: colWidths[3] });
          x += colWidths[3];
          doc.text('', x + 3, y + 4, { width: colWidths[4] });
          x += colWidths[4];
          doc.text('', x + 3, y + 4, { width: colWidths[5] });
          x += colWidths[5];
          doc.text('-', x + 3, y + 4, { width: colWidths[6] });
          y += 16;
        } else {
          for (const pt of assignments) {
            if (y > 560) {
              doc.addPage();
              y = 40;
              drawHeader();
            }
            let x = 20;
            const bgColor =
              pt.status === 'expired'
                ? '#fef2f2'
                : pt.status === 'expiring'
                  ? '#fffbeb'
                  : '#f0fdf4';
            doc
              .rect(
                20,
                y,
                colWidths.reduce((a, b) => a + b, 0),
                16,
              )
              .fill(bgColor);
            doc.fill('#1e293b');
            doc.text(training.name, x + 3, y + 4, { width: colWidths[0] });
            x += colWidths[0];
            doc.text(training.provider || '', x + 3, y + 4, {
              width: colWidths[1],
            });
            x += colWidths[1];
            doc.text(training.category, x + 3, y + 4, { width: colWidths[2] });
            x += colWidths[2];
            doc.text(pt.personnel?.name || '-', x + 3, y + 4, {
              width: colWidths[3],
            });
            x += colWidths[3];
            doc.text(
              pt.issueDate
                ? new Date(pt.issueDate).toLocaleDateString('tr-TR')
                : '',
              x + 3,
              y + 4,
              { width: colWidths[4] },
            );
            x += colWidths[4];
            doc.text(
              pt.expiryDate
                ? new Date(pt.expiryDate).toLocaleDateString('tr-TR')
                : '',
              x + 3,
              y + 4,
              { width: colWidths[5] },
            );
            x += colWidths[5];
            const statusColor =
              pt.status === 'expired'
                ? '#ef4444'
                : pt.status === 'expiring'
                  ? '#f59e0b'
                  : '#22c55e';
            doc.fill(statusColor);
            doc.text(this.getStatusLabel(pt.status), x + 3, y + 4, {
              width: colWidths[6],
            });
            doc.fill('#1e293b');
            y += 16;
          }
        }
      }

      doc.end();
    });
  }

  private getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      valid: 'Geçerli',
      expiring: 'Sona Eriyor',
      expired: 'Süresi Doldu',
    };
    return map[status] || status;
  }
}
