import { test, expect } from "@playwright/test";

test.describe("Live Tracking & WebSocket", () => {
  test("should load live tracking page", async ({ page }) => {
    await page.goto("/app/live-tracking");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible();
  });

  test("should display unit tabs on live tracking", async ({ page }) => {
    await page.goto("/app/live-tracking");
    await page.waitForLoadState("networkidle");
    const unitTabs = page.locator(
      'button:has-text("MR"), button:has-text("BT"), button:has-text("RÖ")',
    );
    await expect(unitTabs.first()).toBeVisible();
  });
});
