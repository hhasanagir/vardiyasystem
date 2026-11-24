import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';
import { createTestApp, loginAndGetCsrf, authed, AuthCtx, ADMIN_DEMO } from './test-helpers';

const PREFIX = 'p3ex';
const UNIT_CODE = 'P3EX-BT';
const DEVICE_CODE = 'P3EX-CT1';

const XLSX_MAGIC = Buffer.from([0x50, 0x4b]); // "PK" - zip container
const PDF_MAGIC = '%PDF-';

/**
 * supertest only buffers octet-stream responses; xlsx/pdf arrive with other
 * content types, so the raw bytes are collected explicitly before asserting the
 * file signature.
 */
function binaryParser(
  res: request.Response,
  callback: (err: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

/**
 * Schedule Export (e2e): the exporter must build a real workbook/document from
 * the persisted schedule of the requested unit, and it must fail loudly (404)
 * when there is nothing to export.
 */
describe('Schedule Export (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let admin: AuthCtx;
  let unitId: string;
  let scheduleId: string;

  const year = new Date().getFullYear() + 12;
  const month = ((new Date().getMonth() + 1) % 12) || 12;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);

    const units = await prisma.unit.findMany({ select: { id: true, organizationId: true }, take: 1 });
    const orgId = units[0].organizationId;

    const unit = await prisma.unit.create({
      data: { code: UNIT_CODE, name: 'P3 Export BT', type: 'bt', organizationId: orgId },
    });
    unitId = unit.id;

    const device = await prisma.device.create({
      data: {
        code: DEVICE_CODE,
        name: 'P3 Export CT',
        unitId,
        organizationId: orgId,
        workDays: [0, 1, 2, 3, 4, 5, 6],
        requiredSkills: [],
        isActive: true,
      } as never,
    });

    const personnel = await prisma.personnel.create({
      data: {
        name: 'P3 Export Technician',
        role: 'technician',
        employeeNo: `${PREFIX}-1`,
        email: `${PREFIX}.tech@fake.local`,
        unitId,
        organizationId: orgId,
        offDays: [],
        isActive: true,
      },
    });

    const schedule = await authed(app, admin)
      .post('/api/v1/schedules')
      .send({ unitId, month, year })
      .expect(201);
    scheduleId = schedule.body.id as string;

    const assignment = await authed(app, admin)
      .post(`/api/v1/schedules/${scheduleId}/assignments`)
      .send({
        personnelId: personnel.id,
        deviceId: device.id,
        kind: 'device',
        date: `${year}-${String(month).padStart(2, '0')}-15`,
        shiftType: 'day',
        startTime: '08:00',
        endTime: '16:00',
      });
    expect(assignment.status).toBe(201);
  }, 180000);

  afterAll(async () => {
    const problems: string[] = [];
    const step = async (label: string, run: () => Promise<unknown>): Promise<void> => {
      try {
        await run();
      } catch (error) {
        problems.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
      }
    };

    await step('assignments', () => prisma.assignment.deleteMany({ where: { scheduleId } }));
    await step('schedules', () => prisma.schedule.deleteMany({ where: { id: scheduleId } }));
    await step('shift templates', () => prisma.personShiftTemplate.deleteMany({ where: { unitId } }));
    await step('areas', () => prisma.area.deleteMany({ where: { unitId } }));
    await step('device incidents', () => prisma.deviceIncident.deleteMany({ where: { unitId } }));
    await step('handover notes', () => prisma.handoverNote.deleteMany({ where: { unitId } }));
    await step('devices', () => prisma.device.deleteMany({ where: { unitId } }));
    await step('personnel', () => prisma.personnel.deleteMany({ where: { email: `${PREFIX}.tech@fake.local` } }));
    await step('unit', () => prisma.unit.deleteMany({ where: { code: UNIT_CODE } }));

    const remaining = {
      units: await prisma.unit.count({ where: { code: UNIT_CODE } }),
      devices: await prisma.device.count({ where: { code: DEVICE_CODE } }),
      personnel: await prisma.personnel.count({ where: { email: `${PREFIX}.tech@fake.local` } }),
    };
    expect(problems).toEqual([]);
    expect(remaining).toEqual({ units: 0, devices: 0, personnel: 0 });
    await app.close();
  });

  it('GET /api/v1/schedules/export/excel returns a real xlsx attachment', async () => {
    const res = await authed(app, admin)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: unitId, month, year })
      .expect(200)
      .parse(binaryParser);

    expect(String(res.headers['content-type'])).toContain('spreadsheetml');
    expect(String(res.headers['content-disposition'])).toContain('attachment');
    expect(String(res.headers['content-disposition'])).toContain(`vardiya_plani_${unitId}_${month}_${year}.xlsx`);
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.byteLength).toBeGreaterThan(0);
    expect(body.subarray(0, 2).equals(XLSX_MAGIC)).toBe(true);
  });

  it('GET /api/v1/schedules/export/pdf returns a real pdf attachment', async () => {
    const res = await authed(app, admin)
      .get('/api/v1/schedules/export/pdf')
      .query({ unit: unitId, month, year })
      .expect(200)
      .parse(binaryParser);

    expect(String(res.headers['content-type'])).toContain('pdf');
    expect(String(res.headers['content-disposition'])).toContain('attachment');
    const body = res.body as Buffer;
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body.byteLength).toBeGreaterThan(0);
    expect(body.subarray(0, PDF_MAGIC.length).toString('ascii')).toBe(PDF_MAGIC);
  });

  it('excel and pdf differ in container format (no shared canned payload)', async () => {
    const [xlsx, pdf] = await Promise.all([
      authed(app, admin).get('/api/v1/schedules/export/excel').query({ unit: unitId, month, year }).expect(200).parse(binaryParser),
      authed(app, admin).get('/api/v1/schedules/export/pdf').query({ unit: unitId, month, year }).expect(200).parse(binaryParser),
    ]);
    const xlsxBody = xlsx.body as Buffer;
    const pdfBody = pdf.body as Buffer;
    expect(xlsxBody.byteLength).not.toBe(pdfBody.byteLength);
    expect(xlsxBody.subarray(0, 2).equals(XLSX_MAGIC)).toBe(true);
    expect(pdfBody.subarray(0, PDF_MAGIC.length).toString('ascii')).toBe(PDF_MAGIC);
  });

  it('exporting a month without a schedule is rejected (404)', async () => {
    await authed(app, admin)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: unitId, month, year: year + 5 })
      .expect(404);
  });

  it('exporting an unknown unit is rejected (404)', async () => {
    await authed(app, admin)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: '00000000-0000-0000-0000-000000000000', month, year })
      .expect(404);
    await authed(app, admin)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'not-a-unit-type', month, year })
      .expect(404);
  });

  it('export fails without auth (401)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/excel')
      .query({ unit: unitId, month, year })
      .expect(401);
  });
});
