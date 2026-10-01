import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('My Shifts Dashboard (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let techToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    const adminRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    adminToken = adminRes.body.accessToken;

    const techRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'technician@hospital.com', password: 'technician123' })
      .expect(200);
    techToken = techRes.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/schedules/unit/mr/publish')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ month: 5, year: 2026 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/me/shifts should return shifts array', () => {
    return request(app.getHttpServer())
      .get('/api/v1/me/shifts')
      .query({ month: 5, year: 2026 })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('shifts');
        expect(Array.isArray(res.body.shifts)).toBe(true);
        expect(res.body).toHaveProperty('personnel');
        expect(res.body).toHaveProperty('month');
        expect(res.body).toHaveProperty('year');
      });
  });

  it('GET /api/v1/me/summary should return summary object', () => {
    return request(app.getHttpServer())
      .get('/api/v1/me/summary')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('today');
        expect(res.body).toHaveProperty('week');
        expect(res.body).toHaveProperty('upcoming');
        expect(res.body).toHaveProperty('summary');
        expect(res.body.summary).toHaveProperty('totalShifts');
        expect(res.body.summary).toHaveProperty('totalHours');
        expect(res.body.summary).toHaveProperty('nightShifts');
        expect(res.body.summary).toHaveProperty('weekendShifts');
        expect(res.body.summary).toHaveProperty('overtimeHours');
      });
  });

  it('GET /api/v1/me/summary for technician returns valid data', () => {
    return request(app.getHttpServer())
      .get('/api/v1/me/summary')
      .set('Authorization', `Bearer ${techToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('summary');
        expect(typeof res.body.summary.totalShifts).toBe('number');
        expect(typeof res.body.summary.totalHours).toBe('number');
      });
  });

  it('GET /api/v1/me/shifts should fail without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/me/shifts')
      .query({ month: 5, year: 2026 })
      .expect(401);
  });

  it('GET /api/v1/me/summary should fail without auth', () => {
    return request(app.getHttpServer()).get('/api/v1/me/summary').expect(401);
  });
});
