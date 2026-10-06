import { INestApplication } from '@nestjs/common';
import type { Response } from 'express';
import { api, createTestApp } from './test-app';

function intoBuffer(
  res: Response,
  callback: (err: Error | null, body?: Buffer) => void,
) {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

describe('Schedule Export (e2e)', () => {
  let app: INestApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp();

    const res = await api(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@hospital.com', password: 'admin123' })
      .expect(200);
    token = res.body.accessToken;

    await api(app)
      .post('/api/v1/schedules/unit/mr/publish')
      .set('Authorization', `Bearer ${token}`)
      .send({ month: 5, year: 2026 })
      .expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/schedules/export/excel should return xlsx file', () => {
    return api(app)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'mr', month: 5, year: 2026 })
      .set('Authorization', `Bearer ${token}`)
      .buffer()
      .parse(intoBuffer)
      .expect(200)
      .expect((res) => {
        expect(res.headers['content-type']).toContain('spreadsheetml');
        expect(res.headers['content-disposition']).toContain('attachment');
        expect(res.body).toBeInstanceOf(Buffer);
      });
  });

  it('GET /api/v1/schedules/export/pdf should return pdf file', () => {
    return api(app)
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
    return api(app)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'mr', month: 5, year: 2026 })
      .expect(401);
  });

  it('GET /api/v1/schedules/export/excel should fail for nonexistent unit', () => {
    return api(app)
      .get('/api/v1/schedules/export/excel')
      .query({ unit: 'nonexistent', month: 5, year: 2026 })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('GET /api/v1/schedules/export/pdf should fail for nonexistent schedule', () => {
    return api(app)
      .get('/api/v1/schedules/export/pdf')
      .query({ unit: 'mr', month: 1, year: 2020 })
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
