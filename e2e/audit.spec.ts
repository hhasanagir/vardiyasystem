import { test, expect } from "@playwright/test";

test.describe("Audit Timeline", () => {
  test("should load audit timeline page", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const heading = page.locator(
      'h1:has-text("Denetim"), h2:has-text("Denetim")',
    );
    await expect(heading).toBeVisible();
  });

  test("should display timeline entries", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const timeline = page.locator(".timeline-entries, .audit-list, .log-list");
    await expect(timeline).toBeVisible();
  });

  test("should have filter controls", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const filter = page.locator(".filter-bar, .filters, .audit-filters");
    await expect(filter).toBeVisible();
  });

  test("should show suspicious activities section", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const suspicious = page.locator("text=Şüpheli");
    await expect(suspicious).toBeVisible();
  });

  test("should have refresh button", async ({ page }) => {
    await page.goto("/app/audit");
    await page.waitForLoadState("networkidle");
    const refreshBtn = page.locator('button:has-text("Yenile")');
    await expect(refreshBtn).toBeVisible();
  });
});
