import { request, type APIRequestContext } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  ensureBrowserUsers,
  ensurePlanSchedule,
  ensureAuditPersonnel,
  ADMIN,
} from './browser-fixtures';

type Account = { key: string; email: string; password: string; file?: string };

/**
 * Produces one Playwright storage state per fixture account by logging in through
 * the REAL API â€” the same endpoints and CSRF handshake the browser uses.
 *
 * If a login fails the setup throws, so the suite can never start "green" with
 * fixtures that are not actually usable.
 */
const stateDir = 'fixtures/.auth';

async function loginAndSave(
  request: APIRequestContext,
  baseURL: string,
  account: Account,
  outputFile: string,
) {
  const csrf = await request.get('/api/v1/auth/csrf-token');
  if (!csrf.ok()) {
    throw new Error(`CSRF handshake failed for ${account.email}: HTTP ${csrf.status()}`);
  }
  // The context keeps the cookie jar, so the token is read from there; the
  // context also replays the cookie on the login POST on its own.
  const stored = (await request.storageState()).cookies.find((c) => c.name === 'csrf-token');
  const csrfToken = stored?.value;
  if (!csrfToken) {
    throw new Error(`No csrf-token cookie was issued for ${account.email}`);
  }

  const login = await request.post('/api/v1/auth/login', {
    data: { email: account.email, password: account.password },
    headers: { 'x-csrf-token': csrfToken },
  });
  if (!login.ok()) {
    throw new Error(`Login failed for ${account.email}: HTTP ${login.status()} ${await login.text()}`);
  }

  const body = await login.json();
  if (!body?.accessToken || !body?.refreshToken) {
    throw new Error(`Login response for ${account.email} carried no token pair`);
  }

  await writeFile(
    outputFile,
    JSON.stringify(
      {
        cookies: await request.storageState().then((s) => s.cookies),
        origins: [
          {
            origin: new URL(baseURL).origin,
            // The Angular client keeps the session here, so a stored state has to
            // carry it for the app to consider the session alive.
            localStorage: [
              { name: 'accessToken', value: body.accessToken },
              { name: 'refreshToken', value: body.refreshToken },
              { name: 'user', value: JSON.stringify(body.user) },
            ],
          },
        ],
      },
      null,
      2,
    ),
    'utf8',
  );
  return body.user;
}

export default async function globalSetup(config: { baseURL?: string }): Promise<void> {
  const baseURL = process.env.E2E_BASE_URL ?? config.baseURL ?? 'http://localhost:4200';
  const { users } = await ensureBrowserUsers();
  await ensurePlanSchedule();
  await ensureAuditPersonnel();

  await mkdir(stateDir, { recursive: true });

  const api = await request.newContext({ baseURL });

  const accounts = [
    ...users.map((u) => ({ ...u, file: `${stateDir}/${u.key}.json` })),
    { ...ADMIN, file: `${stateDir}/admin.json` },
  ];

  for (const account of accounts) {
    const user = await loginAndSave(api, baseURL, account, account.file);
    process.stdout.write(
      `browser fixture ready: ${account.email} (${user.role}, tenant ${user.organizationId ?? 'cross-tenant'})\n`,
    );
  }

  await api.dispose();
}
