import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

/**
 * Builds the Nest app exactly like production main.ts (global prefix, strict
 * ValidationPipe, and — crucially — the cookie-parser middleware that the CSRF
 * double-submit guard depends on). E2E apps built without cookieParser cannot
 * see Set-Cookie values, so every state-changing call would be rejected 403.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.use(cookieParser());
  await app.init();
  return app;
}

export interface AuthCtx {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  cookieHeader: string;
  user: { id: string; email: string; role: string; organizationId: string | null; unitId: string | null };
}

/**
 * Mirrors the real Angular client: obtain the double-submit CSRF cookie via the
 * dedicated endpoint, then authenticate. All subsequent state-changing requests
 * must carry both the cookie and the matching x-csrf-token header.
 */
export async function loginAndGetCsrf(
  app: INestApplication,
  email: string,
  password: string,
): Promise<AuthCtx> {
  const server = app.getHttpServer();

  const csrfRes = await request(server).get('/api/v1/auth/csrf-token');
  const setCookies = (csrfRes.headers['set-cookie'] ?? []) as string[];
  const csrfCookie = setCookies.find((c) => c.startsWith('csrf-token='));
  const csrfToken = csrfCookie?.split(';')[0].split('=')[1] ?? '';
  if (!csrfToken) {
    throw new Error('CSRF token cookie was not issued by /auth/csrf-token');
  }

  const loginRes = await request(server)
    .post('/api/v1/auth/login')
    .send({ email, password })
    .expect(200);

  return {
    accessToken: loginRes.body.accessToken as string,
    refreshToken: loginRes.body.refreshToken as string,
    csrfToken,
    cookieHeader: `csrf-token=${csrfToken}`,
    user: loginRes.body.user as AuthCtx['user'],
  };
}

export type HttpMethods = 'get' | 'post' | 'put' | 'patch' | 'delete';
export type HttpClient = Record<HttpMethods, (url: string) => request.Test>;

const METHODS: HttpMethods[] = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * SuperTest client pre-configured with the Authorization bearer, the CSRF
 * double-submit cookie and the x-csrf-token header (like the production UI).
 * supertest's root object only exposes verbs (no header setters), so the
 * headers are applied per request right after the verb.
 */
export function authed(app: INestApplication, ctx: AuthCtx): HttpClient {
  const headers = {
    Authorization: `Bearer ${ctx.accessToken}`,
    'x-csrf-token': ctx.csrfToken,
    Cookie: ctx.cookieHeader,
  };
  return buildClient(app, headers);
}

/** CSRF-free client for asserting the defense-in-depth negative. */
export function rawRequest(app: INestApplication, ctx: AuthCtx): HttpClient {
  return buildClient(app, { Authorization: `Bearer ${ctx.accessToken}` });
}

function buildClient(app: INestApplication, headers: Record<string, string>): HttpClient {
  const client = {} as HttpClient;
  for (const method of METHODS) {
    client[method] = (url: string) => request(app.getHttpServer())[method](url).set(headers);
  }
  return client;
}

export function mustNotBeReusable(app: INestApplication, refreshToken: string): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/auth/refresh')
    .send({ refreshToken: refreshToken as never });
}

export const ADMIN_DEMO = { email: 'admin@hospital.com', password: 'admin123' };
export const SUPERVISOR_DEMO = { email: 'aziz.demir@hospital.com', password: '123456' };
export const PERSONNEL_PASSWORD = '123456';