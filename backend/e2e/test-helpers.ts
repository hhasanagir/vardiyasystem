import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '../src/app.module';

const ipByApp = new WeakMap<INestApplication, string>();

let appCounter = 0;

/**
 * Builds the Nest app exactly like production main.ts (global prefix, strict
 * ValidationPipe, and — crucially — the cookie-parser middleware that the CSRF
 * double-submit guard depends on). E2E apps built without cookieParser cannot
 * see Set-Cookie values, so every state-changing call would be rejected 403.
 *
 * main.ts also enables `trust proxy`. CI shares throttler state through Redis,
 * so without it every app keys on 127.0.0.1 and a suite of logins exhausts the
 * login bucket. Mirroring main.ts plus a per-app X-Forwarded-For gives each app
 * its own bucket. The 10.1.x range is deliberately distinct from test-app.ts
 * (10.0.x) so the two helper modules cannot collide.
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api/v1');
  const trustLevel = Number(process.env.TRUST_PROXY_LEVEL ?? 1);
  app.getHttpAdapter().getInstance().set('trust proxy', trustLevel);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.use(cookieParser());
  await app.init();

  appCounter += 1;
  ipByApp.set(app, `10.1.${appCounter}.1`);
  return app;
}

function clientIp(app: INestApplication): string {
  const ip = ipByApp.get(app);
  if (!ip) {
    throw new Error('test-helpers require an app built by createTestApp()');
  }
  return ip;
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
  const ip = clientIp(app);

  const csrfRes = await request(server)
    .get('/api/v1/auth/csrf-token')
    .set('X-Forwarded-For', ip);
  const setCookies = (csrfRes.headers['set-cookie'] ?? []) as string[];
  const csrfCookie = setCookies.find((c) => c.startsWith('csrf-token='));
  const csrfToken = csrfCookie?.split(';')[0].split('=')[1] ?? '';
  if (!csrfToken) {
    throw new Error('CSRF token cookie was not issued by /auth/csrf-token');
  }

  const loginRes = await request(server)
    .post('/api/v1/auth/login')
    .set('X-Forwarded-For', ip)
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
  const allHeaders = { 'X-Forwarded-For': clientIp(app), ...headers };
  for (const method of METHODS) {
    client[method] = (url: string) => request(app.getHttpServer())[method](url).set(allHeaders);
  }
  return client;
}

export function mustNotBeReusable(app: INestApplication, refreshToken: string): request.Test {
  return request(app.getHttpServer())
    .post('/api/v1/auth/refresh')
    .set('X-Forwarded-For', clientIp(app))
    .send({ refreshToken: refreshToken as never });
}

export const ADMIN_DEMO = { email: 'admin@hospital.com', password: 'admin123' };
export const SUPERVISOR_DEMO = { email: 'aziz.demir@hospital.com', password: '123456' };
export const PERSONNEL_PASSWORD = '123456';