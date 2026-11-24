import { INestApplication } from '@nestjs/common';
import { createTestApp, loginAndGetCsrf, authed, AuthCtx, ADMIN_DEMO } from './test-helpers';

interface UnitRow {
  id: string;
  code: string;
  organizationId: string | null;
}

interface PersonnelRow {
  id: string;
  name: string;
  role: string;
  employeeNo: string | null;
  email: string | null;
  specialization: string | null;
  experienceYears: number;
  employmentStatus: string;
  nightShiftEligible: boolean;
  offDays: number[];
  maxWeeklyHours: number;
  unitId: string;
  unit?: { code: string };
}

describe('Personnel Smoke (e2e)', () => {
  let app: INestApplication;
  let admin: AuthCtx;
  const createdIds: string[] = [];

  const units = ['MR', 'BT', 'RONTGEN', 'NUKLEER', 'RONK'];

  beforeAll(async () => {
    app = await createTestApp();
    admin = await loginAndGetCsrf(app, ADMIN_DEMO.email, ADMIN_DEMO.password);
  }, 120000);

  afterAll(async () => {
    for (const id of createdIds) {
      const res = await authed(app, admin).delete(`/api/v1/personnel/${id}`);
      // Cleanup must be explicit: 204 or 404 are both acceptable, anything else
      // (5xx) means the delete path itself is broken and must not be ignored.
      expect([200, 204, 404]).toContain(res.status);
    }
    await app.close();
  });

  async function unitsByCode(): Promise<Map<string, UnitRow>> {
    const res = await authed(app, admin).get('/api/v1/units').expect(200);
    const rows = res.body as UnitRow[];
    return new Map(rows.map((u) => [u.code.toUpperCase(), u]));
  }

  units.forEach((code) => {
    it(`should create personnel for ${code} and verify persistence`, async () => {
      const byCode = await unitsByCode();
      const unit = byCode.get(code);
      expect(unit, `seed unit ${code} is missing`).toBeTruthy();

      const payload = {
        name: `Smoke Test ${code}`,
        role: 'technician',
        employeeNo: `SMOKE-${code}`,
        email: `smoke.${code.toLowerCase()}@hospital.com`,
        phone: '05000000000',
        organizationId: unit!.organizationId,
        unitId: unit!.id,
        specialization: `${code} Görüntüleme`,
        experienceYears: 5,
        deviceSkills: [code],
        nightShiftEligible: true,
        employmentStatus: 'active',
        startDate: '2025-01-01',
        notes: `Smoke test personnel for ${code}`,
        offDays: [0, 6],
        maxWeeklyHours: 40,
        isActive: true,
      };

      const res = await authed(app, admin)
        .post('/api/v1/personnel')
        .send(payload)
        .expect(201);

      const created = res.body as PersonnelRow;
      expect(created).toHaveProperty('id');
      expect(created.name).toBe(payload.name);
      expect(created.role).toBe(payload.role);
      expect(created.employeeNo).toBe(payload.employeeNo);
      expect(created.email).toBe(payload.email);
      expect(created.specialization).toBe(payload.specialization);
      expect(created.experienceYears).toBe(payload.experienceYears);
      expect(created.employmentStatus).toBe(payload.employmentStatus);
      expect(created.nightShiftEligible).toBe(true);
      expect(created.offDays).toEqual([0, 6]);
      expect(created.maxWeeklyHours).toBe(40);
      expect(created.unitId).toBe(unit!.id);
      expect(created.unit?.code ?? code).toBe(code);
      createdIds.push(created.id);

      const listRes = await authed(app, admin).get('/api/v1/personnel').expect(200);
      const rows = listRes.body as PersonnelRow[];
      const found = rows.find((p) => p.id === created.id);
      expect(found).toBeTruthy();
      expect(found?.role).toBe(payload.role);
      expect(found?.unitId).toBe(unit!.id);
    });
  });
});
