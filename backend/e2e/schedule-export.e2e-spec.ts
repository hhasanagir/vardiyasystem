import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Schedule Export (e2e)', () => {
  let app: INestApplication;
  let token: string;

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

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    token = res.body.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/schedules/unit/mr/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 5, year: 2026 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/schedules/export/excel should return xlsx file', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'mr', month: 5, year: 2026 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.headers['content-type']).toContain('spreadsheetml');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.body).toBeInstanceOf(Buffer);
      });
  });

  it('GET /api/v1/schedules/export/pdf should return pdf file', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/pdf')
      .query({ unit: 'mr', month: 5, year: 2026 })
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect((res) => {
        expect(res.headers['content-type']).toContain('pdf');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.body).toBeInstanceOf(Buffer);
      });
  });

  it('GET /api/v1/schedules/export/excel should fail without auth', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'mr', month: 5, year: 2026 })
      .expect(401);
  });

  it('GET /api/v1/schedules/export/excel should fail for nonexistent unit', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'nonexistent', month: 5, year: 2026 })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /api/v1/schedules/export/pdf should fail for nonexistent schedule', () => {
    return request(app.getHttpServer())
      .get('/api/v1/schedules/export/pdf')
      .query({ unit: 'mr', month: 1, year: 2020 })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
