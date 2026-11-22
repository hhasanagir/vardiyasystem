/**
 * CSV rendering for the reports page.
 *
 * Kept free of Angular and PrimeNG so the exported file can be asserted on
 * directly: the download button promises a file, and a pure builder is what
 * makes that promise testable.
 */

/** The daily cells the report exports, matching the rows on screen. */
export interface DailyReportRow {
  date: string;
  dayName: string;
  totalShifts: number;
  filledShifts: number;
  emptyShifts: number;
  coveragePercent: number;
  mrFilled: number;
  mrEmpty: number;
  btFilled: number;
  btEmpty: number;
}

export interface ReportTotals {
  totalShifts: number;
  filledShifts: number;
  emptyShifts: number;
  coverage: number;
}

const HEADERS = [
  'Tarih',
  'Gün',
  'Toplam Vardiya',
  'Dolu',
  'Boş',
  'Kapsam (%)',
  'MR Dolu',
  'MR Boş',
  'BT Dolu',
  'BT Boş',
];

function quote(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

/**
 * Builds the daily shift report as CSV. The BOM keeps Excel from rendering the
 * Turkish characters as mojibake, and the totals row keeps the file readable on
 * its own.
 */
export function buildDailyReportCsv(rows: DailyReportRow[], totals: ReportTotals): string {
  const lines: string[] = [HEADERS.join(',')];

  for (const row of rows) {
    lines.push(
      [
        quote(row.date),
        quote(row.dayName),
        row.totalShifts,
        row.filledShifts,
        row.emptyShifts,
        row.coveragePercent,
        row.mrFilled,
        row.mrEmpty,
        row.btFilled,
        row.btEmpty,
      ].join(','),
    );
  }

  lines.push(
    [
      quote('TOPLAM'),
      '',
      totals.totalShifts,
      totals.filledShifts,
      totals.emptyShifts,
      totals.coverage,
      '',
      '',
      '',
      '',
    ].join(','),
  );

  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

/** File name for a report of the given `YYYY-MM` month. */
export function reportsCsvFileName(monthKey: string): string {
  return `vardiya_raporu_${monthKey}.csv`;
}
