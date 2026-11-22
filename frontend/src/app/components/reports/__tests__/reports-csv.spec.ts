import { describe, it, expect } from 'vitest';
import { buildDailyReportCsv, reportsCsvFileName, type DailyReportRow } from '../reports-csv';

const ROW: DailyReportRow = {
  date: '2026-10-15',
  dayName: 'Per',
  dayNum: 15,
  totalShifts: 8,
  filledShifts: 6,
  emptyShifts: 2,
  coveragePercent: 75,
  mrFilled: 4,
  mrEmpty: 1,
  btFilled: 2,
  btEmpty: 1,
} as DailyReportRow;

const TOTALS = { totalShifts: 20, filledShifts: 15, emptyShifts: 5, coverage: 75 };

describe('buildDailyReportCsv', () => {
  it('starts with a BOM so Excel reads the Turkish characters correctly', () => {
    const csv = buildDailyReportCsv([ROW], TOTALS);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('writes a header row and one line per day', () => {
    const csv = buildDailyReportCsv([ROW, { ...ROW, date: '2026-10-16', dayName: 'Cum' }], TOTALS);
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe(
      'Tarih,Gün,Toplam Vardiya,Dolu,Boş,Kapsam (%),MR Dolu,MR Boş,BT Dolu,BT Boş'
    );
    expect(lines).toHaveLength(4); // header + 2 days + totals
  });

  it('emits the day cells in order', () => {
    const csv = buildDailyReportCsv([ROW], TOTALS);
    expect(csv).toContain('"2026-10-15","Per",8,6,2,75,4,1,2,1');
  });

  it('escapes embedded quotes and quotes every text field', () => {
    const csv = buildDailyReportCsv([{ ...ROW, dayName: 'Per "Gün"' }], TOTALS);
    expect(csv).toContain('"Per ""Gün"""');
  });

  it('appends a totals row so the file is self-describing', () => {
    const csv = buildDailyReportCsv([ROW], TOTALS);
    expect(csv.trim().endsWith('"TOPLAM",,20,15,5,75,,,,')).toBe(true);
  });

  it('still produces a header and totals for a month with no days', () => {
    const csv = buildDailyReportCsv([], TOTALS);
    const lines = csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain('"TOPLAM"');
  });
});

describe('reportsCsvFileName', () => {
  it('names the file after the reported month', () => {
    expect(reportsCsvFileName('2026-10')).toBe('vardiya_raporu_2026-10.csv');
  });
});
