import { INestApplication } from '@nestjs/common';
import { api, createTestApp } from './test-app';

describe('Personnel Smoke (e2e)', () => {
  let app: INestApplication;
  let token: string;
  const createdIds: string[] = [];

  const units = [
    { key: 'mr', label: 'MR' },
    { key: 'bt', label: 'BT' },
    { key: 'rontgen', label: 'Röntgen' },
    { key: 'nukleer', label: 'Nükleer Tıp' },
    { key: 'onkoloji', label: 'RONK' },
  ];

  beforeAll(async () => {
    app = await createTestApp();

    // Login
    const loginRes = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);

    token = loginRes.body.accessToken;
  });

  afterAll(async () => {
    // Cleanup created personnel
    for (const id of createdIds) {
      try {
        await api(app)
          .delete(`/api/v1/personnel/${id}`)
          .set('Authorization', `Bearer ${token}`);
      } catch {
        /* ignore cleanup errors */
      }
    }
    await app.close();
  });

  units.forEach((unit) => {
    it(`should create personnel for ${unit.label} (${unit.key})`, async () => {
      const payload = {
        name: `Smoke Test ${unit.label}`,
        role: 'technician',
        employeeNo: `SMOKE-${unit.key.toUpperCase()}`,
        email: `smoke.${unit.key}@hospital.com`,
        phone: '05000000000',
        organizationId: 'test-org',
        unitId: unit.key,
        specialization: `${unit.label} Görüntüleme`,
        experienceYears: 5,
        deviceSkills: [unit.label],
        nightShiftEligible: true,
        employmentStatus: 'active',
        startDate: '2025-01-01',
        notes: `Smoke test personnel for ${unit.label}`,
        offDays: [0, 6],
        maxWeeklyHours: 40,
        isActive: true,
      };

      console.log(`\n[SMOKE] Creating ${unit.label}...`);
      console.log(`[SMOKE] Payload unitId: ${payload.unitId}`);

      const res = await api(app)
        .post('/api/v1/personnel')
        .set('Authorization', `Bearer ${token}`)
        .send(payload)
        .expect(201);

      console.log(`[SMOKE] Response status: ${res.status}`);
      console.log(`[SMOKE] Response body id: ${res.body.id}`);
      console.log(
        `[SMOKE] Response body unitId: ${res.body.unit?.id || res.body.unitId}`,
      );

      // Verify all persisted fields
      expect(res.body).toHaveProperty('id');
      expect(res.body.name).toBe(payload.name);
      expect(res.body.role).toBe(payload.role);
      expect(res.body.employeeNo).toBe(payload.employeeNo);
      expect(res.body.email).toBe(payload.email);
      expect(res.body.specialization).toBe(payload.specialization);
      expect(res.body.experienceYears).toBe(payload.experienceYears);
      expect(res.body.employmentStatus).toBe(payload.employmentStatus);
      expect(res.body.nightShiftEligible).toBe(true);
      expect(res.body.offDays).toEqual([0, 6]);
      expect(res.body.maxWeeklyHours).toBe(40);
      expect(res.body.unitId).toBeTruthy();
      // Verify the unit resolved correctly (onkoloji maps to RONK in seed data)
      const expectedCode =
        unit.key === 'onkoloji' ? 'RONK' : unit.key.toUpperCase();
      expect(res.body.unit?.code || 'MISSING').toBe(expectedCode);
      if (res.body.id) createdIds.push(res.body.id);

      // Verify it appears in list
      const listRes = await api(app)
        .get('/api/v1/personnel')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const found = listRes.body.find((p: any) => p.id === res.body.id);
      expect(found).toBeTruthy();
      expect(found.role).toBe(payload.role);
      console.log(`[SMOKE] ✓ ${unit.label} created and verified in list`);
    });
  });
});
