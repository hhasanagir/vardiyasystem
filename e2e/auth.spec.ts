import { test, expect } from "@playwright/test";

test.describe("Authentication", () => {
  test("should show login page", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const loginForm = page.locator("form, .login-form, .auth-form");
    await expect(loginForm).toBeVisible();
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="Email"]',
    );
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitButton = page.locator(
      'button[type="submit"], button:has-text("Giriş")',
    );
    if ((await emailInput.count()) > 0) {
      await emailInput.fill("wrong@email.com");
      await passwordInput.fill("wrongpass");
      await submitButton.click();
      await page.waitForTimeout(1000);
      const error = page.locator(
        ".p-toast-message-error, .error-message, .alert-error, .toast-error",
      );
      await expect(error).toBeVisible();
    }
  });

  test("should redirect to dashboard after login", async ({ page }) => {
    await page.goto("/login");
    await page.waitForLoadState("networkidle");
    const emailInput = page.locator(
      'input[type="email"], input[name="email"], input[placeholder*="Email"]',
    );
    const passwordInput = page.locator(
      'input[type="password"], input[name="password"]',
    );
    const submitButton = page.locator(
      'button[type="submit"], button:has-text("Giriş")',
    );
    if ((await emailInput.count()) > 0) {
      await emailInput.fill("admin@hospital.com");
      await passwordInput.fill("admin123");
      await submitButton.click();
      await page.waitForURL(/dashboard/, { timeout: 5000 }).catch(() => {});
      expect(page.url()).toContain("dashboard");
    }
  });

  test("should redirect unauthenticated users to login", async ({ page }) => {
    await page.goto("/app/dashboard");
    await page.waitForLoadState("networkidle");
    expect(page.url()).not.toContain("dashboard");
  });
});
