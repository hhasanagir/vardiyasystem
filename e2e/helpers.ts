import type { Page } from "@playwright/test";

export const ADMIN_EMAIL = "admin@hospital.com";
export const ADMIN_PASSWORD = "admin123";

export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  const email = page.locator(
    'input[type="email"], input[name="email"], input[placeholder*="E-posta"]',
  );
  const password = page.locator('input[type="password"]');
  await email.fill(ADMIN_EMAIL);
  await password.fill(ADMIN_PASSWORD);
  await page
    .locator('button[type="submit"], button:has-text("Giriş Yap")')
    .first()
    .click();
  await page.waitForURL(/\/app\//, { timeout: 20000 });
}
