import { test, expect } from "@playwright/test";
import { login } from "./helpers";

test.describe("Audit Center", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("should load audit page", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const table = page.locator(".audit-table");
    await expect(table).toBeVisible();
  });

  test("should display audit entries", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const firstRow = page.locator(".audit-table tbody tr").first();
    await expect(firstRow).toBeVisible();
  });

  test("should have filter controls", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const filter = page.locator(".filter-grid");
    await expect(filter).toBeVisible();
  });

  test("should support filtering by activity status", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const statusFilter = page
      .locator(".filter-grid select")
      .filter({ has: page.locator("option", { hasText: "Başarısız" }) });
    await expect(statusFilter).toBeVisible();
  });
});
