import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@hospital.com";
export const ADMIN_PASSWORD = "admin123";

// POST /api/v1/auth/login is throttled to 10 requests per rolling minute and a
// 429 never redirects to /app, so the suite used to lose roughly every 10th
// test to a waitForURL timeout. Every login attempt in the suite (valid or
// invalid, helper-driven or inline) must pass through reserveLoginSlot so the
// requests stay spaced inside the window; login() additionally backs off a
// full window when a 429 still slips through.
const MIN_LOGIN_INTERVAL_MS = 7000;
const THROTTLE_WINDOW_RESET_MS = 61_000;
let lastLoginAt = 0;

export async function reserveLoginSlot(): Promise<void> {
  const wait = lastLoginAt + MIN_LOGIN_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastLoginAt = Date.now();
}

async function fillAndSubmit(page: Page): Promise<void> {
  const email = page.locator(
    'input[type="email"], input[name="email"], input[placeholder*="E-posta"]',
  );
  const password = page.locator('input[type="password"]');
  await email.fill(ADMIN_EMAIL);
  await password.fill(ADMIN_PASSWORD);
  await reserveLoginSlot();
  await page
    .locator('button[type="submit"], button:has-text("Giriş Yap")')
    .first()
    .click();
}

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  await fillAndSubmit(page);
  try {
    await page.waitForURL(/\/app\//, { timeout: 20000 });
  } catch {
    // Likely a 429: back off past the throttle window and try once more.
    await page.waitForTimeout(THROTTLE_WINDOW_RESET_MS);
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    await fillAndSubmit(page);
    await page.waitForURL(/\/app\//, { timeout: 20000 });
  }
}
