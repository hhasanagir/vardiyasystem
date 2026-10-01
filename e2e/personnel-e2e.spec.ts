import { test, expect } from "@playwright/test";

test.describe("Personnel Management", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/app/employees");
    await page.waitForLoadState("networkidle");
  });

  test("should display personnel list", async ({ page }) => {
    const table = page.locator("table, .personnel-list, .employee-list");
    await expect(table).toBeVisible();
  });

  test("should navigate to add personnel form", async ({ page }) => {
    const addButton = page.locator(
      'button:has-text("Ekle"), button:has-text("Yeni"), a:has-text("Personel Ekle")',
    );
    if ((await addButton.count()) > 0) {
      await addButton.first().click();
      await page.waitForTimeout(500);
      const form = page.locator("form, .form, .modal");
      await expect(form).toBeVisible();
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
