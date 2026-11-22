import { defineConfig, devices } from '@playwright/test';

/**
 * Browser acceptance gate.
 *
 * Every server here is the REAL one: the compiled Nest API and the Angular dev
 * server (which proxies /api to :3000 exactly like the deployed nginx setup).
 * Nothing is mocked, and `reuseExistingServer` is only enabled outside CI so a
 * developer can keep a running stack — CI always starts its own.
 *
 * The dev server binds to localhost (IPv6 ::1 on this host), so the default
 * baseURL is `http://localhost:4200` rather than an explicit 127.0.0.1.
 */
const FRONTEND_PORT = Number(process.env.E2E_FRONTEND_PORT ?? 4200);
const BACKEND_PORT = Number(process.env.E2E_BACKEND_PORT ?? 3000);
const FRONTEND_URL = process.env.E2E_BASE_URL ?? `http://localhost:${FRONTEND_PORT}`;
const BACKEND_URL = process.env.E2E_API_URL ?? `http://127.0.0.1:${BACKEND_PORT}`;
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.ts/,
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // One worker on purpose: the specs drive a single seeded database and the
  // login endpoint is rate limited per IP, so parallel browsers would make the
  // outcome depend on scheduling.
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  globalSetup: require.resolve('./fixtures/global-setup'),
  globalTeardown: require.resolve('./fixtures/global-teardown'),
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: FRONTEND_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'node dist/src/main.js',
      cwd: '../backend',
      url: `${BACKEND_URL}/api/v1/auth/csrf-token`,
      reuseExistingServer: !isCI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `npx ng serve --port ${FRONTEND_PORT} --proxy-config proxy.conf.json`,
      cwd: '../frontend',
      url: `${FRONTEND_URL}/login`,
      reuseExistingServer: !isCI,
      timeout: 300_000,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
});
