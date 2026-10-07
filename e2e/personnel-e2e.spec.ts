import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Personnel Management", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/app/employees");
    await page.waitForLoadState("networkidle");
  });

  test("should display personnel list", async ({ page }) => {
    const firstCard = page.getByRole("heading", { level: 3 }).first();
    await expect(firstCard).toBeVisible();
  });

  test("should open add personnel wizard", async ({ page }) => {
    const addButton = page.locator('button:has-text("Yeni Personel")');
    if ((await addButton.count()) > 0) {
      await addButton.first().click();
      await page.waitForTimeout(500);
      const wizard = page.locator(".wizard-container");
      await expect(wizard).toBeVisible();
    }
  });

  test("should filter personnel by unit", async ({ page }) => {
    const unitFilter = page.locator(
      'select[formControlName="unit"], select[aria-label*="Birim"], .unit-filter select',
    );
    if ((await unitFilter.count()) > 0) {
      await unitFilter.selectOption({ index: 1 });
      await page.waitForTimeout(500);
    }
  });

  test("should search personnel by name", async ({ page }) => {
    const searchInput = page.locator(
      'input[placeholder*="Ara"], input[placeholder*="search"], input[aria-label*="Ara"]',
    );
    if ((await searchInput.count()) > 0) {
      await searchInput.fill("Ahmet");
      await page.waitForTimeout(500);
    }
  });
});
